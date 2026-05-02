import type { Request, Response, NextFunction } from "express";

/**
 * Global Express error-handling middleware.
 *
 * Must be registered AFTER all routes (Express identifies error handlers by
 * their four-argument signature: err, req, res, next).
 *
 * Handles two classes of errors:
 *
 * 1. Malformed JSON (`entity.parse.failed`) — thrown by `express.json()` when
 *    the request body is not valid JSON. Without this handler, Express returns
 *    a raw HTML page containing the internal stack trace, which leaks
 *    filesystem paths and dependency versions.
 *
 * 2. Everything else — falls back to a generic 500 with a safe message.
 *    The original error is logged server-side for debugging but never exposed
 *    to the caller.
 */
export function globalErrorHandler(
  err: Error & { type?: string; status?: number; statusCode?: number },
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // body-parser sets err.type = 'entity.parse.failed' for invalid JSON
  if (err.type === "entity.parse.failed") {
    res.status(400).json({
      error: "Invalid JSON in request body.",
      details: "Ensure the request body is well-formed JSON.",
    });
    return;
  }

  // Log the full error server-side (safe — never sent to client)
  console.error("[ERROR]", err);

  const statusCode = err.status ?? err.statusCode ?? 500;
  res.status(statusCode).json({
    error: "An unexpected error occurred. Please try again later.",
  });
}
