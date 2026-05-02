import { Router } from "express";
import { vectorStore } from "../lib/vectorStore.js";
import type { HealthResponse } from "../types.js";

const router = Router();

/**
 * GET /health
 *
 * Reports service health and vector store document count.
 * Useful for monitoring and readiness probes.
 */
router.get("/health", (_req, res) => {
  const response: HealthResponse = {
    status: "ok",
    document_count: vectorStore.count(),
    uptime_seconds: Math.floor(process.uptime()),
  };

  res.json(response);
});

export default router;
