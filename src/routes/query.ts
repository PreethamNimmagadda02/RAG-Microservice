import { Router } from "express";
import { z } from "zod";
import { embedText } from "../lib/embeddings.js";
import { generateAnswer } from "../lib/llm.js";
import { hrtimeNow, hrtimeToMs } from "../lib/timing.js";
import { vectorStore } from "../lib/vectorStore.js";
import { queryRateLimiter } from "../middleware/rateLimiter.js";
import { VALID_CATEGORIES } from "../types.js";
import type { QueryResponse } from "../types.js";

const router = Router();

const DEFAULT_TOP_K = parseInt(process.env.TOP_K_DEFAULT || "3", 10);
const MIN_SCORE = parseFloat(process.env.MIN_SCORE || "0.4");

/**
 * Zod schema for POST /query request body.
 *
 * Replaces manual type guards with a single declarative schema that
 * validates AND narrows the type in one step — no `as` casts needed.
 */
const QueryRequestSchema = z.object({
  question: z
    .string({ error: "Missing 'question': must be a non-empty string." })
    .trim()
    .min(1, "Invalid 'question': must be a non-empty string."),
  top_k: z
    .number()
    .int("Invalid 'top_k': must be an integer between 1 and 20.")
    .min(1, "Invalid 'top_k': must be an integer between 1 and 20.")
    .max(20, "Invalid 'top_k': must be an integer between 1 and 20.")
    .optional(),
  category: z
    .enum(VALID_CATEGORIES, {
      error: `Invalid 'category': must be one of ${VALID_CATEGORIES.map((c) => `"${c}"`).join(", ")}.`,
    })
    .optional(),
});

/**
 * POST /query
 *
 * Accepts a user question, retrieves top-k relevant FAQ chunks via cosine
 * similarity (above the minimum threshold), passes them as context to
 * Meta-Llama-3-8B-Instruct via DeepInfra, and returns a grounded answer
 * with source attribution.
 *
 * Optional `category` parameter enables metadata pre-filtering —
 * narrowing retrieval to a specific product category before ranking.
 *
 * Returns 400 when no chunks pass the relevance threshold, preventing the
 * LLM from generating hallucinated answers on empty context.
 *
 * The `latency_ms` field reflects actual wall-clock time for the
 * complete pipeline: embed → search → generate.
 */
router.post("/query", queryRateLimiter, async (req, res): Promise<void> => {
  const start = hrtimeNow();

  try {
    // Validate and parse the request body using the Zod schema.
    // On success, `parsed` is fully typed — no `as` casts needed downstream.
    const parsed = QueryRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      // Return the first validation error as a clean 400 response.
      const firstError = parsed.error.issues[0];
      res.status(400).json({
        error: firstError?.message || "Validation failed",
      });
      return;
    }

    const { question, top_k, category } = parsed.data;

    // Check if vector store has been populated
    if (vectorStore.count() === 0) {
      res.status(503).json({
        error:
          "Vector store is empty. Call POST /ingest first to populate the knowledge base.",
      });
      return;
    }

    const k = top_k ?? DEFAULT_TOP_K;

    // Step 1: Embed the user's question
    const queryEmbedding = await embedText(question);

    // Step 2: Retrieve top-k similar FAQ chunks above the relevance threshold
    // (with optional category pre-filter)
    const results = vectorStore.search(queryEmbedding, k, category, MIN_SCORE);

    // Step 3: Generate grounded answer using retrieved context.
    // If no chunks meet the minimum relevance threshold, short-circuit the
    // LLM call and return a canned response to save latency and API costs.
    let answer: string;
    if (results.length === 0) {
      answer = "I don't have enough information in our FAQ to answer that question. Please contact Beem support for further assistance.";
    } else {
      answer = await generateAnswer(question, results);
    }

    // Extract source IDs and their relevance scores for observability
    const sources = results.map((r) => r.id);
    const scores = results.map((r) => Math.round(r.score * 1000) / 1000);

    const response: QueryResponse = {
      answer,
      sources,
      scores,
      latency_ms: hrtimeToMs(start),
    };

    res.json(response);
  } catch (error) {
    console.error("Query error:", error);
    res.status(500).json({
      error: "Failed to process query",
      details: error instanceof Error ? error.message : "Unknown error",
      latency_ms: hrtimeToMs(start),
    });
  }
});

export default router;
