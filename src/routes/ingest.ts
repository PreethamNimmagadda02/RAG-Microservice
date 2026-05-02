import { Router } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { z } from "zod";
import { chunkFAQs } from "../lib/chunker.js";
import { embedBatch } from "../lib/embeddings.js";
import { hrtimeNow, hrtimeToMs } from "../lib/timing.js";
import { vectorStore } from "../lib/vectorStore.js";
import { ingestRateLimiter } from "../middleware/rateLimiter.js";
import { VALID_CATEGORIES } from "../types.js";
import type { IngestResponse } from "../types.js";

const router = Router();

/**
 * Zod schema for validating individual FAQ items from beem_faqs.json.
 *
 * Ensures each item has a non-empty id, a valid category, and non-empty
 * question/answer strings. Catches malformed or tampered data at ingest
 * time rather than silently corrupting the vector store.
 */
const FAQItemSchema = z.object({
  id: z
    .string()
    .min(1, "FAQ item 'id' must be a non-empty string."),
  // z.enum produces FAQCategory — no cast or refine needed,
  // and the parsed type aligns directly with the FAQItem interface.
  category: z.enum(VALID_CATEGORIES, {
    error: `FAQ item 'category' must be one of: ${VALID_CATEGORIES.join(", ")}.`,
  }),
  question: z
    .string()
    .min(1, "FAQ item 'question' must be a non-empty string."),
  answer: z
    .string()
    .min(1, "FAQ item 'answer' must be a non-empty string."),
});

/**
 * Zod schema for the entire FAQ array.
 * Validates that beem_faqs.json is a non-empty array of valid FAQ items.
 */
const FAQArraySchema = z
  .array(FAQItemSchema)
  .min(1, "FAQ data must contain at least one item.");

/**
 * POST /ingest
 *
 * Reads the FAQ data from data/beem_faqs.json, validates the structure via
 * Zod, chunks each item as "Q+A", generates embeddings via DeepInfra
 * (BAAI/bge-large-en-v1.5), and stores them in the in-memory vector store.
 *
 * IDEMPOTENCY: Uses each FAQ's `id` as the Map key. Re-calling this endpoint
 * overwrites existing entries rather than duplicating them, ensuring the
 * document count stays at 20 regardless of how many times /ingest is called.
 *
 * VALIDATION: The FAQ JSON is validated at runtime via Zod — malformed or
 * tampered data is rejected with a descriptive 400 error before any
 * embedding calls are made, preventing silent corruption of the vector store.
 */
router.post("/ingest", ingestRateLimiter, async (_req, res): Promise<void> => {
  const start = hrtimeNow();

  try {
    // Read FAQ data (async — does not block the event loop)
    const faqPath = resolve(process.cwd(), "data", "beem_faqs.json");
    const rawData = await readFile(faqPath, "utf-8");

    // Parse and validate FAQ data via Zod.
    // Catches: invalid JSON, wrong types, missing fields, unknown categories.
    let jsonData: unknown;
    try {
      jsonData = JSON.parse(rawData) as unknown;
    } catch {
      res.status(400).json({
        error: "Invalid JSON in data/beem_faqs.json.",
        details: "The FAQ data file contains malformed JSON.",
        latency_ms: hrtimeToMs(start),
      });
      return;
    }

    const parsed = FAQArraySchema.safeParse(jsonData);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({
        error: "FAQ data validation failed.",
        details: firstError ? `${firstError.path.join(".")}: ${firstError.message}` : "Unknown validation error",
        latency_ms: hrtimeToMs(start),
      });
      return;
    }

    const faqs = parsed.data;

    // Chunk: each FAQ becomes one "Q: ...\nA: ..." document
    const chunks = chunkFAQs(faqs);

    // Embed all chunks in parallel batch
    const texts = chunks.map((c) => c.text);
    const embeddings = await embedBatch(texts);

    // Store in vector store (upsert for idempotency).
    // Bounds-check: verify the API returned one embedding per chunk
    // before indexing — guards against unexpected truncated responses.
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}. ` +
          "The embedding API returned fewer vectors than inputs."
      );
    }

    chunks.forEach((chunk, index) => {
      // Non-null assertion is safe here: the length check above guarantees
      // embeddings[index] is defined for every valid index.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      vectorStore.upsert({
        id: chunk.id,
        embedding: embeddings[index]!,
        text: chunk.text,
        metadata: chunk.metadata,
      });
    });

    const response: IngestResponse = {
      message: `Successfully ingested ${chunks.length} FAQ documents`,
      document_count: vectorStore.count(),
      latency_ms: hrtimeToMs(start),
    };

    res.json(response);
  } catch (error) {
    console.error("Ingest error:", error);
    res.status(500).json({
      error: "Failed to ingest FAQ data",
      details: error instanceof Error ? error.message : "Unknown error",
      latency_ms: hrtimeToMs(start),
    });
  }
});

export default router;
