import OpenAI from "openai";

/**
 * Shared DeepInfra API client (OpenAI-compatible).
 *
 * Instantiated once and reused across embeddings.ts and llm.ts to avoid
 * creating redundant HTTP clients. Both embedding and generation calls
 * route through the same DeepInfra base URL with the same API key.
 *
 * SAFETY: Asserts that DEEPINFRA_API_KEY is non-empty at import time.
 * index.ts also guards this at startup, but this assertion protects against
 * import in test/script contexts that bypass the main entry point.
 */

const apiKey = process.env.DEEPINFRA_API_KEY;

if (!apiKey) {
  throw new Error(
    "[FATAL] DEEPINFRA_API_KEY is not set. " +
      "Cannot create DeepInfra client. " +
      "Copy .env.example to .env and add your key, then restart."
  );
}

export const deepinfraClient = new OpenAI({
  apiKey,
  baseURL: "https://api.deepinfra.com/v1/openai",
});
