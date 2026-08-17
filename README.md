# Tool Used in this assignment

- Gemini - Do the code reviews personally first , then do a check with Gemini on miss catch
- Claude - Help on some test and prisma based on the schema i defined, correct me on some code that i failed to catch for some errors and api client class as well as readme to document down the details

# Habit tracker

A small habit-tracking slice: log daily health habits, see your current streaks and this
week's progress.

- **API** — Node 22, Express 5, TypeScript, Prisma 7, MySQL 8
- **Web** — React 19, Vite, TypeScript, axios
- **Tests** — Vitest (97 tests, no database required)

The interesting part of this exercise isn't the CRUD — it's deciding what a "day" is, what
a streak means when today isn't over yet, and making "log today" safe to tap twice. Those
decisions, and the ones I deliberately skipped, are written up below.

---

## Running it locally

Prerequisites: **Node 20+** and **Docker** (Docker only for the database).

### 1. Install

```bash
npm install
```

One install for both workspaces. It also generates the Prisma client, so it must finish
before the backend will start.

### 2. Database — MySQL 8 in Docker

```bash
cp backend/.env.example backend/.env
npm run db:up
npm run db:migrate
npm run db:seed
```

`db:up` starts MySQL on **port 3307** (not 3306, so it won't collide with a MySQL you may
already have running). `db:migrate` creates the tables, `db:seed` adds a demo user with a
fortnight of history so the dashboard has streaks to show.

`.env` lives in `backend/` rather than the repo root because the Prisma CLI resolves it
relative to the directory it runs in, and npm runs workspace scripts from the package
directory.

### 3. Backend — Express API on :3001

```bash
npm run dev:backend
```

### 4. Frontend — Vite on :5173

In a **second terminal**:

```bash
npm run dev:frontend
```

Then open **http://localhost:5173**. The frontend proxies `/api` to the backend, so both
must be running. Add `?user=someone-else` to the URL to see the app as a different (empty)
user.

> Run the backend and frontend in separate terminals. `npm run dev` runs workspace scripts
> **serially**, so it starts the API and then waits on it forever — the frontend never
> starts.

### Stopping and other commands

```bash
npm run db:down    # stop MySQL (add -v to also drop the data volume)
npm run db:studio  # browse the data in Prisma Studio
npm test           # 97 tests, no database needed
npm run typecheck  # both workspaces
```

---

## Layout

```
backend/
  prisma/schema.prisma  two models, one unique index that does a lot of work
  prisma/migrations/    the schema's history, applied with `npm run db:migrate`
  src/routes/           the URL map, one line per endpoint
  src/controllers/      request parsing, status codes
  src/schemas/          zod schemas: the shape of every accepted request body
  src/services/         the rules: ownership, no future logs, dashboard assembly
  src/db/               Prisma client, and DATE/DECIMAL conversion at its boundary
  src/utils/            pure logic: calendar dates, streaks, weekly progress
  src/types/            the shapes the domain passes around
  src/errors/           ApiError, plus the rule errors the service throws
  src/middleware/       identity, error translation
  tests/                unit tests for the pure logic and config + HTTP tests, no database
frontend/
  src/lib/              ApiClient (transport), DashboardApi (endpoints), dashboard hook
  src/components/       habit card, week strip, add-habit form
db/init/                creates the shadow database Prisma migrations need
```

A request falls through three layers, each of which knows one thing:

```
router      which URL     →  controller  what a request looks like
                             service     what the application does, queries included
```

**The service holds the rules and imports no Express.** "You may only log your own habits"
and "you may not log the future" are enforced by throwing `HabitNotFoundError` and
`FutureDateError` from `errors/ruleErrors.ts`. The error handler is the only file that decides
those deserve a 404 and a 400 — so the same service would work behind a CLI or a queue
consumer, and its tests (`tests/habitService.test.ts`) assert behaviour without a single
HTTP status code in them.

