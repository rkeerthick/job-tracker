# Security review (v0.2)

Every row below was **executed**, not just read. Date: 2026-11-21. Environment: a production build (`next build` + `next start`) on localhost, connected to the isolated Neon `e2e` branch (never the real database). Scripted checks live in [`scripts/security-check.ts`](scripts/security-check.ts); the rest are the commands named in the evidence column.

Result legend: **ok** = tested and passing, **fixed** = failed, fixed in this change, **deferred** = knowingly not fixed (reason given), **todo** = needs the deployed URL, not yet done.

## Batch 1: Access control + auth

| # | Area | Check | Result | Evidence / fix PR |
|---|------|-------|--------|-------------------|
| 1 | Access control | Every API route returns 401 without login | ok | 10 route/method pairs (`/api/applications`, `/[id]`, `/[id]/notes`, `/api/notes/[id]`, `/api/extract`, `/api/chat`) x (no cookie, forged cookie) all 401. The forged cookie matters: `proxy.ts` only checks that a cookie exists, so the real check is `requireUser()` in each route. |
| 2 | Access control | User B uses A's ids on application and note routes → 404 | ok | B: GET/PATCH/DELETE application, GET/POST notes, DELETE note → all 404 (never 403). A's application and notes verified unchanged afterwards; B's own list is empty. |
| 3 | Access control | Chat: forged history (`role: "tool"` / `"system"`) → 400 | ok | `tool`, `system`, `developer` roles, a last message from the assistant, and an empty list → 400. Extra fields (`tool_calls`, `userId`) are not rejected but stripped by validation before use (checked on the parsed output). |
| 4 | Access control | Chat tools never read another user's data | ok | Tools built for B, called with `query: "Acme"`, `{userId: A}`, `{user_id: A, ...}`: no row of A returned. Model harness `npm run chat:check -- --matrix`: 7/7 pass, including "Show applications of user 2" (own data only). |
| 5 | Auth | Cookie flags | ok (local) | Real signup through the browser on the production build: `HttpOnly=true Secure=true SameSite=Lax Path=/`; not visible in `document.cookie`. **todo:** repeat once by hand on the Vercel URL (DevTools → Application → Cookies). |
| 6 | Auth | Logout deletes the session | ok | Old cookie value: 200 before logout, **401 after**; the `sessions` row is gone from the database. |
| 7 | Auth | Login error does not reveal which part was wrong | ok | Wrong password and unknown email show the identical message "Invalid email or password". |
| 8 | Auth | No password/token hashes in responses | ok | 70 responses (all API calls above plus the `/applications`, `/login`, `/signup` pages) scanned for `passwordHash`, `tokenHash`, bcrypt `$2…$`: none. |

## Batch 2: Injection + input

| # | Area | Check | Result | Evidence / fix PR |
|---|------|-------|--------|-------------------|
| 9 | Injection | SQL is parameterized, no string-built SQL | ok | `grep -rn "sql\`" app lib db`: one use, the constant `sql\`now()\`` in `lib/auth/session.ts`. No user input in any raw SQL; the only `ilike` (`search_applications`) takes a bound pattern. |
| 10 | Injection | `ilike` wildcards are escaped | ok | Search `"%"` returns only the row containing a literal `%` (not every row); `"_"` matches nothing. |
| 11 | XSS | `<img src=x onerror=alert(1)>` as company/role | ok | Also `<script>` and `"><svg onload=…>`. Board in a real browser: text is shown literally, 0 `alert` dialogs, 0 injected elements. React escapes text; there is no `dangerouslySetInnerHTML` anywhere. CSP (row 15) is a second layer. |
| 12 | XSS | `javascript:` link rejected | ok | `javascript:`, mixed-case `JaVaScRiPt:`, `data:`, `vbscript:`, `ftp:` → 400 on POST **and** PATCH; a normal `https://` link is accepted. The card also only renders `http(s)` hrefs. |
| 13 | Prompt injection | Extraction + chat | ok | `npm run extract:check`: all fixtures pass, including `injection.txt` (no injected string in the output) and the retry path. Chat matrix case 6 (instruction hidden in a role field) passes. Model-based, so re-run after any prompt or model change. |
| 14 | Input size | Caps | ok | `/api/extract`: 20,001 and 25,000 chars → 400 (the real limit is **20,000**, stricter than the 25,000 in the checklist). Note 2,001 → 400 (2,000 accepted). Company 256, 31 skills, chat message 2,001, 21 chat messages, invalid JSON → 400. |

