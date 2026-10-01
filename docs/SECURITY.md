# Security

## Controls

| Area | Implementation |
|---|---|
| Authentication | Email + password (bcrypt cost 12, password policy), HS256 JWT in an **httpOnly, SameSite=Lax** cookie (`Secure` behind HTTPS), 7-day expiry, server-side revocation via `token_version` ("Log out of all devices"). First account = admin; sign-up closed afterwards unless `ALLOW_SIGNUP=true`. |
| Authorization | Every API route re-checks the session (`lib/api.ts`); admin routes check role. `proxy.ts` also gates pages. |
| Database isolation | **Row Level Security** on every table. User queries run as the restricted `cc_user` role with `app.user_id` set per transaction — a forgotten `WHERE` still can't leak data. The job queue is inaccessible to `cc_user`. Tested in `tests/integration/security.test.ts`. |
| Action permissions | LOW auto · MEDIUM approval · HIGH typed `CONFIRM`. Per-tool overrides can tighten anything, relax medium tools, or disable tools; high-risk never goes below confirm. Admins can disable tools globally. |
| Approve-what-runs | The exact (or edited & re-validated) input shown on the approval card is what executes. Edits that would raise risk to HIGH are refused. |
| Secrets | Server-side `.env` only (never sent to the browser; settings page shows masked status). OAuth/API tokens stored **AES-256-GCM** encrypted (`ENCRYPTION_KEY`). `.env` is git-ignored; `.env.example` has placeholders only. |
| CSRF | SameSite cookies + Origin/Host check (and `Sec-Fetch-Site`) on all mutating API requests in `proxy.ts`. OAuth uses signed, expiring `state`. |
| Rate limiting | Per-user/IP token buckets on login, sign-up, commands, uploads, webhooks. |
| Input validation | zod schemas on every API body and every tool input; output verification hooks on tools. |
| SSRF | Web reading, webhooks, downloads and browser navigation resolve DNS and block private/loopback/link-local ranges; redirects are re-checked. |
| Files | Name sanitisation, storage-root path checks, 25 MB limit, risky types (HTML/SVG/JS) always download as `application/octet-stream` with `nosniff` + sandbox CSP. Files are never auto-deleted (archive instead). |
| Webhooks | Per-automation 24-byte random token URL, rate-limited, 100 KB body cap, paused automations refuse. |
| Public media | Only images, only via signed 24-hour tokens (for Instagram/TikTok to fetch). |
| Headers | `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy. |
| Shell | `shell_command` disabled unless `SHELL_COMMANDS_ENABLED=true`; always HIGH risk (typed CONFIRM). |
| Memory | Refuses to store passwords, card numbers, keys. "Forget" deletes. |
| Audit | Every command, step, approval decision, permission/setting change and integration change is in `activity_logs`. |

## AI safety (prompt injection)

1. **Structural:** plans are built only from your command. Web pages, documents, emails and files can only
   be inputs to text-generation steps — they can never add tools, steps or approvals.
2. Untrusted content is fenced in `<untrusted_data>` blocks with fake closing tags neutralised, and the system
   prompt instructs the model to treat it as data.
3. Injection patterns ("ignore previous instructions", "send the API key to…") are detected and surfaced as
   warnings on the run and stored on documents.
4. Sensitive actions still require your approval regardless of what any model says.

## Browser automation rules

Never bypasses CAPTCHA, logins, 2FA or rate limits: a detected CAPTCHA/bot-wall stops the run with
*"I will not bypass it — please complete that step yourself."* Clicking, typing and form-filling are
MEDIUM risk (approval required).

## Reporting

This is a personal project; open an issue (without secrets) or contact the owner privately.
