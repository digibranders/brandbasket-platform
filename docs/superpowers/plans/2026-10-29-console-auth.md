# Console authentication implementation plan

**Goal:** Replace the Brandbasket console's centered sign-in screen with a responsive split composition and working staff password recovery.

**Design:** Retain Red Hat fonts and the light paper, rattan and ink palette. A warm illustrated brand panel sits beside a white form panel. The illustration uses abstract woven forms and the actual service names, with no invented business data. On small screens the brand panel collapses to a compact introduction. Login, recovery and reset share a frame and accessible labelled controls. Existing staff and customer access decisions remain intact.

**Architecture:** Keep all changes in apps/admin. Preserve the existing sign-in server action and Turnstile integration. Add browser-safe recovery validation, server-only token generation and rate-limited recovery using the existing Better Auth, staff database and email delivery/outbox APIs. Generate reset emails only for active staff, always give neutral request responses, enforce active staff membership again at reset, and retain Better Auth's token expiry, single use and session revocation.

## Steps

- [x] Write failing validation and recovery service/action tests. Cover invalid input, password mismatch, robot check, neutral unknown/non-staff responses, rate limits, failed delivery setup, expired tokens and successful reset redirect.
- [x] Add recovery validation, request-local mail capture and server actions. Use the configured console origin for email links and no-referrer metadata on reset pages.
- [x] Build a shared console auth frame, labelled sign-in and recovery forms, and login/forgot/reset pages. Keep denied access and signed-in redirects.
- [x] Run focused tests, admin lint, TypeScript and build. Run relevant integration tests for the email flow.
- [x] Exercise the real local app in a browser at desktop and mobile sizes, including password visibility, invalid login, neutral recovery success and reset errors. Review all changes and fix findings.

**Verification commands:** `pnpm --filter @brandbasket/admin test`, `npm run lint` and `npx tsc --noEmit` in apps/admin, `npm run build` in apps/admin, plus applicable email integration tests. Use the existing development branch and preserve pre-existing untracked files. No deployment is requested.

**Review:** Common request preflight runs for every address. Staff lookup, token generation and delivery are deferred until after the neutral response so membership cannot affect response timing or token-generation errors. Customer links use the configured app origin.

**Browser evidence:** Checked login at 320, 390, 768 and 1280 pixels without horizontal overflow. A disposable local staff account completed recovery through the local email outbox, reset its password, rejected the old password, signed in to the console with the new password and rejected reuse of the reset link. Password mismatch, visibility toggles, preserved fields, focused errors, recovery retry and no-referrer metadata were also verified. Real email delivery was disabled only for the local smoke-test process.
