# CODE REVIEW

## BACKEND - server.ts

### 1st bug - production secret directly on code (security vulnerbility)

```ts
const db = mysql.createPool({
  host: "prod-db.internal",
  user: "root",
  password: "Passw0rd1 23!",
  ...
});
```

Issues : Secret like access or credentials for database should not be directly shown in the code. This allow anyone that has access to the code to be able to have the credentials the database directly and allow security breach to the database.

Fix : In production, all the secrets should either be put in the env file where secrets can be contained for the programmers who work on it or put in secrets on gitlab where the secrets are incorporate into the code during CI/CD phase and hashed + private key are selected to not allow leak of secret in the logs of CI/CD.

### 2nd bug - query parameters directly in SQL query (SQL injection)

```ts
await db.query(`SELECT * FROM habits WHERE user_id = ${userId}`);
```

Issue : userID comes directly from the `req.query`. This allow SQL injection to happen and has security vulnerbility issues. For example, if the user types in the search box where habits are search that gives this db query, if the user type `?userId=1 OR 1=1` in the search box, it will dump every habit in the table. Or if they type`?userId=1; DROP TABLE habit_logs; --` ,this will drop the habit log table.
The running application connects as `root` during production, so this will cause a lot of havoc and security issues on the database.

This is the same for these part of code as well :

```ts
const [logs]: any = await db.query(
  `SELECT * FROM habit
logs WHERE habit
_
_
id = ${habit.id} AND log_
date > DATE
_
SUB(NOW(), INTERVAL 7 DAY)`,
);
```

```ts
const [existing]: any = await db.query(
`SELECT id FROM habit
_
_
_
id = ${habitId} AND log_
date = CURDATE()`
logs WHERE user
id = ${userId} AND habit
);
```

```ts
db.query(
  `INSERT INTO habit
logs (user
id, habit
_
_
_
id, value, log_
date) VALUES (${userId}, ${habitId},
'${value}'
,
CURDATE())`,
);
```

where all the parameter in the db query comes straight from the API calls parameters.

Solution: Use database ORM like prisma that automatically build safe parameterized query behind the sceme or use prepared statement to avoid SQL injection.

For example:

```
const userId = req.query.userId as string;

// Use .execute() instead of .query(), and pass the value in an array parameter
const [habits]: any = await db.execute(
  `SELECT * FROM habits WHERE user_id = ?`,
  [userId]
);
```

## Key Changes Made

- **Swapped Interpolation for Placeholders:** Changed `${userId}` inside the SQL string to a safe `?` character.
- **Passed an Array:** Provided `[userId]` as the second argument to `db.execute()`, ensuring the database engine treats the input strictly as data rather than executable SQL.
- **Switched to `execute`:** Recommended utilizing `.execute()` instead of `.query()` for explicit client-side prepared statement handling.

### 3rd bug - `api-dashboard` API call always response with `[]`

```ts
habits.forEach(async (habit) => {
  const [logs] = await db.query(...);
  result.push({ ...habit, logs });
});
res.json(result);

```

