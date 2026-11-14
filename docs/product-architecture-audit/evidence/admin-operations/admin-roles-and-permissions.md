# Admin console roles and permissions (audit at c702f6c7, branch development)

Labels: Verified in code | Reported in historical document | Inferred | Unknown. Paths are relative to `brandbasket-platform/`.

## 1. How a role is decided and enforced

| Layer | What exists | Evidence |
|---|---|---|
| Roles | Three: `support`, `finance`, `admin`. Stored on `staff_members`; `ROLE_ORDER` in the UI. Verified in code | `apps/admin/lib/staff-roles.ts:4`; `packages/shared/src/lib/access.ts:60-69` |
| Capability table | Only four capabilities exist: `money` (finance, admin), `oversight` (admin), `integrations` (admin), `buildRules` (admin). Support is in none. Verified in code | `packages/shared/src/lib/access.ts:60-69` |
| Authentication | Every page and action calls `requireStaffAccess()`, which loads the session and an active `staff_members` row; otherwise redirects to `/login`. Customer sessions open nothing. Verified in code | `packages/shared/src/server/staff-access.ts:32-46`; `apps/admin/lib/server/staff-access.ts:18-22` |
| Layout guard | `(protected)/layout.tsx` calls `requireStaffAccess()`. The layouts never replace the per-page guard (rule in root CLAUDE.md). Verified in code | `apps/admin/app/(protected)/layout.tsx:10` |
| Page level capability | `requireStaffCan(capability)` runs first in the page: logs `access.denied` (result `denied`) then redirects to `/no-access`. Verified in code | `apps/admin/lib/server/staff-role.ts:15-20` |
| Action level capability | Every money action and every oversight action repeats `requireStaffCan` (list in section 3). Verified in code | `apps/admin/app/(protected)/clients/[businessId]/actions.ts:120,139,153,183,195,563,584,599,613` and others |
| Rail level | `console-rail.ts` hides pages whose `needs` the role lacks; an item with no page left disappears. This is presentation only. Verified in code | `apps/admin/lib/console-rail.ts:109-120` |
| Query level | None. The console has one staff DB connection with no row-level security; every query is role-blind, so a role check must be repeated in each page or action. Reported in CLAUDE.md, Verified in code (queries take no role parameter) | `apps/admin/CLAUDE.md` "Data"; `apps/admin/lib/server/rail-counts.ts:24` passes `canSeeMoney` into the reader by hand |
| Partial query skips | Today, Clients and counts skip reading flagged payments for non-money roles, which is the only place a query is avoided for a role. Verified in code | `apps/admin/lib/server/today.ts:84`; `apps/admin/app/(protected)/clients/page.tsx:78` |
| Session | 12 hours, host-only cookie. Verified in code | `packages/auth/src/create-auth.ts:42`; `apps/admin/lib/server/auth.ts:19` |
| Second factor | None in the app. Verified in code (no two-factor code) and Reported in `docs/STAFF-ACCESS.md:60-62` |

### Cloudflare Access assumption

* `apps/admin/CLAUDE.md` says production "sits behind Cloudflare Access". `docs/deployment/cloudflare-access.md:3` says "Status: not done" and "Nothing here has been applied". Reported in historical document: these two disagree; which is true in production is Unknown.
* What is verifiable: nginx refuses requests that did not come through Cloudflare (`deploy/vps/nginx/sites-brandbasket:108-111`). The admin app has no middleware, no proxy file and no code that reads `Cf-Access-Jwt-Assertion` (`apps/admin` has no `middleware.ts` or `proxy.ts`; `rg -i cf-access apps packages` has no source hits). So if Access is enabled, the app still trusts it blindly: a request that reaches the origin through any Cloudflare path outside the Access policy gets only the password. Verified in code.
* The second factor is therefore an operations assumption, not enforced or even checked by code.

## 2. Matrix by route

Y = allowed, N = refused (redirect to /no-access), list-only = the Rail hides it. "Any" means support, finance and admin all pass.

