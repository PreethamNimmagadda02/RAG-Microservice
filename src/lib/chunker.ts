import type { FAQItem, ChunkedDocument } from "../types.js";

/**
 * Chunks FAQ items into embeddable documents.
 *
 * CHUNKING STRATEGY RATIONALE:
 *
 * Each FAQ item becomes ONE chunk containing "Q: {question}\nA: {answer}".
 *
 * Why Q+A together (not question-only or answer-only)?
 * - Embedding Q+A together captures the full semantic relationship. A user
 *   query like "how do I get cash advance?" has high similarity to a chunk
 *   containing both "What is Everdraft?" (similar interrogative framing) AND
 *   the answer explaining the cash advance process.
 * - Question-only embeddings lose the answer's semantic content.
 * - Answer-only embeddings lose the interrogative framing that aligns with
 *   how users naturally phrase queries.
 *
 * Why no splitting/overlap?
 * - The 20 FAQ answers average ~80 words (~100 tokens each). The embedding
 *   model (BAAI/bge-large-en-v1.5) supports up to 512 tokens per input.
 *   Splitting would fragment meaning without any benefit at this scale.
 *
 * Why category as metadata (not in the embedding)?
 * - Including "Category: everdraft" in the embedded text would add noise to
 *   the semantic vector. Instead, category is stored as metadata for
 *   pre-retrieval filtering — a cleaner separation of concerns.
 *
 * @param faqs - Raw FAQ items from beem_faqs.json
 * @returns Array of chunked documents ready for embedding
 */
export function chunkFAQs(faqs: FAQItem[]): ChunkedDocument[] {
  return faqs.map((faq) => ({
    id: faq.id,
    text: `Q: ${faq.question}\nA: ${faq.answer}`,
    metadata: {
      category: faq.category,
      question: faq.question,
    },
  }));
}