**Errors are translated in exactly one place.** Controllers call `schema.parse` and let the
`ZodError` fly; the service throws `HabitNotFoundError` when a habit isn't yours. Neither
knows what status code that becomes — `middleware/errorHandler.ts` turns all of them into
an `ApiError`, and anything it does not recognise is logged in full and answered with a
generic 500 carrying no stack, no SQL and no file paths.

That is also why no handler has a `try/catch`. Express 5 forwards a rejected promise to the
error handler, so a failure stops the controller at its `await` and the `res.json` line
below it never runs — there is no path on which a half-finished write is reported as a
success. `tests/api.test.ts` pins that: a write against a broken connection returns the
generic 500 body and nothing else.

**The domain logic is pure and separate.** Streaks and completion take a habit, its logs
and a date, and return numbers — no database, no clock, no framework. That's what makes
the awkward cases (a missed today, a partial day, a DST boundary) cheap to test, and it's
why the test suite runs in under a second.

**The service owns its queries, and nothing is injected.** There is no repository interface
between the service and Prisma, and no dependency passed down a wiring chain: each module
imports what it needs — the service imports the client and the config, the controller
imports the service, `createApp()` takes no arguments. Reading a file tells you its
dependencies without tracing a constructor argument back up through three callers.

The cost lands on the tests, and it is the honest trade for that readability. Substitution
can no longer happen at a seam, so it happens at the module boundary instead: the suites
`vi.mock` the Prisma client module, freeze `Date` with fake timers to pin "today", and spy
on `console.error` to assert what was logged. That machinery is real, and it lives in the
test files rather than in the application. What they run against
(`tests/fakePrisma.ts`) also has to imitate Prisma's query language as well as the
database's behaviour, including rejecting a duplicate insert with `P2002` — a wrong `where`
clause can pass there and fail against MySQL. Integration tests against real MySQL are the
fix, and they are item 3 in "what I'd do differently".

The earlier version of this code did put a `HabitRepository` interface in that gap, and it
paid for itself once: the first implementation was hand-written SQL over `mysql2`, and
moving to Prisma changed one file plus configuration with every test untouched. Removing it
trades that swappability — a storage change now edits the service — for one less layer to
read through.

---

## Why MySQL (SQL) over MongoDB (NoSQL)

Both would work at this size, and I want to be clear that this is not a "SQL is better"
argument. It's that the specific shape of this feature asks for the things a relational
database gives you by default, and asks for none of the things you'd switch to MongoDB for.

**1. The core correctness rule is a constraint, not application logic.**

```prisma
@@unique([habitId, logDate], map: "uniq_habit_day")
```

"One log per habit per day" is the property this product lives or dies on — it's what makes
a streak count trustworthy. With that index, logging is idempotent without the application
ever doing a read-then-write: two rapid taps, or the same habit logged from a phone and a
laptop at once, produce one row because the database refuses the second. The service
inserts and treats the resulting `P2002` as "already logged today".

MongoDB _can_ enforce this — a unique index on `{habitId, date}` is equivalent, and this is
the one point where the two are genuinely level. What differs is everything around it.

**2. The data is relational, and nothing about it wants to be a document.** A habit owns
its logs; every row is scoped to a user; a log without its habit is meaningless. The
natural Mongo modelling question — embed logs inside the habit document, or keep a separate
collection — has a bad answer either way here. Embedding means an unbounded array that
grows forever (a daily habit is 365 entries a year, and Mongo's 16 MB document limit is a
cliff you eventually hit), plus rewriting the habit document on every log. Not embedding
means a second collection and a manual join, which is the relational model with fewer
guarantees.

**3. The access pattern is a bounded range scan, which is an index's home turf.** The
dashboard reads "this user's logs between two dates" — served directly by
`(user_id, log_date)`. There's no query here that a document store answers better.

**4. Invariants belong in the schema, and MySQL will hold them.** `target > 0` and
`value >= 0` are `CHECK` constraints; `habit_logs.habit_id` is a foreign key that cascades
on delete, so deleting a habit cannot leave orphaned logs. In MongoDB both of those become
application code — schema validation is opt-in and there are no foreign keys — which means
they hold only as long as every writer remembers them. A seed script or a migration that
forgets is enough to corrupt the data.