| Route / area | support | finance | admin | Enforced by |
|---|---|---|---|---|
| Today `/` | Y (no money rows, no collected figure, no Google sign-in rows) | Y (money rows) | Y (plus Google account rows) | `page.tsx:24-28`; `today.ts:84,100` |
| Clients list `/clients` | Y, **including Monthly amount and Paid through** | Y | Y | `clients/page.tsx:65,196-214` |
| Client tabs (Overview, Website, Messages, People) | Y | Y | Y | `openClientTab` `client-page.ts:25` |
| Client Overview "Money" panel | N | Y | Y | `page.tsx:44,125` |
| Client Plan and billing: work, numbers, campaigns, accounts, updates, add-ons, chatbots | Y | Y | Y | `billing/page.tsx:53-76` (no capability) |
| Client Plan and billing: BillingSection (payments, charges, invoices, refunds) | N | Y | Y | `billing/page.tsx:77` |
| Projects board `/projects`, Reports `/reports` | Y | Y | Y | `projects/page.tsx:60`, `reports/page.tsx:28` |
| Inbox: `/support`, `/support/{id}`, `/support/new`, `/leads`, `/leads/{id}`, `/leads/new` | Y | Y | Y | `requireStaffAccess` in each |
| Calls `/calls` | Y | Y | Y | `calls/page.tsx:55` |
| Money: `/payments`, `/invoices`, `/pricing`, `/coupons*`, `/affiliates*` | N | Y | Y | `requireStaffCan("money")` on every page and action |
| Ads: `/ad-credit` | Y (no gate) | Y | Y | `ad-credit/page.tsx:20` |
| Ads: `/ad-results` | N | Y | Y | `ad-results/page.tsx:35` |
| Team: `/staff`, `/access-log`, `/privacy-requests`, `/breaches` | N | N | Y | `requireStaffCan("oversight")` |
| Settings `/settings` (setup call URL) | Y | Y | Y | `settings/actions.ts:20` |
| Settings: rounds of changes | N | N | Y | `buildRules` `settings/actions.ts:82` |
| Settings: Teams alerts, Google states | N | N | Y | `integrations` `settings/actions.ts:44,59,69` |
| `/support/errors*`, `/deliveries*`, `/outbox/{id}` | Y | Y | Y | `requireStaffAccess` only |
| `/leaving` | Y | Y | Y | orphan, no gate |
| `/ads`, `/deals`, `/directory`, `/geography` | 404 | 404 | 404 | `DirectoryOnly` `directory-only.tsx:10-12` |

Route handlers (`/leads/export`, `/payments/export`, `/invoices/export*`, `/invoices/{id}`, `/search`, `/media/*`, `/support-attachments/*`, `/deliverable-images/*`, `/api/google/*`, `/api/client-brand-assets`, `/api/error-reports`, `/directory-pictures/*`, `/staff-ad-pictures/*`) are covered by the route auditor. Handoff only.

## 3. Matrix by action

### Finance or admin only (`requireStaffCan("money")`)
`recordManualPaymentAction`, `addChargeAction`, `markChargePaidAction`, `waiveChargeAction`, `resolvePaymentAttentionAction`, `endAddOnAction`, `addClientAddOnAction`, `removeClientAddOnAction`, `retryAddOnProviderAction` (`clients/[businessId]/actions.ts:120-613`); `markPaymentRefundedAction` (`billing/refund-actions.ts:16`); `issueMissingInvoiceAction`, `saveClientBillingDetailsAction` (`invoice-actions.ts:30,52`); `savePricesAction` (`pricing/actions.ts:27`); coupon create, retire, delete; affiliate create, update, payout, cancel earning, login link, new code.

### Admin only
`oversight`: staff invite, resend, change role, switch off and on (`staff/actions.ts:20-45`); log, update, close privacy requests (`privacy-requests/actions.ts:27-50`); log, update breaches (`breaches/actions.ts:15,28`); restore and extend account closure (`people/actions.ts:49,61`). `integrations`: Teams webhooks and Google card actions via `canManageGoogle` (`google-actions.ts:23-27`). `buildRules`: revision rounds default.

### Any staff, including support (consequential items)
| Action | Why it is notable | Evidence |
|---|---|---|
| `cancelProjectAction` | Ends a customer's build, customer headline becomes "Nothing is being built right now", not logged as customer visible | `website/actions.ts:54-61` |
| `grantRoundAction` | Gives free work; customer sees it | `website/actions.ts:73-79` |
| `sendPreviewAction`, `markLiveAction`, `saveLaunchChecksAction` | Emails the customer, changes live state | `clients/[businessId]/actions.ts:207-277` |
| `markDomainReadyAction`, `switchDomainAction`, `useFreeAddressAction`, `changeFreeAddressAction`, `setWebsiteUrlAction`, `saveWebsiteHostingAction`, `rotateSiteApiTokenAction` | Domain and hosting changes that alter the live site | `actions.ts:332-376,671-780` |
| `markAddOnContactedAction`, `markBundledAddOnContactedAction`, `setPressReleaseStatusAction` | Removes items from the Today queue (`add-on` kind); support can clear a paid customer's setup item | `actions.ts:624-652` |
| `addChatbotAction`, `setChatbotOperatorKeyAction`, `removeChatbotAction` | Sets an OyeChats operator key (a secret) | `actions.ts:782-831` |
| Deliverable add, edit, move (send for approval, take back, publish), delete; report links | Social and search work state | `work-actions.ts:85-259` |
| `sendReportAction`, `holdReportAction` | Sends a report to the customer and emails the owner | `reports/actions.ts:25-65` |
| `resendEmailAction`, `resendAlertAction`, `resendAllFailedAction` | Re-sends customer email in bulk (25 + 25) | `deliveries/actions.ts:22-49` |
| `saveSetupCallUrlAction` | Changes the customer-facing Book a call target | `settings/actions.ts:20` |
| Support reply and ticket edit | Public reply emails the requester | `support-admin-actions.ts:41-57` |
| Kickoff outcomes | Starts or blocks a website build | `calls/kickoff-actions.ts:32-69` |
| Dormant directory actions: `ads/actions.ts`, `directory/actions.ts`, `deals/actions.ts`, `geography/actions.ts`, `setModuleAction`, `saveListingPlacementAction`, `giveClientVerifiedAction`, `giveClientTrustedAction` | Exported actions have no `sellsDirectory` check; only the page route is switched off. Inferred: reachable by anyone who can craft the action request, though still behind staff login | `directory/actions.ts:65-170`; `clients/[businessId]/actions.ts:409-540` |

