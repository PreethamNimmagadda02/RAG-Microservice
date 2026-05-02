import rateLimit from "express-rate-limit";

/**
 * Rate limiting middleware using express-rate-limit.
 *
 * Protects external-API-calling endpoints (/query, /ingest) from abuse
 * and runaway costs. Each limiter is configured independently so that
 * heavy query traffic doesn't block lightweight ingestion calls.
 *
 * Configuration is driven by environment variables with sensible defaults:
 *   RATE_LIMIT_QUERY_WINDOW_MS   — sliding window duration (default: 60 000 ms = 1 min)
 *   RATE_LIMIT_QUERY_MAX         — max requests per window   (default: 20)
 *   RATE_LIMIT_INGEST_WINDOW_MS  — sliding window duration (default: 60 000 ms = 1 min)
 *   RATE_LIMIT_INGEST_MAX        — max requests per window   (default: 5)
 *
 * Returns a standard 429 Too Many Requests JSON response that matches
 * the project's ErrorResponse shape.
 */

/**
 * Rate limiter for POST /query.
 *
 * /query triggers both an embedding API call AND an LLM generation call
 * per request, so it is the most expensive endpoint cost-wise.
 * Default: 20 requests per minute per IP.
 */
export const queryRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_QUERY_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RATE_LIMIT_QUERY_MAX || "20", 10),
  standardHeaders: true, // Return `RateLimit-*` headers (draft-6)
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: "Too many requests. Please try again later.",
    details: "Rate limit exceeded for /query. Default limit: 20 requests per minute.",
  },
});

/**
 * Rate limiter for POST /ingest.
 *
 * /ingest re-embeds the entire FAQ corpus on each call (20 texts × 1 API call).
 * Frequent re-ingestion is unnecessary (data is static), so a tighter limit
 * prevents accidental loops or misuse.
 * Default: 5 requests per minute per IP.
 */
export const ingestRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_INGEST_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RATE_LIMIT_INGEST_MAX || "5", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again later.",
    details: "Rate limit exceeded for /ingest. Default limit: 5 requests per minute.",
  },
});
