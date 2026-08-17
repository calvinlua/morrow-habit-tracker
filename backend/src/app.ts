import express, { type Express } from "express";
import { currentUser } from "./middleware/currentUser.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/apiRouter.js";

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: "64kb" }));

  // Unauthenticated: used by the dev tooling to wait for the API to be up.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", currentUser, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
