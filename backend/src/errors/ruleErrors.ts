export class HabitNotFoundError extends Error {
  constructor(readonly habitId: number) {
    super(`No habit ${habitId} for this user.`);
    this.name = "HabitNotFoundError";
  }
}

export class FutureDateError extends Error {
  constructor() {
    super("Cannot log a habit for a future date.");
    this.name = "FutureDateError";
  }
}
