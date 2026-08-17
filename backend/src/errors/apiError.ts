export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "bad_request", message, details);
  }

  static unauthorized(message: string): ApiError {
    return new ApiError(401, "unauthorized", message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, "not_found", message);
  }
}
