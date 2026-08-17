import type { DayProgress } from "../lib/types";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const FULL_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * Builds a Date for a YYYY-MM-DD string at *local* noon.
 *
 * `new Date("2024-03-15")` parses as UTC midnight, which in any timezone west
 * of Greenwich renders as the 14th. Noon keeps the label on the right day
 * everywhere, and the value is only ever used for formatting.
 */
function labelDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
}

export function WeekStrip({ days, unit }: { days: DayProgress[]; unit: string }) {
  return (
    <ol className="week-strip">
      {days.map((day) => {
        const date = labelDate(day.date);
        const detail = day.completed
          ? `${day.value} ${unit} — done`
          : day.isFuture
            ? "still to come"
            : day.value > 0
              ? `${day.value} ${unit} — short of target`
              : "nothing logged";

        return (
          <li key={day.date}>
            <span
              className={`day ${day.completed ? "day--done" : day.isFuture ? "day--future" : day.value > 0 ? "day--partial" : ""}`}
              title={`${FULL_DATE.format(date)}: ${detail}`}
            >
              <span aria-hidden="true">{WEEKDAY.format(date)}</span>
              <span className="visually-hidden">{`${FULL_DATE.format(date)}: ${detail}`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
