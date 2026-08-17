import { config } from "../config.js";
import { toDateColumn } from "../db/mapping.js";
import { prisma } from "../db/prisma.js";
import { addDays, todayIn } from "../utils/dates.js";

const DEMO_USER = process.env["SEED_USER_ID"] ?? "demo-user";

const today = todayIn(config.APP_TIMEZONE);

// Which of the last 14 days each habit was done on (0 = today).
const plan = [
  {
    name: "Sleep 8 hours",
    unit: "hours",
    target: 8,
    value: 8,
    done: [1, 2, 3, 5, 6, 8, 9, 12],
  },
  {
    name: "Exercise",
    unit: "minutes",
    target: 30,
    value: 35,
    done: [0, 1, 2, 3, 4, 5, 7, 10],
  },
  {
    name: "Drink water",
    unit: "glasses",
    target: 8,
    value: 9,
    done: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  { name: "Read", unit: "pages", target: 20, value: 24, done: [2, 4, 9] },
];

// The logs go with them: habit_logs cascades on delete.
await prisma.habit.deleteMany({ where: { userId: DEMO_USER } });

for (const entry of plan) {
  const habit = await prisma.habit.create({
    data: {
      userId: DEMO_USER,
      name: entry.name,
      unit: entry.unit,
      target: entry.target,
    },
  });

  for (const offset of entry.done) {
    await prisma.habitLog.create({
      data: {
        userId: DEMO_USER,
        habitId: habit.id,
        logDate: toDateColumn(addDays(today, -offset)),
        value: entry.value,
      },
    });
  }

  console.log(`Seeded "${habit.name}" with ${entry.done.length} logs.`);
}

console.log(`\nDone. Open the dashboard as user "${DEMO_USER}".`);
await prisma.$disconnect();