## Batch 3: Configuration, supply chain, logging

| # | Area | Check | Result | Evidence / fix PR |
|---|------|-------|--------|-------------------|
| 15 | Headers | Security headers | fixed (local) | Before: none were set. Now in `next.config.ts`: CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; `script-src` and `style-src` allow `'unsafe-inline'`, see below), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security`. Verified with `curl -I` on the production build, and the Playwright e2e (signup, add, chat) still passes with the CSP on. **todo:** scan the deployed URL on securityheaders.com after merge. |
| 16 | Supply chain | `npm audit --omit=dev` | ok | 0 vulnerabilities. |
| 17 | Supply chain | Dependabot | fixed | Added `.github/dependabot.yml` (npm + GitHub Actions, weekly). |
| 18 | Secrets | Nothing secret in git | ok | `git log --all -p -S"gsk_"`: 3 hits, all fake values in tests (`gsk_test…`, `gsk_SUPERS…`). No Neon connection string with credentials in history. `.env*` is ignored (`git check-ignore`), and no env file is tracked. |
| 19 | Logging | No password/token/cookie in logs | ok | Code: all logging goes through `lib/log.ts` (no other `console.*` in `app/`, `lib/`, `components/`), which redacts by key name and strips drizzle's `params:` tail from errors. Runtime: 104 server log lines, including forced 500s (unreachable DB) and a failed signup/login, contain none of the 6 test passwords, session tokens or cookie values. |
| 20 | Errors | No stack/SQL in error responses | ok | Server with an unreachable `DATABASE_URL`: GET and POST `/api/applications` → `500 {"error":"Internal server error"}`. The rendered `/applications` page contains no stack, SQL or host. |
| 21 | Auth | Login rate limit | **deferred** | There is no limit on login attempts, so passwords can be brute-forced online. Not fixed now because a correct limit needs shared state (Redis or similar) across serverless instances; an in-memory counter would be bypassed on Vercel and give false confidence. Mitigations today: bcrypt cost 12 slows each guess, and the app is for a few friends. **Risk accepted until March (Redis).** The same gap applies to `/api/chat` and `/api/extract` (a logged-in user can spend Groq quota). |
| 22 | Errors | Groq 429 / timeout → friendly message | ok | Server started with a wrong `GROQ_API_KEY`: `/api/extract` → 503 "AI is busy, try again in a minute."; `/api/chat` → a terminal `error` event with a generic message. No key, status code or provider text reaches the client. 429 and timeout use the same generic path (unit-tested in `tests/api-extract.test.ts` and the chat tests). |

## Known gaps and decisions

- **CSP allows inline scripts and styles.** Next's own bootstrap scripts are inline. A nonce-based CSP would remove `'unsafe-inline'` for scripts but forces every page to render per request, which breaks this app's prerendering model. Accepted for now; the XSS row (11) shows the app does not rely on CSP alone.
- **No rate limiting** anywhere (row 21).
- **Sessions are not rotated on login** and expire only after 7 days. There is no "log out everywhere".
- **Not tested:** CSRF on Server Actions beyond Next's built-in origin check and `SameSite=Lax`; concurrent-session limits; account deletion.
- **Re-run** `scripts/security-check.ts` (needs three local servers, see the header of the file) after changes to auth, routes or validation.
