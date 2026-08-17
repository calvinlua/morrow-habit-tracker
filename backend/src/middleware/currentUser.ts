import type { RequestHandler } from "express";
import { ApiError } from "../errors/apiError.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

/**
 * Stand-in for authentication.
 *
 * The caller's identity arrives in a header and is trusted, which is fine for
 * an exercise and unacceptable in production — see the README. The point of
 * putting it here is that every route reads `req.userId` and none of them read
 * a user id out of the query string or body, so replacing this with real JWT
 * verification changes this file and nothing else.
 */
export const currentUser: RequestHandler = (req, _res, next) => {
  const header = req.header("x-user-id")?.trim();
  if (!header) {
    throw ApiError.unauthorized("Missing X-User-Id header.");
  }
  req.userId = header;
  next();
};
