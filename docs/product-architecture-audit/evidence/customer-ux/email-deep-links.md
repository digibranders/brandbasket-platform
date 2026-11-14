# Email template links and where they land

Templates: packages/email/src/templates/*.ts (31 files). A template only formats a URL that its caller builds, so each row names the caller. All URLs pass `assertWebUrl` (http or https only, packages/email/src/message.ts:40-50). Labels: V = Verified in code; I = Inferred; U = Unknown. Customer-facing first, then staff and system emails.

Cross-cutting facts (V):
- A signed-out click on any dashboard link goes to plain `/login`, then Home after sign in. Only `/invite/<token>` survives sign-in (apps/customer/src/lib/guard-rules.ts:16, features/team/rules.ts:108-111). So receipt, report, request and billing deep links all lose their target when the person has no session.
- Emails whose link signs someone in or creates an account store a link-less copy in the outbox (`withheldLinkCopy`, message.ts:94).
- Old addresses still sent in emails remain as permanent redirects (list in the route inventory).

## Customer-facing

| Template | Sent by (caller) | Link built as | Lands on | Destination exists | Expired, invalid, denied handling | Notes |
|---|---|---|---|---|---|---|
| signup-code | apps/customer/src/features/entry/server/account-email-code.ts:127 | none (6 digit code) | /signup code step | n/a | Code works 10 minutes (copy sign-up-form.tsx:117); wrong code returns a message; send and confirm rate limits with countdown | Refresh loses the step |
| privacy-request-code | apps/customer/src/platform/lib/privacy-requests.ts:167 | none (code) | /api/privacy-requests/confirm flow | n/a | OTP TTL in code | Customer-facing public form, not part of the dashboard |
| password-reset | apps/customer/src/lib/auth.ts:14-19 | `/reset-password/<token>` via resetPasswordPath (features/entry/rules/account-recovery-form.ts:12) on APP_ORIGIN | app/(auth)/reset-password/[token]/page.tsx | Yes | Token only checked on submit; a used or expired link still shows the form and fails after the person types (page comment lines 9-12). Email says it works once and names minutes (PASSWORD_RESET_LIFETIME_SECONDS) | referrer no-referrer set |
| setup-link | apps/admin/lib/server/invites.ts:43 | `/setup/<token>` on APP_ORIGIN | app/(auth)/setup/[token]/page.tsx | Yes | Checked before the form: "This link no longer works" (expired or used, 7 days) and a rate-limit screen with retry (setup/[token]/page.tsx:17-35) | Best handled link |
| business-invite | apps/customer/src/features/team/actions.ts:71-78 | `invitePath(token)` = `/invite/<token>` (features/team/rules.ts:88) | app/invite/[token]/page.tsx | Yes | Page checks format only. Expired, revoked, used or wrong address refuse after pressing Join (accept-invite.tsx:12-17). Signed out: Sign in and Create account keep `?next=` | Opening does not consume the invite (scanner safe) |
| affiliate-link | apps/admin/lib/server/affiliate-admin.ts:345 | `affiliateSetupPath(token)` (packages/shared/src/lib/affiliate-links.ts:11) | app/affiliate/setup/[token]/page.tsx | Yes | Dead or rate-limited screens, same as setup | Affiliate persona |
| payment-received | packages/shared/src/server/payment-emails.ts:84-105 | `receiptDownloadHref([paymentId])` = `/billing/receipts?ids=<id>` on dashboard origin | app/billing/receipts/route.ts (requireOwner) | Yes (route handler, not a page) | Signed out: redirect to /login then Home, the PDF is not delivered. Not owner: owner guard sends Home. Unknown id handling in `receiptsDownload` (U) | Outbox dedupe keys on the link text |
| payment-failed | payment-emails.ts:157-165 | `BILLING_PATH` = `/billing` | app/(app)/billing/page.tsx | Yes | Any billing state is open; owner sees actions, others read. Email text says "Pay now" but lands on a page where payment may need two more steps (see UX finding B1) | Skipped when owner turned billing emails off |
| monthly-report | packages/shared/src/server/monthly-reports.ts:236-258 | `/reports/<yyyy-mm>` and `/reports/<month>/pdf?service=<svc>` on customer origin | app/(app)/reports/[month]/page.tsx; app/(app)/reports/[month]/pdf/route.ts | Yes both | Bad month gives 404 (`parseMonthParam`); bad service or no report 404 plain text; read failure 500 text "We could not get this report" (pdf/route.ts:18-21). Signed out loses the target | Sent to owner only; skipped for phone-only accounts and when topic is off |
| change-request-update (reply, quote, started, ready, done, closed) | apps/admin/lib/server/request-notify.ts:31-37 | `/requests?open=<ticketId>` | app/(app)/requests/page.tsx opens the inspector sheet | Yes | Non-uuid gives 404; id not in newest 100 redirects to `/requests/<id>` which 404s for another business's or missing ticket (requests/page.tsx:26-33, [id]/page.tsx:22-30) | Bell opens `/requests/<id>` instead (shell/rules.ts:277); two surfaces |
| support-request-opened (staff opened a request for the client) | apps/admin/lib/server/staff-opened-request.ts:81-87 | `/support/<ticketId>` | app/support/[ticketId]/page.tsx, then permanent redirect to `/requests/<id>` | Yes (alias) | Non-uuid gives 404; then same as above | Current email still depends on a legacy alias and a double hop |
| preview-ready | apps/admin/lib/server/project-preview.ts:54-61 | the staff-entered preview URL itself (`input.previewUrl`) | An external site, not the dashboard | Not checked by the customer app; only `assertWebUrl` | Link rot or password protection: U. Customer is told to "Reply" instead of approving in the dashboard (preview-ready.ts:15-17) | Approve and Ask for changes exist only at /website. Design hypothesis H: add a dashboard link. |
| domain-ready | apps/admin/lib/server/domain-ready.ts:33-37 | `/domain` on APP_ORIGIN | app/(app)/domain/page.tsx permanent redirect to /website/domain | Yes (alias) | requireWebsite: a business without the website service goes Home silently; signed out goes /login then Home | Alias deliberately kept (page comment) |
| website-live | apps/admin/lib/server/project-launch.ts:68, 106, 131 | `https://<hostname>` | The customer's own website | Depends on DNS (U) | None in app | External |
| domain-moved | apps/admin/lib/server/domain-switch.ts:27-30 | `https://<newHostname>` | Customer's website | U | None | External |
| listing-enquiry | no live caller found (grep of `listingEnquiryEmail(` outside templates) | `dashboardUrl` | would be /enquiries | n/a | n/a | Likely dormant (directory plan 35). I |
| onboarding-sent | apps/customer/src/features/checkout/server/onboarding-alert.ts:22 and src/platform/lib/server/onboarding-alert.ts:22 | admin client URL | Staff console | Yes | Duplicated in two trees | Staff-facing |

## Staff and system emails (destinations in apps/admin)

| Template | Caller | Lands on | Exists |
|---|---|---|---|
| staff-invite | apps/admin/lib/server/staff-admin.ts:39 `/staff-invite/<token>` | apps/admin/app/staff-invite/[token] | Yes |
| password-reset (staff) | apps/admin/lib/server/auth.ts:24 `/reset-password/<token>` on ADMIN_ORIGIN | apps/admin/app/reset-password/[token] | Yes |
| lead-received | apps/customer/src/platform/lib/server/leads.ts:62 `/leads/<id>` on ADMIN_ORIGIN | admin /leads/[leadId] | Yes |
| preview-approved, preview-revisions-requested | features/website/alerts.ts:60 admin `/clients/<id>` | admin clients/[businessId] | Yes |
| domain-connected, domain-requested | features/website/alerts.ts:159,168 admin `/clients/<id>` | same | Yes |
| support-ticket-alert, support-reply-alert | features/requests/server.ts:99,125 `adminUrl(ticketId)` | admin /support/[ticketId] | Yes (exact path built in `adminUrl`, not opened here, I) |
| security-alert, staff access review | features/entry/server/security-events.ts:66, src/platform/lib/security-review.ts:51 `/access-log` | admin /access-log | Yes |
| privacy-request-alert, due digest | src/platform/lib/privacy-request-alerts.ts:55,90 | admin /privacy-requests | Yes |
| site-down-alert | site health job | admin clients/<id> | Yes |
| system-error-alert | error reporter | admin /support/errors/<issue> | Yes |

## Gaps (V = absence in templates folder)

- No templates for: kickoff booked or reminder (cal.com may send its own, U), social posts waiting for approval (a `needs_approval` notification topic exists, packages/db/src/schema/notifications.ts:10, but no template or sender was found, U), account closure or deletion scheduled, service cancellation confirmed, team member joined or removed, invitation accepted.
- No email links to /checklist, /website (approval), /billing/invoices or /settings.
- Receipt link requires a live owner session; no signed or time-limited link exists. A design choice (secure) with a UX cost (H).
