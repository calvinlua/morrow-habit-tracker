import { Router } from "express";
import * as habitController from "../controllers/habitController.js";

/**
 * The URL map, and nothing else.
 *
 * Keeping it to one line per route means the answer to "what does this API
 * expose?" is a file you can read in ten seconds, and adding an endpoint is a
 * decision about paths rather than an edit inside a wall of handler bodies.
 */
export const apiRouter = Router();

apiRouter.get("/habits", habitController.listHabits);
apiRouter.post("/habits", habitController.createHabit);
apiRouter.get("/dashboard", habitController.getDashboard);
apiRouter.post("/logs", habitController.logHabit);
