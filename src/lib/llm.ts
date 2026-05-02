import type { SearchResult } from "../types.js";
import { deepinfraClient } from "./client.js";

/**
 * Uses the shared DeepInfra client from client.ts — no duplicate instantiation.
 */
const LLM_MODEL = process.env.LLM_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct";

/**
 * System prompt that enforces grounded, non-hallucinating behavior.
 *
 * Key constraints:
 * - Answer ONLY from the provided FAQ context
 * - Cite source IDs (e.g., FAQ-001) used in the answer
 * - Refuse gracefully when context is insufficient
 * - Never fabricate account details, policies, or features
 */
const SYSTEM_PROMPT = `You are Beem's intelligent FAQ assistant. Your role is to answer user questions about Beem's products and services accurately and helpfully.

STRICT RULES:
1. Answer ONLY based on the FAQ context provided below. Do not use any external knowledge.
2. If the provided context does not contain enough information to answer the question, say: "I don't have enough information in our FAQ to answer that question. Please contact Beem support for further assistance."
3. Never fabricate account details, policies, interest rates, fees, or features that are not explicitly stated in the context.
4. Be concise but thorough. Use natural, friendly language appropriate for a fintech support assistant.
5. When multiple FAQ entries are relevant, synthesize the information into a coherent answer rather than listing them separately.
6. Do not reference the FAQ IDs or internal structure in your response to the user — speak naturally as if you know this information.`;

/**
 * Generate a grounded answer using DeepInfra with retrieved FAQ context.
 *
 * @param question - The user's original question
 * @param contexts - Retrieved FAQ chunks ranked by relevance
 * @returns The generated answer string
 */
export async function generateAnswer(
  question: string,
  contexts: SearchResult[]
): Promise<string> {
  // Format retrieved context with source IDs for traceability
  const contextBlock = contexts
    .map(
      (ctx, i) =>
        `[Source ${i + 1} — ${ctx.id}] (Category: ${ctx.metadata.category})\n${ctx.text}`
    )
    .join("\n\n---\n\n");

  const userPrompt = `FAQ CONTEXT:
${contextBlock}

USER QUESTION:
${question}

Provide a helpful, accurate answer based solely on the FAQ context above.`;

  const response = await deepinfraClient.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1, // Low temperature for more deterministic, grounded answers
  });

  return response.choices[0]?.message?.content ?? "Failed to generate answer.";
}
