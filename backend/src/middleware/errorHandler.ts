import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { FutureDateError, HabitNotFoundError } from "../errors/ruleErrors.js";
import { ApiError } from "../errors/apiError.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "not_found",
      message: `No route for ${req.method} ${req.path}`,
    },
  });
};

function toApiError(err: unknown): ApiError | null {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.badRequest(
      "Request validation failed.",
      err.issues.map((issue) => ({
        field: issue.path.join(".") || "(body)",
        message: issue.message,
      })),
    );
  }

  if (err instanceof HabitNotFoundError) return ApiError.notFound(err.message);
  if (err instanceof FutureDateError) return ApiError.badRequest(err.message);

  return null;
}

// Express identifies error handlers by arity, so `next` has to stay.
export const errorHandler: ErrorRequestHandler = (rawError, _req, res, _next) => {
  const err = toApiError(rawError) ?? rawError;

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Unexpected: log the whole thing server-side, tell the client nothing.
  // A stack trace in the response body hands an attacker the file layout,
  // dependency versions, and often the failing query.
  console.error("Unhandled error while serving request", err);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong." },
  });
};
