import type { VectorEntry, SearchResult } from "../types.js";

/**
 * In-memory vector store using a Map keyed by document ID.
 *
 * Design decisions:
 * - Map<string, VectorEntry> gives O(1) upsert/dedup by FAQ ID (idempotency).
 * - Cosine similarity is computed via hand-rolled dot product — no external DB needed.
 * - For 20 FAQ items, brute-force search is optimal (no indexing overhead).
 */
export class VectorStore {
  private store: Map<string, VectorEntry> = new Map();

  /**
   * Insert or update a vector entry. Using the FAQ ID as key ensures
   * idempotent ingestion — calling /ingest twice won't duplicate entries.
   */
  upsert(entry: VectorEntry): void {
    this.store.set(entry.id, entry);
  }

  /**
   * Search for the top-k most similar documents to the query embedding.
   * Optionally pre-filter by category metadata before computing similarity.
   *
   * Results with a cosine similarity score below `minScore` are excluded.
   * This prevents the LLM from receiving irrelevant context when a question
   * falls outside the knowledge base — avoiding hallucination on empty context.
   *
   * @param queryEmbedding - The embedding vector of the user's question
   * @param topK - Number of results to return
   * @param categoryFilter - Optional category to filter by before ranking
   * @param minScore - Minimum cosine similarity score (default: 0.4)
   */
  search(
    queryEmbedding: number[],
    topK: number,
    categoryFilter?: string,
    minScore: number = 0.4
  ): SearchResult[] {
    // Validate embedding dimensions against the stored vectors.
    // Uses a safe iterator pattern instead of a non-null assertion.
    const firstEntry = this.store.values().next();
    if (!firstEntry.done) {
      const sampleDim = firstEntry.value.embedding.length;
      if (queryEmbedding.length !== sampleDim) {
        throw new Error(
          `Embedding dimension mismatch: Query is ${queryEmbedding.length}-dim, but vector store is ${sampleDim}-dim. Did the EMBEDDING_MODEL change?`
        );
      }
    }

    let candidates = Array.from(this.store.values());

    // Pre-retrieval metadata filtering: narrows the candidate pool
    // before similarity computation, improving relevance when users
    // want answers from a specific product category.
    if (categoryFilter) {
      candidates = candidates.filter(
        (entry) =>
          entry.metadata.category.toLowerCase() ===
          categoryFilter.toLowerCase()
      );
    }

    const scored = candidates
      .map((entry) => ({
        id: entry.id,
        text: entry.text,
        score: this.cosineSimilarity(queryEmbedding, entry.embedding),
        metadata: entry.metadata,
      }))
      // Filter out chunks that don't meet the minimum relevance bar.
      // Without this guard, off-topic queries still get "answered" using
      // the least-irrelevant chunks, which leads to hallucination.
      .filter((entry) => entry.score >= minScore);

    // Sort descending by similarity score and take top-k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Returns the total number of documents in the store.
   */
  count(): number {
    return this.store.size;
  }

  /**
   * Clears all entries from the store.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Cosine similarity between two vectors.
   *
   * cos(a, b) = (a · b) / (||a|| × ||b||)
   *
   * Returns a value in [-1, 1] where 1 = identical direction,
   * 0 = orthogonal, -1 = opposite direction.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(
        `Vector dimension mismatch: ${a.length} vs ${b.length}`
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      // The non-null assertion is safe here because we loop up to a.length
      // and we previously checked that a.length === b.length.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const valA = a[i]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const valB = b[i]!;

      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}

// Singleton instance shared across the application
export const vectorStore = new VectorStore();
