import { deepinfraClient } from "./client.js";

/**
 * Cloud embedding model using DeepInfra (OpenAI-compatible API).
 *
 * Model: BAAI/bge-large-en-v1.5
 * - State-Of-The-Art embedding model
 * - 1024-dimensional embeddings
 * - Requires DEEPINFRA_API_KEY
 *
 * Uses the shared DeepInfra client from client.ts — no duplicate instantiation.
 */

const MODEL_NAME = process.env.EMBEDDING_MODEL || "BAAI/bge-large-en-v1.5";

/**
 * Embed a single text string using DeepInfra's embedding API.
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await deepinfraClient.embeddings.create({
    model: MODEL_NAME,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Embed multiple texts in a single batch API call.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await deepinfraClient.embeddings.create({
    model: MODEL_NAME,
    input: texts,
  });

  // Ensure results are sorted in the same order as inputs
  response.data.sort((a, b) => a.index - b.index);

  return response.data.map((item) => item.embedding);
}
