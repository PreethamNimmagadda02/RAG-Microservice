import type { Request, Response, NextFunction } from "express";
import { hrtimeNow, hrtimeToMs } from "../lib/timing.js";

/**
 * Request logging middleware.
 *
 * Logs: METHOD PATH STATUS_CODE LATENCY_MS
 * Example: POST /query 200 342ms
 *
 * Uses the shared timing utility for sub-millisecond precision.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = hrtimeNow();

  // Hook into the response finish event to capture status code and timing
  res.on("finish", () => {
    const durationMs = hrtimeToMs(start);

    const log = [
      req.method,
      req.originalUrl,
      res.statusCode,
      `${durationMs}ms`,
    ].join(" ");

    console.log(`[${new Date().toISOString()}] ${log}`);
  });

  next();
}
