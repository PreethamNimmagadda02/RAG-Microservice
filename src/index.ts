import "dotenv/config";
import express from "express";
import swaggerUi from "swagger-ui-express";

import { requestLogger } from "./middleware/logger.js";
import { requireJsonContentType } from "./middleware/contentType.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import healthRouter from "./routes/health.js";
import ingestRouter from "./routes/ingest.js";
import queryRouter from "./routes/query.js";
import { swaggerSpec } from "./swagger.js";

// ── Startup validation ────────────────────────────────────
// Fail fast if the required API key is missing rather than letting the
// first embedding/LLM call fail with a cryptic 401 from DeepInfra.
if (!process.env.DEEPINFRA_API_KEY) {
  console.error(
    "[FATAL] DEEPINFRA_API_KEY is not set. " +
    "Copy .env.example to .env and add your key, then restart."
  );
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Middleware ────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(requireJsonContentType);
app.use(requestLogger);

// ── Swagger UI ───────────────────────────────────────────
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── OpenAPI JSON spec (for programmatic access) ──────────
app.get("/openapi.json", (_req, res) => {
  res.json(swaggerSpec);
});

// ── Routes ───────────────────────────────────────────────
app.use(healthRouter);
app.use(ingestRouter);
app.use(queryRouter);

// ── 404 catch-all ────────────────────────────────────────
// Must be after all routes. Returns JSON instead of Express's default HTML.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ─────────────────────────────────
// Must be the LAST middleware registered (4-argument signature).
// Catches body-parser parse failures (malformed JSON) and any other
// unhandled errors thrown in route handlers, returning structured JSON
// instead of Express's default HTML stack-trace page.
app.use(globalErrorHandler);

// ── Process-level safety nets ────────────────────────────
// Prevent silent crashes from unhandled promise rejections or
// uncaught exceptions. Logs the error and exits with a non-zero
// code so the process manager (PM2, Docker, systemd) can restart.
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║          Beem RAG Microservice v1.0.0            ║
╠══════════════════════════════════════════════════╣
║  Server:    http://localhost:${PORT}                ║
║  Swagger:   http://localhost:${PORT}/docs           ║
║  Health:    http://localhost:${PORT}/health         ║
╠══════════════════════════════════════════════════╣
║  LLM:       ${(process.env.LLM_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct").padEnd(35)}  ║
║  Embedding: ${(process.env.EMBEDDING_MODEL || "BAAI/bge-large-en-v1.5").padEnd(35)}  ║
╚══════════════════════════════════════════════════╝
  `);
});

export default app;
