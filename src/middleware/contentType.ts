import type { Request, Response, NextFunction } from "express";

/**
 * Content-Type validation middleware for JSON endpoints.
 *
 * Ensures POST/PUT/PATCH requests include `Content-Type: application/json`.
 * Without this, a form-encoded or plain-text body would be silently
 * ignored by `express.json()`, resulting in an empty `req.body` and a
 * confusing Zod validation error ("missing question") instead of a clear
 * "wrong content type" error.
 *
 * GET/DELETE/HEAD/OPTIONS requests are passed through since they
 * typically don't carry request bodies.
 */
export function requireJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const methodsWithBody = ["POST", "PUT", "PATCH"];

  if (methodsWithBody.includes(req.method.toUpperCase())) {
    // Only enforce Content-Type if the request actually contains a body.
    // Endpoints like /ingest that are POST but have no body should be allowed.
    const hasBody =
      (req.headers["content-length"] && req.headers["content-length"] !== "0") ||
      req.headers["transfer-encoding"];

    if (hasBody) {
      const contentType = req.headers["content-type"];

      if (!contentType || !contentType.includes("application/json")) {
        res.status(415).json({
          error: "Unsupported Media Type.",
          details:
            'Request body must be JSON. Set the "Content-Type: application/json" header.',
        });
        return;
      }
    }
  }

  next();
}
