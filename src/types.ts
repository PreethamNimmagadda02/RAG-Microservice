/**
 * Valid FAQ categories — kept in sync with data/beem_faqs.json.
 * Used for both runtime validation in routes and the Swagger enum.
 */
export const VALID_CATEGORIES = [
  "everdraft",
  "direct_deposit",
  "credit_building",
  "cashback",
  "account_management",
  "security",
  "eligibility",
] as const;

export type FAQCategory = (typeof VALID_CATEGORIES)[number];

/**
 * Raw FAQ item as read from data/beem_faqs.json.
 * `category` is narrowed to `FAQCategory` so any out-of-range value is
 * caught at compile time rather than only at Zod runtime validation.
 */
export interface FAQItem {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
}

/**
 * A chunked document ready for embedding.
 * Each FAQ item becomes one chunk with Q+A as the text content.
 */
export interface ChunkedDocument {
  id: string;
  text: string;
  metadata: {
    category: FAQCategory;
    question: string;
  };
}

/**
 * A vector entry stored in the in-memory vector store.
 */
export interface VectorEntry {
  id: string;
  embedding: number[];
  text: string;
  metadata: {
    category: FAQCategory;
    question: string;
  };
}

/**
 * Search result returned from vector store similarity search.
 */
export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: {
    category: FAQCategory;
    question: string;
  };
}

/**
 * Request body for POST /query
 */
export interface QueryRequest {
  question: string;
  top_k?: number;
  category?: string;
}

/**
 * Response body for POST /query
 */
export interface QueryResponse {
  answer: string;
  sources: string[];
  scores: number[];
  latency_ms: number;
}

/**
 * Shared error response shape for all 4xx/5xx responses.
 */
export interface ErrorResponse {
  error: string;
  details?: string;
  latency_ms?: number;
}

/**
 * Response body for POST /ingest
 */
export interface IngestResponse {
  message: string;
  document_count: number;
  latency_ms: number;
}

/**
 * Response body for GET /health
 */
export interface HealthResponse {
  status: "ok" | "error";
  document_count: number;
  uptime_seconds: number;
}
