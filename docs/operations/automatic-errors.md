# Native automatic errors

Brandbasket captures unexpected browser errors, unhandled promise rejections, React error-boundary failures and Next.js `onRequestError` failures into the private staff console at `/support/errors`. Explicit caught-error sites call `reportServerError` with a fixed operation and route. The native inbox works with the existing staff database connection; it needs no external monitoring account or credentials.

## Sentry and the native inbox

The native inbox runs next to Sentry. They are separate, and each server error is reported to both.

- **Native inbox.** Stored in our own database. It keeps only the minimal telemetry listed below and sends nothing to any outside service. It needs no account.
- **Sentry.** An external processor (platform app only; the admin app uses the native inbox alone). It is off until `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are set. When it is on, events leave our systems, so they are reduced before sending:
  - Session Replay is disabled in every runtime: no replay integration, and both replay sample rates are 0. Nothing a customer types or sees is recorded.
  - Default PII is off, and local variables are not attached to stack frames.
  - Every error and transaction goes through `apps/platform/lib/sentry-scrub.ts` before it is sent. Request bodies, query strings, cookies, headers, user data, extra data, form field values and exception messages are removed. Console and input breadcrumbs are dropped and no breadcrumb keeps a message. URL queries and database statements are cut from spans.
  - What is kept: the exception type and stack frames (without local variables), the route path without its query, the release, the severity and HTTP status codes. Tracing sample rates are unchanged (1.0 in development, 0.1 otherwise).

Reporting runs through one `onRequestError` hook in `instrumentation.ts` and one helper for the error pages (`lib/report-boundary-error.ts`). A failure in either destination never stops the other and never replaces the original error. The error pages send one report per error to each destination, and an error that already has a server digest is not sent again from the browser.

## What is retained

- A known error class, fixed operation code, application, normalized route template, severity, latest browser family and latest release.
- At most eight allowlisted source file basenames with numeric line and column coordinates. Paths, function names and source snippets are omitted.
- One grouped issue per fingerprint, occurrence count, first/last seen time, review status and regression count.
- A bounded 1,024-bit bitmap estimating distinct signed-in users. User IDs are used only transiently to set an issue-specific bit; no user list or user-to-issue association is stored. Reports without a known server-derived identity do not contribute to this estimate, including server hooks without an associated session. A saturated bitmap displays a lower bound with `+`.
- Event UUID receipts for one day, solely to make repeated submissions idempotent. Expired receipts are purged when subsequent reports arrive.

Messages, raw stack text, causes, request query parameters, bodies, headers, console logs, names, emails, phone numbers, billing details, patient details and session tokens are never retained. Browser-family classification and hashed rate-limit keys are derived at ingestion; raw user-agent and IP headers are not stored.

## Transport and access

Browser transport sends only validated metadata to the application's same-origin `/api/error-reports` collector. It accepts only its configured host and origin, bounds the streamed body to 8 KiB and one second, caps concurrent work and uses database-backed global/IP/signed-in-user limits. It rejects client-supplied identity and server-only operations. The server derives an optional signed-in identity from its own session reader.

Browser sends abort after two seconds, have no retries, and cap at two concurrent sends and ten sends per minute. Server reporters cap at four concurrent reports and thirty per process per minute, with a shared database admission limit and two-second deadline. Database aggregate transactions also set statement and lock timeouts. Collector and storage failures never propagate into the application.

Native automatic-error tables and ticket-error links are private to the staff database role. Customer and anonymous database roles cannot read or write them. Every console page and status action calls `requireStaffAccess`. Ticket links require an active staff actor and are never included in requester-visible ticket queries.

## Releases and source locations

Set optional `NEXT_PUBLIC_BRANDBASKET_RELEASE` to the deployment's hexadecimal Git commit hash (7 to 64 characters) before building both applications and keep that value for their runtime. Missing or invalid values become `unknown`. The collector overwrites client-supplied release values with the deployed application's value.

Production frames can point to compiled JavaScript chunks. This implementation does not upload, resolve or symbolicate source maps. Safe class/operation/route/group references provide native triage, but diagnosing a production location may require inspecting the corresponding build artifact. Avoid claiming full source-map diagnosis.

## Review lifecycle

Staff can mark an issue New, Investigating, Resolved or Ignored and assign it to an active staff member. A subsequent distinct occurrence reopens a resolved issue and increments its regression count. Ignored issues continue counting without reopening. A status update includes the reviewed occurrence count so an incident that changes during review must be refreshed before it can be resolved. The scheduled support maintenance command (`pnpm support:attachments:maintain`, see `docs/deployment/brandbasket-vps.md`) removes resolved issues 90 days after resolution and expires old event receipts; active and ignored issues stay available. User-created support tickets remain separate; staff can privately link them to an automatic issue by its UUID reference.