**5. Nothing here benefits from a flexible document shape.** That is MongoDB's real
strength, and this feature has no use for it: two entities, fixed fields, known queries. A
schemaless store is a good trade when the shape is genuinely uncertain or varies per
record. Here it would buy flexibility I don't need and cost guarantees I do.

**Where MongoDB would win.** If habits grew arbitrary user-defined fields per type (a run
has a distance and a route, a meal has ingredients), or if this were write-heavy telemetry
at a scale where horizontal sharding mattered more than joins, the calculus flips. Neither
is true of a habit tracker with two tables.

**Prisma** earns its place mainly for migrations and types. The schema has a history that
can be replayed on a fresh database, and the row types are generated from it rather than
asserted with `as` at each call site — which is where a `DECIMAL` silently becoming a
string tends to slip through. Two places where I didn't let it drive:

- **`CHECK` constraints aren't expressible in the Prisma schema.** `target > 0` and
  `value >= 0` are real invariants, so the migration was generated with `--create-only`
  and the constraints appended by hand. They're enforced by MySQL and verified there.
- **`upsert` is not what it looks like.** Prisma's `upsert` reads before it writes, which
  reopens the very race the unique index exists to close. The service instead inserts
  and treats the `P2002` unique-constraint error as "already logged today", falling back
  to an update. The database arbitrates; the application just reports what happened.

Prisma 7 also drops the bundled query engine in favour of driver adapters, so the MySQL
connection goes through `@prisma/adapter-mariadb` (it speaks the MySQL wire protocol).

---

## Decisions and assumptions

**A day is a calendar date, not a timestamp.** Logs are stored as `DATE`, and the whole
codebase passes `YYYY-MM-DD` strings rather than `Date` objects. `Date` is genuinely
dangerous here: `new Date().toISOString().slice(0, 10)` is a UTC date, so a user in UTC-5
would find their evening logs landing on tomorrow and their streak breaking every night.
The date helpers are timezone-explicit and directly tested.

The same hazard reappears at the database boundary: Prisma hands back a `DATE` column as a
`Date` pinned to UTC midnight, and reading it with local-time getters shifts the day
backwards west of UTC. The conversion is isolated in `db/mapping.ts` with its own
tests rather than inlined at each call site.

**Which timezone is app-wide, not per-user.** `APP_TIMEZONE` (default `Asia/Singapore`)
decides what "today" means for everyone. Real users travel and live in different places, so
this belongs on the user profile — but that needs a users table and a settings UI, which
isn't this slice. It's one constant, injected in one place, so moving it to the user is a
small change.

**The week runs Monday to Sunday.** The strip shows the calendar week containing today,
not a rolling seven days ending today — a rolling window puts a different weekday in the
first cell every day, which makes "am I better on weekends?" impossible to read at a
glance. Days later in the week are returned with `isFuture: true` and drawn dashed, so an
empty Saturday reads as "not yet" rather than as a miss. `completionRate` is measured
against the whole seven days, so the bar fills as the week progresses; on Monday it is at
most 14%.

**A streak survives today until today is over.** If you completed yesterday and haven't
logged yet today, your streak still shows. Breaking it at midnight would punish someone
for a day they haven't finished living, and every habit app I'd want to use behaves this
way. Today only _adds_ to the streak once it's actually completed.

**Streaks are counted over 90 days.** A longer streak is reported as truncated and the UI
shows `90+` rather than a number the query can't back up. Unbounded history would need
either an ever-growing scan or a maintained counter; neither is worth it here.

**A habit is complete when the day's value reaches its target.** Targets are `DECIMAL` and
per-habit ("8 hours", "30 minutes", "8 glasses"). Posting a log without a value records
the target, so a simple yes/no habit is a single tap.

**Writes are idempotent, and say which happened.** `POST /api/logs` returns 201 for a new
day and 200 for an overwrite. A double tap is a success, not an error.

