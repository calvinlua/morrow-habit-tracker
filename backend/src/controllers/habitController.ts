import type { RequestHandler } from "express";
import { createHabitSchema, logHabitSchema } from "../schemas/habitSchemas.js";
import * as habitService from "../services/habitService.js";

/**
 * The HTTP edge: parse, delegate, choose a status code.
 *
 * There is no try/catch on purpose. Express 5 forwards a rejected promise to
 * the error handler, so a failure anywhere below — a schema rejection, a broken
 * rule, a dead connection — stops the handler at the `await` and never reaches
 * the `res.json` line under it. One place decides what an error looks like on
 * the wire: `middleware/errorHandler.ts`.
 */

const listHabits: RequestHandler = async (req, res) => {
  res.json({ habits: await habitService.listHabits(req.userId) });
};

const createHabit: RequestHandler = async (req, res) => {
  const input = createHabitSchema.parse(req.body);
  const habit = await habitService.createHabit(req.userId, input);
  res.status(201).json({ habit });
};

const getDashboard: RequestHandler = async (req, res) => {
  res.json(await habitService.getDashboard(req.userId));
};

const logHabit: RequestHandler = async (req, res) => {
  const input = logHabitSchema.parse(req.body);
  const outcome = await habitService.logHabit(req.userId, input);

  // 200 rather than 201 on a repeat: the request succeeded and the day is
  // logged either way. The client does not need to treat it as an error, and a
  // double tap must not produce a double entry.
  res.status(outcome.status === "created" ? 201 : 200).json(outcome);
};

export { listHabits, createHabit, getDashboard, logHabit };
