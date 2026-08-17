import { toDateColumn, toIsoDate } from "../src/db/mapping.js";
import type { IsoDate } from "../src/utils/dates.js";
import type { PrismaClient } from "../src/db/prisma.js";

/**
 * An in-memory stand-in for the Prisma client.
 *
 * The service talks to Prisma directly, so this is what keeps the HTTP and
 * service tests running without MySQL. It implements only the queries the
 * service actually makes, and mimics the two behaviours those queries depend
 * on: rows scoped to their owner, and a unique `(habit_id, log_date)` index
 * that rejects a duplicate insert with P2002.
 *
 * Be aware of what it cannot do. It is a bigger fiction than a repository
 * double was — it now has to imitate Prisma's query language as well as the
 * database's behaviour — so a bug in a `where` clause can pass here and fail
 * against MySQL. Real concurrency and real constraints are only proven by the
 * integration tests noted in the README.
 */

interface HabitRow {
  id: number;
  userId: string;
  name: string;
  unit: string;
  target: Decimalish;
  archivedAt: Date | null;
  createdAt: Date;
}

interface LogRow {
  habitId: number;
  userId: string;
  logDate: Date;
  value: number;
  loggedAt: Date;
}

/** Prisma returns DECIMAL as an object, never a number. So does this. */
type Decimalish = { toString(): string };
const decimal = (value: number): Decimalish => ({ toString: () => value.toFixed(2) });

export interface Seed {
  habits?: { userId: string; name: string; unit: string; target: number }[];
  logs?: { habitId: number; userId: string; date: IsoDate; value: number }[];
}

export interface FakePrisma {
  client: PrismaClient;
  /** Every log currently stored, for assertions. */
  logs(): { habitId: number; date: IsoDate; value: number }[];
  habitCount(userId: string): number;
  /** Make every subsequent query fail, for the error-path tests. */
  breakWith(error: Error): void;
}

export function createFakePrisma(seed: Seed = {}): FakePrisma {
  const habits: HabitRow[] = [];
  const logs: LogRow[] = [];
  let nextId = 1;
  let failure: Error | null = null;

  for (const habit of seed.habits ?? []) {
    habits.push({
      id: nextId++,
      userId: habit.userId,
      name: habit.name,
      unit: habit.unit,
      target: decimal(habit.target),
      archivedAt: null,
      createdAt: new Date(),
    });
  }

  for (const log of seed.logs ?? []) {
    logs.push({
      habitId: log.habitId,
      userId: log.userId,
      logDate: toDateColumn(log.date),
      value: log.value,
      loggedAt: new Date(),
    });
  }

  const guard = () => {
    if (failure) throw failure;
  };

  const client = {
    habit: {
      findMany: async ({ where }: any) => {
        guard();
        return habits.filter(
          (habit) => habit.userId === where.userId && habit.archivedAt === where.archivedAt,
        );
      },

      findFirst: async ({ where }: any) => {
        guard();
        return (
          habits.find(
            (habit) =>
              habit.id === where.id &&
              habit.userId === where.userId &&
              habit.archivedAt === where.archivedAt,
          ) ?? null
        );
      },

      create: async ({ data }: any) => {
        guard();
        const row: HabitRow = {
          id: nextId++,
          userId: data.userId,
          name: data.name,
          unit: data.unit,
          target: decimal(data.target),
          archivedAt: null,
          createdAt: new Date(),
        };
        habits.push(row);
        return row;
      },
    },

    habitLog: {
      findMany: async ({ where }: any) => {
        guard();
        return logs.filter(
          (log) =>
            log.userId === where.userId &&
            log.logDate >= where.logDate.gte &&
            log.logDate <= where.logDate.lte,
        );
      },

      create: async ({ data }: any) => {
        guard();
        const clash = logs.find(
          (log) =>
            log.habitId === data.habitId && log.logDate.getTime() === data.logDate.getTime(),
        );
        // What MySQL does with uniq_habit_day, and what the service's
        // insert-then-catch depends on being told.
        if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

        const row: LogRow = { ...data, loggedAt: new Date() };
        logs.push(row);
        return row;
      },

      update: async ({ where, data }: any) => {
        guard();
        const key = where.habitId_logDate;
        const row = logs.find(
          (log) =>
            log.habitId === key.habitId && log.logDate.getTime() === key.logDate.getTime(),
        );
        if (!row) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });

        Object.assign(row, data);
        return row;
      },
    },
  };

  return {
    client: client as unknown as PrismaClient,
    logs: () =>
      logs.map((log) => ({ habitId: log.habitId, date: toIsoDate(log.logDate), value: log.value })),
    habitCount: (userId) => habits.filter((habit) => habit.userId === userId).length,
    breakWith: (error) => {
      failure = error;
    },
  };
}