### Edge cases handled

- Logging the same habit twice on the same day — verified with five concurrent requests
  against real MySQL: one `created`, four `updated`, one row.
- Logging against a habit you don't own → 404, not 403 (a 403 confirms the habit exists).
- Future-dated logs → rejected. Backfilling a past day → allowed.
- Invalid calendar dates (`2023-02-29`), malformed dates, out-of-range windows → 400 with
  the offending field.
- Month, year and DST boundaries in date arithmetic.
- A partially completed day counts toward "logged" but not toward the streak.
- Frontend: loading, error and empty states; a failed write surfaces an error instead of
  leaving an optimistic lie on screen; in-flight requests are aborted when the user
  changes, so a slow response can't overwrite a newer one.
- Unexpected server errors return a generic message; the detail goes to the log.

### Deliberately not handled

- **Authentication.** The single biggest gap, and the one I'd do first — see
  [Authentication](#authentication-what-it-actually-does-and-why) above for what exists
  instead and why.
- **Editing, archiving or deleting habits.** The schema has `archived_at` and the queries
  respect it; there's no endpoint.
- **Pagination.** A user with 500 habits gets 500 habits.
- **Concurrent edits from multiple devices.** Last write wins per day, deliberately.
- **Offline/optimistic UI.** Every write refetches the dashboard. One extra request buys
  the guarantee that the streak on screen is the streak in the database.
- **Timezone changes mid-streak.** If `APP_TIMEZONE` changes, historical days keep the
  dates they were recorded with.
- **Habit reminders, notifications, weekly targets ("4 times a week"), rest days.** All
  reasonable product features; none of them are this slice.

---

## Authentication: what it actually does, and why

**There is no authentication.** The API trusts an `X-User-Id` header. Anyone can send
`X-User-Id: alice` and be Alice — no password, no token, no signature, no expiry. In
production this is a total account takeover by typing a name, and I want that stated
plainly rather than buried.

### Why it was cut

Real authentication is not one task, it's a project: a `users` table, registration, a
password hashing choice (argon2id) with sensible parameters, login and logout, token
issuance and verification, refresh and revocation, cookie flags and CSRF protection if
sessions live in cookies, CORS configuration, a password reset flow with expiring
single-use tokens, and rate limiting on the login endpoint so the whole thing isn't
brute-forceable. Done honestly that is most of a working day on its own — more than the
six-hour box for the entire exercise — and none of it demonstrates anything the brief is
actually asking about: streaks, calendar days, and making a write safe to repeat.

Spending the time there would have meant shipping authentication and _not_ shipping the
timezone handling, the idempotent write, or the tests. I'd rather show the judgment about
which day a log belongs to and be explicit about the gap.

Doing it badly would have been worse than not doing it. A hand-rolled JWT check with a
hardcoded secret and no expiry looks like security in a code review and isn't — it just
moves the same trust into a longer string.

### What it does instead

[`middleware/currentUser.ts`](backend/src/middleware/currentUser.ts) is the whole
implementation:

```ts
export const currentUser: RequestHandler = (req, _res, next) => {
  const header = req.header("x-user-id")?.trim();
  if (!header) throw ApiError.unauthorized("Missing X-User-Id header.");
  req.userId = header;
  next();
};
```

A missing or blank header is a 401 through the global error handler. Declaration merging
adds `userId: string` to Express's `Request`, so controllers read `req.userId` without a
null check and TypeScript doesn't complain.

The frontend supplies it in `ApiClient`, taking the value from `?user=` in the URL and
defaulting to `demo-user` — which is what makes multi-user behaviour demonstrable without
a login screen.

### The properties that were kept anyway

Cutting authentication did not mean cutting authorisation. Three things hold today and
would still hold with real tokens:

1. **Identity has exactly one source.** It's set in middleware, and _no_ route accepts a
   user id from a query string or a body — the zod schemas don't even define the field.
   This is deliberate: the Part 2 sample's worst bug is `GET /api/dashboard?userId=`, where
   changing a number in the URL reads a stranger's health data. That class of bug is
   impossible here regardless of how identity is established.
2. **The middleware is mounted on the path, not on each route:**
   `app.use("/api", currentUser, apiRouter)`. Every current and future endpoint under
   `/api` is covered by construction — you cannot add a route and forget to protect it.
   `/health` sits outside deliberately, so dev tooling can poll without credentials.
3. **Ownership is enforced per request.** Every query is scoped by `userId`, and logging
   against a habit you don't own is a 404 — not a 403, because a 403 confirms that habit
   812 exists.

### What replacing it costs

One file. Verify a session cookie or bearer token and set `req.userId` from the verified
subject:

```ts
export const currentUser: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.session ?? bearerToken(req);
  if (!token) throw ApiError.unauthorized("Not signed in.");
  req.userId = verifySession(token).sub; // throws → 401 via the error handler
  next();
};
```

Nothing downstream changes, because nothing downstream knows where identity came from —
the services, controllers and schemas are untouched. The work that _isn't_ one file is the
rest of the project listed above: the users table (today `user_id` is a bare string column
with no foreign key), the login flow, and CORS plus cookie flags once the token stops being
same-origin through the Vite proxy.

---

## What I'd do differently for production

Roughly in the order I'd do it:

1. **Real authentication and authorisation.** JWT or session cookie, verified in
   middleware; `X-User-Id` deleted. Everything else on this list is secondary.
2. **A migration and rollback story beyond `migrate dev`.** `migrate deploy` is wired up,
   but nothing here has been exercised against a table with data in it — expand-and-
   contract for anything destructive, and a rehearsal on a production-sized copy.
3. **Integration tests against real MySQL.** The suite deliberately runs without a
   database, which means the query layer itself is only covered manually — and the
   stand-in Prisma client in `tests/fakePrisma.ts` imitates Prisma's query language, so a
   wrong `where` clause can pass there and fail against MySQL. I'd add a small
   Testcontainers layer running the HTTP suite a second time against real MySQL. That is
   precisely where the bug described in the AI section below turned up.
4. **Structured logging and request tracing** (pino + a request id), plus metrics on write
   latency and error rate. `console.log` is not an observability strategy.
5. **Operational hardening:** helmet, CORS allowlist, rate limiting on writes, a pool
   acquisition timeout, and a readiness probe that actually checks the database rather
   than returning `ok` unconditionally. Also `process.on("unhandledRejection")` and
   `uncaughtException` handlers: the error middleware only covers failures raised while
   serving a request, so a rejection from a background timer would still take the process
   down. Nothing does that today, which is exactly why it would go unnoticed.
6. **Per-user timezones**, as described above.
7. **Caching the dashboard read.** It's a bounded scan per user; at scale I'd either cache
   the computed progress with a short TTL or maintain a streak counter on write. I would
   not do either before measuring — the query is indexed and the data is small.
8. **CI**: typecheck, tests, `npm audit`, and a secret scanner on every PR.

### Corners cut, explicitly

- No auth (above).
- The seed script deletes and recreates the demo user's habits. Convenient; obviously not
  something to point at a real database.
- Dev credentials are committed in `backend/.env.example` and `docker-compose.yml`. They're
  local-only and reused nowhere — but the moment this is real, they come from a secret
  manager.
- `npm run build` typechecks rather than emitting a bundle, and `start` runs through
  `tsx`. Prisma 7's generated client is written for bundler-style resolution, so a plain
  `tsc` emit produces extensionless imports that Node's ESM loader rejects; shipping this
  for real means adding a bundler step, which isn't worth the time box here.
- The shadow database for `migrate dev` is created by a container init script. In a real
  environment it's either a managed scratch database or a developer-local one, not
  something the app's compose file conjures.
- The frontend has no client-side routing, no state library and no data-fetching library.
  At this size a single hook is less machinery than TanStack Query would be; past two or
  three screens I'd reach for it. HTTP goes through axios, which buys interceptors and
  uniform error objects at the cost of ~30 kB gzipped over `fetch` — worth it once there
  is auth-token refresh or retry logic to hang off it, and `ApiClient` is the only file
  that would have to change to go back.
- No component library or design system — hand-written CSS, about 200 lines. It's
  responsive and works in light and dark, but it isn't a design.
- Error messages are English strings in the code; no i18n layer.

---

## Testing

```
backend/tests/dates.test.ts     timezone resolution, DST, invalid dates, windows
backend/tests/progress.test.ts  streaks and completion, including the awkward cases
backend/tests/mapping.test.ts   DATE and DECIMAL conversion at the Prisma boundary
backend/tests/habitService.test.ts  the rules, with no HTTP in sight
backend/tests/api.test.ts       HTTP: auth, ownership, validation, idempotency, error shape
frontend/src/App.test.tsx       render, log, failure, retry, empty state
frontend/src/lib/dashboardApi.test.ts  headers, abort signal, error mapping, cancellation
```

Two of these are regression tests for bugs I'd never want to ship twice: _"never leaks
another user's habits"_, and _"returns a generic 500 and no stack trace when a query
fails"_ (it asserts the response body contains no SQL and that the detail reached the
logger instead). There's also a test asserting the dashboard is fetched **once** on
mount — a missing dependency array turns that into an unbounded request loop, which is one
of the bugs in the Part 2 sample.