Issue: `forEach` ignores the promise its callback returns, so it doesn't wait. `res.json(result)`
runs while `result` is still empty, and the log queries land afterwards, pushing into an
array nobody will ever read.
This is the endpoint the whole feature is built on, and it doesn't
work. It's also why the frontend's rendering bugs (#7, #8) haven't been noticed yet — the
list has been empty the whole time.

Solution: don't loop queries at all. One query for the logs, grouped in memory .This helps to removes the N+1 (a user with 20 habits currently costs 21 round trips):

```ts
const [habits] = await db.query<RowDataPacket[]>(
  "SELECT id, name, target FROM habits WHERE user_id = ?",
  [userId],
);

if (habits.length === 0) return res.json([]);

const [logs] = await db.query<RowDataPacket[]>(
  `SELECT habit_id, log_date, value FROM habit_logs
    WHERE habit_id IN (?) AND log_date >= ?`,
  [habits.map((h) => h.id), sevenDaysAgo],
);

const byHabit = Map.groupBy(logs, (log) => log.habit_id);
res.json(
  habits.map((habit) => ({ ...habit, logs: byHabit.get(habit.id) ?? [] })),
);
```

If you do keep per-habit queries for now, then use `await Promise.all(habits.map(...))` at least
awaits them — and preserves order, which `push` inside concurrent callbacks does not.

### 4th bug - Any user can read and write any other user's data, no check on user identity

`GET /api/dashboard` takes `userId` from the query string and `POST /api/logs` takes it
from the body. Neither checks that the caller _is_ that user, and `POST /api/logs` never
checks that `habitId` belongs to them either. Changing a number in the URL reads someone else's health data — the most
sensitive category we hold. This is the finding I'd expect a security review to fail us on
even if everything else were perfect.

Solution: the client must never be the source of identity. Take it from the authenticated
session and drop `userId` from the request surface entirely:

```ts
app.get("/api/dashboard", requireAuth, async (req, res) => {
  const userId = req.auth.userId;   // from a verified token, not the URL
  ...
});
```

Then scope writes by ownership rather than trusting `habitId`:

```sql
INSERT INTO habit_logs (habit_id, user_id, log_date, value)
SELECT id, user_id, CURDATE(), ? FROM habits WHERE id = ? AND user_id = ?
```

...or read the habit first and 404 if it isn't theirs. Note "404" (Not Found error), not "403" (Forbidden error) . It should not be telling a
stranger that habit 812 exists but isn't theirs is itself a small leak.

### 5th bug - The duplicate check is a race, and nothing in the schema stops duplicates

```ts
const [existing] = await db.query(`SELECT id FROM habit_logs WHERE ... log_date = CURDATE()`);
if (existing.length === 0) {
  db.query(`INSERT INTO habit_logs ...`);
```

Issue : This is a race condition. Check-then-insert with a gap in the middle. Two taps on a slow phone connection, or a
double click, and both requests see no row and both insert. There's no unique constraint
to catch it, so the duplicate is permanent — and it silently inflates completion rates and
streaks, which is the one number this product exists to get right.

Solution: Enforce the rule in database to avoid duplicates, in one statement with no gap:

```sql
ALTER TABLE habit_logs ADD UNIQUE KEY uniq_habit_day (habit_id, log_date);
```

```ts
await db.execute(
  `INSERT INTO habit_logs (habit_id, user_id, log_date, value)
        VALUES (?, ?, CURDATE(), ?)
   ON DUPLICATE KEY UPDATE value = VALUES(value)`,
  [habitId, userId, value],
);
```

### 6th bug - The insert isn't awaited, so "success" means nothing

```ts
db.query(`INSERT INTO habit_logs ...`); // no await
res.json({ success: true });
```

Issue: The habit is logged before the write has happened. If the insert fails
— constraint, deadlock, connection drop — the user has already been told it worked, and in
modern Node the unhandled rejection takes the **whole process** down with it, dropping
every other in-flight request.

Solution: `await` it, and let the error propagate to a real error handler.

### 7th bug - No validation on any input (Most important in nodejs)

Issue : `userId`, `habitId` and `value` are used exactly as they arrive. A missing `?userId`
produces `WHERE user_id = undefined` — a SQL syntax error surfacing as a 500. A missing
`habitId` inserts `NULL`. There's no 404 for a habit that doesn't exist.

Solution : Use a runtime validation library like Zod that can create typed and incorporate validation with typed interface for request params that do validation on runtime instead of compile time. This helps to prevent a lot of validation issue and it makes the code more clearer and concise especially dealing with loosely-type programming language like nodejs based on my experience.

### 8th bug - The error handler returns stack traces, and probably never runs (AI-assisted)

```ts
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.stack });
});
```

Issue : Directly expose the error code to the user and all error fails on 500 without any logging.

Solution : log the detail, return a generic message and a stable error code.

```ts
app.use((err, _req, res, _next) => {
  logger.error({ err }, "request failed");
  res.status(err.status ?? 500).json({ error: { code: "internal_error" } });
});
```

## Frontend - HabitDashboard.tsx

### 1st bug - `useEffect` with no dependency array

```ts
useEffect(() => {
  fetch(`/api/dashboard?userId=${userId}`)
    .then((res) => res.json())
    .then((data) => setHabits(data));
}); // <- no dependency array
```

Issue : No array means it will "run after every render". The fetch resolves, `setHabits` re-renders,
which runs the effect, which fetches again. It's an indefinate loop calling the API for
as long as the tab is open — one user with the dashboard open on a second monitor is a
sustained load test against production.

Solution: Put userId on the dependency array `}, [userId]);` , so it will only run if there is a change in the userId.

### 2nd bug - The habit list is empty until you type in the search box

```ts
useEffect(() => {
  setFiltered(habits.filter((h) => h.name.includes(search)));
}, [search]); // `habits` is missing
```

Issue : The effect only reruns when search changes, so when the fetch resolves and habits fills in, filtered stays `[]` — and filtered is what's rendered. First paint is an empty dashboard until the user types and deletes a character.
The deeper issue is that `filtered` is `derived state`. Storing a value you can compute means you now have to keep two things in sync forever, and this bug is what that costs.
Solution : Fix it adding in habits as well. Now it will show filtered when there is raw data changes like habit. Do it by using the following code:

```ts
const filtered = useMemo(
  () =>
    habits.filter((h) => h.name.toLowerCase().includes(search.toLowerCase())),
  [habits, search],
);
```

Change all to lower case as well to keep the search to be case-insensitve.

### 3rd bug - "Today" is computed in UTC, so streaks are wrong for half the world

One of the most common pitfalls based on my experience is time that is easy to miss.

```ts
d.setDate(d.getDate() - i);
days.push(d.toISOString().slice(0, 10));
```

Issue: `toISOString()` converts to UTC first. For a user in UTC-5, everything after 19:00 local is already "tomorrow" in UTC — so today's log doesn't match today's cell, and the streak silently breaks every evening on the same day. East of UTC the mirror-image bug drops the oldest day. So it becomes a window of moved 168 hours for certain user rather than 7 calendar days. ( backend also has the same issue after i saw this - AI Gemini tell me on that, i did not notice). The streak tracker now is broken for certain users.

Solution: Let a user timezone explicitly at onboarding process when user sign up if the application is target to different user in different country. Then stored at the profile of the user. Define explicitly in code if the user group is only to serve one region of user.

```ts
const today = new Intl.DateTimeFormat("en-CA", { timeZone: userTz }).format(
  new Date(),
); // for example :  timeZone: 'Asia/Singapore'
```

Comparing with `log_date.startsWith(day)` also will cause error for this case because it is not define explicity for the timezone due to this.

### 4th bug: `key={index}` on a filtered list for frontend

```tsx
{filtered.map((habit, index) => <div key={index}>
```

Issue: Indexes describe position, not identity. Filter the list and index 0 becomes a different
habit while React reuses the same DOM node and component state — with a per-row input or
animation, the value visibly lands on the wrong row.

Solution : use `key={habit.id}` for good reference as updated rows for frontend with just index can cause issues on shown list if there are any changes

### 5th bug: Logging a habit doesn't update the UI - AI assisted

`HabitDashboard.tsx`

```ts
const updated = habits;                 // same array, not a copy
updated.find((h) => h.id === habitId)!.logs.push({...});
setHabits(updated);                     // same reference -> React bails out
```

Issue:
`updated` _is_ `habits`. Mutating it and passing the same reference back means React
compares old to new, sees the identical object, and skips the re-render. The user taps
"Log today" and nothing happens. (It may appear to work today only because the loop in #8
re-fetches constantly — fix that bug and this one becomes visible.)

The `!` on `.find()` is a related hazard: if the habit isn't in the list, that's a
`TypeError` on `.logs` and a blank screen, and `!` is exactly what stops TypeScript from
telling you.

_Fix:_ build new objects, and let the server be the source of truth — it's the only thing
that knows what the streak is now:

```ts
const logHabit = async (habitId: number) => {
  const res = await fetch("/api/logs", { method: "POST", ... });
  if (!res.ok) { setError("Could not save that log."); return; }
  await reload();               // refetch; one request, zero divergence
};
```

If you'd rather update optimistically for responsiveness, that's fine — but do it
immutably (`habits.map(h => h.id === habitId ? { ...h, logs: [...h.logs, entry] } : h)`)
and roll it back when the request fails. Right now a failed POST is invisible: it's not
awaited, its errors are unhandled, and the UI has already drawn the happy path.

---

## Minor - AI assisted answer (time constraint)

1. **User emails in application logs.** `console.log(\`User ${email} logged habit...\`)`writes PII to a log aggregator with a long retention and a wide audience. Log`userId`. Also worth asking why the client sends `email` at all — the server can look
   it up, and accepting it invites someone to trust it.

2. **`any` everywhere.** `const [habits]: any`, `(habit: any)`, `(err: any, ...)`. Each
   one switches type checking off at exactly the boundary where the data is least
   trustworthy. `RowDataPacket[]` plus a mapping function to your domain type costs a few
   lines and catches the `value` mismatch in #12 at compile time.

3. **"Already logged" is a 200 with `success: false`.** Two different response shapes
   from one endpoint, and the client has to inspect the body to know what happened. Since
   the operation is idempotent (#5), returning 200 with the resulting state is simpler,
   and a genuine conflict is a 409.

4. **Hardcoded port, no shutdown handling.** `app.listen(3000)` should read `PORT`, and a
   `SIGTERM` handler that drains connections avoids dropped requests on every deploy. A
   `/health` endpoint gives the orchestrator something to probe.

5. **No loading, error or empty state in the UI.** First paint is a blank page; a failed
   request is indistinguishable from "no habits yet". Three small branches, and it's the
   difference between "broken" and "working" for a user on a bad connection.

6. **`completionRate` rebuilds seven `Date` objects per habit per render** and hardcodes
   `7` in three places. Not a performance problem at this size — but this is the
   product's core calculation and it's inline in a component, where it can't be unit
   tested. I'd pull streak/completion into a pure module and test it directly; it's a
   dozen lines and the edge cases (missed today, partial day, DST) are exactly what we'll
   get wrong.

7. **Accessibility.** The search input has a placeholder but no label, the percentage is
   text-only with no `progressbar` role, and the log button is identical for every row to
   a screen reader ("Log today" ×20, no habit name).

8. **Missing operational basics** for a public endpoint: no rate limiting on a write
   route, no `helmet`, no CORS policy, no request timeout on the pool.