## 4. Access logging

| Item | Finding | Evidence |
|---|---|---|
| Table | `staff_access_log`, append-only for the staff role, 400-day retention, shown only to admin | `docs/STAFF-ACCESS.md:50-55`; `packages/db/src/schema/staff-access-log.ts` |
| Page views | `logStaffAccess` swallows write errors (page still loads). Verified in code | `apps/admin/lib/server/staff-access-log.ts:26-32` |
| Mutations | Many actions call `logStaffAccessOrThrow` AFTER the write, so a failed log write makes the user see an error although the change is saved. Verified in code | `work-actions.ts:57-61`, `website-actions.ts:53-57` |
| Second trail | `recordStaffAction` writes client activity (never throws); a different table with a different purpose. Many money and project actions write only this trail and not `staff_access_log` (`actions.ts:129,146`) | `apps/admin/lib/server/activity.ts:18-32` |
| List pages | The plan-status claim that Today, clients, enquiries, calls, projects, requests, outbox, affiliates, coupons and ad credit lists are not logged is now stale: all log (`today.view`, `clients.list`, `leads.list`, `calls.list`, `projects.list`, `support.list`, `outbox.list`, `affiliates.list`, `coupons.list`, `ad_credit.list`). Verified in code | `STAFF_ACCESS_ACTIONS` `staff-access-log.ts:43-57` |
| Still unlogged reads | `/support/errors*` (diagnostic context), `/ad-results` (aggregates), `/pricing`, `/settings` and `/leads/new`. `/leaving` is logged. Support errors may hold customer identifiers: Inferred. | pages cited in the CSV |
| Unfilterable actions | 16 actions are written by code but missing from `STAFF_ACCESS_ACTIONS`: `account.save/remove`, `activity.add/remove`, `call.summary`, `campaign.add/remove/update`, `invoice.register_view`, `numbers.save`, `report.send/view`, `setup_call.held/no_show/unheld`, `team_call.held/unheld`; plus templated names (`deliverable.${move}`, `change_request.${to}`, `setup_call.${outcome}`, `website.*`). They are in the table but the Compliance filter and labels do not know them. Verified in code | `access-log-labels.ts:4`; grep result in this audit |
| Log before validation | `/support/{id}` logs a view before checking the id is a UUID; an invalid id still records a view. Verified in code | `support/[ticketId]/page.tsx:33-34` |
| Failed sign-ins | Logged for active staff accounts only; unknown emails leave no row. Verified in code | `sign-in.ts:21-34` |
| Alerts | Nightly security-review email and blocked-sign-in burst email reported by docs; not examined here (Unknown). Reported in `docs/STAFF-ACCESS.md:55-58` |

## 5. Gaps (ranked)

1. No code check that Cloudflare Access is in front; docs conflict on whether it exists. (Verified in code / Reported)
2. Support can cancel a build, add free rounds, set a domain, send the live email and bulk resend emails with no finance or admin approval. (Verified)
3. `ad-credit` has no role gate and sits in the rail for support; it is also dormant. (Verified)
4. Clients list leaks Monthly amount and Paid through to support while the money capability exists to hide them. (Verified)
5. Dormant directory server actions are not individually switched off. (Inferred)
6. Privacy requests and breaches are admin only, with no owner, no Today row and no due-date alert, so a DPDP request can sit unseen if no admin opens Compliance. (Verified: not in `today.ts`)
7. Access log omits finance, as noted in the plan status. Still open. (Verified: `console-rail.ts:93-95`)
8. Audit trail splits across `staff_access_log`, `activity_events` (client activity) and `project_events`; there is no single per-client timeline of staff actions with customer-visible flag shown on one screen. (Inferred)
9. `docs/STAFF-ACCESS.md` is stale: it lists Affiliates as switched off, says passwords are only set by `staff:create` though invites and password reset exist, and describes support as "leads, clients and support requests" only. (Verified)
10. Admins are one capability group; there is no distinct "builder", "social manager", "ads manager" or "compliance" role, so assignment cannot be limited to the right people. (Verified: `access.ts:60-69`)