Beyond the automated suite, I verified against real MySQL by hand: the concurrent-write
behaviour above, cross-user access, a quoted SQL-injection payload in the identity header
(parameterised, so it simply returns an empty dashboard), and that both `CHECK`
constraints reject bad rows at the database rather than only at the validation layer.

---

## AI tools

I used **Claude Code (Opus)** throughout, in the way I'd use it on a normal working day:
scaffolding, first drafts of the service and component layers, and the bulk of the test
bodies once I'd decided what the cases should be. It's fast at the parts that are typing
rather than thinking.

The decisions were mine: letting the unique constraint enforce idempotency, calendar dates
as strings, the today-is-a-grace-day streak rule, the 90-day cap, and the layering that
lets the HTTP tests run without a database. I also drove the Part 2 review's
prioritisation myself — the model is good at enumerating issues and much weaker at judging
which three actually block a merge.

Where I overrode or corrected it:

- **The affected-rows bug.** The first implementation used `mysql2` with `INSERT … ON
DUPLICATE KEY UPDATE`, mapping `affectedRows === 1` to "created". That reads correctly
  and passes against an in-memory stand-in. Against real MySQL it's wrong: mysql2
  enables `CLIENT_FOUND_ROWS` by default, so rewriting a row with identical values also
  reports `1`. I caught it only because I fired five concurrent requests at the real
  database and saw five `201 Created`s. It's in the Part 2 review as a gotcha, and it's
  the reason the Prisma version reports the outcome from a caught constraint violation
  instead of inferring it from a row count.
- **Prisma's `upsert`.** The obvious translation, and it reintroduces the read-then-write
  race described above. Insert-and-catch-`P2002` is the version that keeps the guarantee.
- **`.env` resolution.** npm runs workspace scripts from the package directory, so
  `dotenv/config` silently found nothing and the API connected to a _different_ MySQL that
  happened to be running on 3306. The failure looked like a credentials problem, not a
  path problem.
- **A stale `dist/`** from an earlier build was being collected by Vitest, quietly running
  three test files twice. The suite was green either way, which is what makes that kind of
  thing worth pinning down — `vitest.config.ts` now restricts collection to `tests/`.
- **Dependency hygiene.** The first install produced five advisories from vite/vitest and
  a React 18/19 peer-hoisting mismatch that broke the component tests; both fixed rather
  than shipped.
- **Port 3306 → 3307**, after the container refused to start on a machine already running
  MySQL.
- A fair amount of trimming: generated code tends toward defensive branches for conditions
  that can't happen, and comments that restate the line below them. What's left is
  intended to explain _why_, not _what_.

---

## Part 2

The code review answers is in Assessment_Part2 folder.
