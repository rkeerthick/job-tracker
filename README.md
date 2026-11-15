# Job Tracker

A small full-stack app for tracking job applications on a kanban-style board. Sign up, add applications, move them through the pipeline (**saved → applied → interview → offer → rejected**) and keep notes on each one.

**Live:** `<add your Vercel URL here>`

## Tech stack

- **Next.js 16** (App Router, Cache Components, `proxy.ts`), **React 19**, **TypeScript**
- **Postgres on Neon** with **Drizzle ORM** (`drizzle-orm/neon-http`) and SQL migrations in `drizzle/`
- **Zod 4** for request validation, **bcryptjs** for passwords
- **Tailwind CSS 4**
- **Vitest** for tests, **GitHub Actions** for CI, **Vercel** for hosting

## Run locally

Requirements: Node 22, a Postgres database (a free [Neon](https://neon.tech) project works).

```bash
npm ci
```

Create `.env.local`:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string, e.g. `postgresql://user:pass@host/db?sslmode=require` |

Then apply the migrations and start the dev server:

```bash
npm run db:migrate   # drizzle-kit migrate: applies ./drizzle/*.sql
npm run dev          # http://localhost:3000
```

Other scripts:

| Script | What it does |
|---|---|
| `npm run db:generate` | Generate a new migration after editing `db/schema.ts` |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run build` | Production build |
| `npm run db:seed-perf` | Seed 100k rows for index testing (**never on production**, see [Query plan](#query-plan-before--after)) |

## Auth design

Email + password with server-side sessions. No JWTs.

- **Passwords:** hashed with bcrypt (cost 12) via `bcryptjs`. The plain password is never stored or logged.
- **Emails:** trimmed and lowercased on signup and login, because Postgres unique indexes are case-sensitive.
- **Sessions table:** logging in creates a row in `sessions` (`user_id`, `token_hash`, `expires_at`). Sessions last 7 days and an expired row is treated as logged out.
- **Session token:** 32 random bytes (`crypto.randomBytes(32)`, hex). Only the **SHA-256 hash** is stored in the database, so a leaked `sessions` table can't be used to hijack a session. SHA-256 (not bcrypt) is enough because the token is already 256 bits of randomness, and it gives a deterministic value to look up through a unique index.
- **Cookie:** `session`, with `httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"` and a 7-day expiry.
- **Login errors:** an unknown email and a wrong password give the same `Invalid email or password` message. When the email doesn't exist, a bcrypt check still runs against a dummy hash, so response time doesn't reveal which emails are registered.
- **Logout:** deletes the session row and the cookie.
- **Where checks happen:** `proxy.ts` only checks that a session cookie *exists* (a fast redirect to `/login`). It is not a security boundary. The real check is `getCurrentUser()` (database lookup of the hashed token), called by every protected page and, through `requireUser()`, on the first line of every API route.

Not implemented yet: rate limiting on login/signup, email verification, password reset.

## Ownership rule

Every application belongs to one user, and the user is **always taken from the session, never from the request**.

- `userId` is set from `requireUser()` on insert. Request bodies are parsed with Zod, which drops unknown keys, so a `userId` in the body is ignored.
- Every query on `applications` filters on **both** the row id and the owner: `WHERE id = ? AND user_id = <session user>`.
- If the row doesn't exist **or** belongs to someone else, the API returns **404** (never 403), so ids can't be probed to learn which ones exist.
- `notes` has no `user_id`, so ownership goes through the parent application. Listing and adding notes check the application first. Deleting a note joins `notes` to `applications` and requires `applications.user_id = <session user>`.
- Ids in URLs are validated as positive integers (400 otherwise).

| Route | Behavior |
|---|---|
| `GET /api/applications` | Current user's applications, newest first |
| `POST /api/applications` | Create (`company`, `role`, optional `link` and `status`) |
| `GET / PATCH / DELETE /api/applications/[id]` | Read, update or delete one of your applications |
| `GET / POST /api/applications/[id]/notes` | List or add notes (max 2000 chars) |
| `DELETE /api/notes/[noteId]` | Delete a note you own |

Unauthenticated API requests get `401`.

## Tests and CI

- **Tests** (`npm test`, 19 tests, no database needed): Zod schemas (required fields, bad link and status, `javascript:` links rejected, `userId` stripped from parsed output), password hashing and verification, `hashToken`, the status list and order, and `requireUser` returning 401 (with a mocked session module). The pure logic lives in `lib/validation.ts` and `lib/auth/token.ts` so it can be tested without the database or the Next runtime.
- **CI** (`.github/workflows/ci.yml`) runs on pull requests and on pushes to `main`: `npm ci` → `typecheck` → `lint` → `test` → `build`. The build gets a dummy `DATABASE_URL`, so no real secret is used in CI.
- **Merge gate:** make the `ci` job a required status check in the repo's branch protection for `main`, so a failing test blocks the merge.

## Query plan before / after

Goal: make the board's main query fast on a large table:

```sql
SELECT * FROM applications
WHERE user_id = :id
ORDER BY created_at DESC
LIMIT 50;
```

Method: a separate Neon branch (`perf-test`) seeded with 100,000 rows via `npm run db:seed-perf`, `ANALYZE applications;`, then `EXPLAIN (ANALYZE, BUFFERS)` run twice (the warm-cache run is reported). Fix: composite index `applications_user_created_idx` on `(user_id, created_at)` (migration `0003`).

| | Before (no index) | After (index) |
|---|---|---|
| Plan | _TODO: paste, expected `Seq Scan` + `Sort`_ | _TODO: paste, expected `Index Scan` on `applications_user_created_idx`_ |
| Buffers | _TODO_ | _TODO_ |
| Execution time | _TODO_ ms | _TODO_ ms |

The migration is written, but these numbers have **not been measured yet**. Fill the table with real output from the `perf-test` branch.

## Logging

`lib/log.ts` writes one JSON object per line (`level`, `message`, `time` plus fields), so it can be searched in **Vercel → Logs**. API routes catch unexpected errors, log them with `{ route, userId, error }` and return a generic `500 { "error": "Internal server error" }`, so nothing internal leaks to the client. Keys like `password`, `token`, `cookie` and `hash` are redacted, and the `params:` part of database error messages (user data) is dropped. Passwords, tokens and cookies are never passed to the logger in the first place.

## Changelog

- **2026-11-15**: Structured JSON logging and 500 error handling in API routes
- **2026-11-15**: Shared Zod validation module, Vitest test suite (19 tests), GitHub Actions CI, composite index on `applications (user_id, created_at)` (migration `0003`, not yet applied to production)
- **2026-11-14**: Notes on applications (API and UI)
- **2026-11-14**: Application board, status changes and add form
- **2026-11-14**: Auth (signup, login, logout, sessions), applications API with ownership checks, Vercel build fix (Suspense for Cache Components)
- **2026-11-06**: Drizzle schema (users, applications, notes, sessions)
- **2026-11-05**: Initial project, metadata, hello world
