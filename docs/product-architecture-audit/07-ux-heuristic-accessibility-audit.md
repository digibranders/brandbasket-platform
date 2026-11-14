# UX heuristic and accessibility audit

Customer findings are code-read only (no browser run). Admin permission and workspace findings are appended because they drive staff cognitive load.


---

<!-- source: customer-ux/customer-ux-a11y-findings.md -->

# Customer app UX and accessibility findings

Method: static read of apps/customer at c702f6c7. No real-browser run was made, so anything that needs rendering is marked Inferred or Design hypothesis. Heuristics: Nielsen's 10 (N1 visibility, N2 match, N3 control and freedom, N4 consistency, N5 error prevention, N6 recognition, N7 flexibility, N8 minimalism, N9 error recovery, N10 help). WCAG 2.2 AA criteria by number. Severity: High (wrong access or money copy), Medium, Low. Labels: V Verified in code, R Reported in historical document, I Inferred, H Design hypothesis, U Unknown. Paths relative to apps/customer/src.

## 1. Cross-cutting findings (most consequential first)

| ID | Sev | Finding | Heuristic / WCAG | Evidence | Label |
|---|---|---|---|---|---|
| C1 | High | Paid Ads and Social share one entitlement. `SERVICE_OF_ADD_ON` maps both `social-media` and `paid-ads` to `social`; the Paid Ads nav link copies Social's `bought` flag; /ads checks `services.includes("social")`. Result by code: a Social-only plan shows Paid Ads as bought, an Ads-only plan opens the Social posts and approvals pages. Root CLAUDE.md sells them as separate plans. The Ask-for-a-change button on /ads also opens a request with `about=website` | N2, N4 | packages/db/src/queries/service-setup.ts:40; features/shell/rules.ts:88-89, 118; app/(app)/ads/page.tsx:9; features/social/components/parts.tsx:31; website/rules/paths.ts:10 | V |
| C2 | High | Ad money is still drawn: Paid Ads panel row "Ad money added by us each month", Plan & billing bill line "Monthly ad money of ... is added to your ads", checkout and /start `adCredit` lines. The owner decision (2026-11-11) is no ad money. Whether any data produces these rows today is not known (they render only when `adCreditCents > 0`) | N2 (copy accuracy) | features/social/components/social-screens.tsx:129; features/billing/rules.ts:277; features/checkout/components/checkout-screen.tsx:97,115; features/start/loader.ts:4,113 | V that code exists; I that it conflicts |
| C3 | Medium | A Monthly or Yearly switch, first-month offer rows ("first month offer", `TRIAL_ADD_ON_IDS`) and `?billing=yearly` exist in checkout, against root CLAUDE.md "billed monthly" and "the only offer is Dedicated Expert Monitoring free with all three" | N2 | features/checkout/rules/membership.ts:33-57; checkout-screen.tsx:67; start/loader.ts:113; confirm-payment.test.tsx:14 | V code, I conflict (docs/plans/25 not read) |
| N5 | Medium | A signed-out visitor from any email deep link goes to /login and then Home; the target is dropped. Only `/invite/<token>` is returned to | N3, N7 | lib/guard-rules.ts:16; lib/guards.ts:96-99; features/team/rules.ts:108-111 | V |
| E1 | Medium | The preview-ready email links the external preview and tells the customer to reply; Approve and Ask for changes (which count rounds) exist only in the dashboard at /website. Not linked from the email | N6, N4 | packages/email/src/templates/preview-ready.ts:14-17; apps/admin/lib/server/project-preview.ts:61; features/website/components/website-screen.tsx:84-139 | V link, H consequence |
| B1 | Medium | Failing renewal recovery is a loop: banner See billing, Plan & billing panel "Change payment method", /billing/payment "Change" dialog that files a billing request, then staff send a link. Payment-failed email says "Pay now" but lands on /billing | N9, N7 | features/billing/components/billing-screens.tsx StatePanel renewal-failing; payment-method-request.tsx header (gate G7); packages/shared/src/server/payment-emails.ts:164 | V |
| U1 | Medium | No streaming or skeleton: no `Suspense` anywhere; only `(app)/business/loading.tsx` and the affiliate loading file exist. `DataTableLoading` and `MetricStripLoading` are not used by pages. A first load waits for all loaders; a client navigation keeps the old page until ready (R) | N1 | app tree (find loading.tsx); grep Suspense returns none | V |
| U2 | Medium | Dropped request handling is not shared. `useActionForm` has no catch; 21 files use `useActionState` with no try; only about 15 of 63 action-calling components catch (business `use-section-form.ts:63-69`, blog post editor, calls, team remove, legacy review). A request that never gets an answer reaches `RouteError` and replaces the page, losing typed content | N9, N5; WCAG 3.3.1 n/a | features/settings/components/use-action-form.ts:20; app/route-error.tsx; E2E-REVIEW-2 O-2 | V (counts by grep) |
| U3 | Medium | Unsaved edits are lost on an in-app link: `beforeunload` only in the post and taxonomy editors; `SaveBarHost` has no navigation guard | N3, N5; WCAG 3.3.4 n/a (not legal/financial) | features/blog/components/post-editor.tsx:190; taxonomy-editors.tsx:52; features/business/components/save-bar-host.tsx | V |
| L1 | Medium | Two Social experiences chosen by server env (`SOCIAL_AUTO_URL` and key): legacy page plus See posts and Analytics, or the v4 overview. The legacy tree uses raw Phosphor imports, arbitrary rem widths and its own button classes, which lint forbids in the v4 tree. Analytics and See posts 404 without the env | N4 | app/(app)/social/page.tsx:23-26; legacy-social/components/review-view.tsx; review-workspace.tsx:31-43; social/analytics/page.tsx:17 | V |
| N1 | Medium | Command search lists only sidebar links plus children Pages and Invoices. Blog, Domain, Brand kit, Checklist, Settings tabs, Help contact, What's new, Social review and Analytics cannot be searched | N7, N6 | features/shell/rules.ts:82-86, 180-188 | V |
| N2 | Medium | /checklist has no sidebar, phone-tab or search entry; only Home and old /onboarding aliases | N6 | features/shell/rules.ts:112-127 | V |
| N3 | Medium | Blog and Domain have no nav before launch (Website Overview draws no tab strip for none, setup, kickoff, preview, building) | N6 | features/website/components/website-screen.tsx:63-80, 202-208 | V |
| E2 | Medium | Invite page validates token format only; an expired, revoked or used invite shows "Join the team" and fails after pressing the button | N5, N9 | app/invite/[token]/page.tsx:20-54; accept-invite.tsx:12-17 | V |
| N6 | Medium | One request has two surfaces and three entry URLs (sheet at ?open=, page /requests/<id>, alias /support/<id>) used by different emails and the bell | N4 | requests-table.tsx:30-50; shell/rules.ts:277; request-notify.ts:35; staff-opened-request.ts:85 | V |
| L2 | Low | Two parallel server trees (src/platform used by API routes, src/features by pages) both define resetPasswordPath, invitePath and the onboarding alert. Divergence risk | N4 | platform/lib/team/rules.ts:130 vs features/team/rules.ts:88; platform/lib/account-recovery-form.ts:12 vs features/entry/rules/account-recovery-form.ts:12 | V |
| B3 | Low | Home Pay button is not role-checked; a non-owner sees Pay then the checkout owner-only banner | N5 | features/home/components/home-screen.tsx:100-110; checkout-screen.tsx:36-40 | V |
| B4 | Low | A viewer on `/checkout/charges/<id>` gets a 404, not a message | N9 | app/(pay)/checkout/charges/[id]/page.tsx:85 | V |
| N7 | Low | Editors can Approve and go live; only viewers are blocked. Owner decision | N5 | features/website/components/preview-decision.tsx:98-100; website/actions.ts:44 | V code, H policy |
| N8 | Low | Enquiries has its own sidebar item and a phone-tab slot for every paid customer, including those with no website or chatbot | N8 | features/shell/rules.ts:121, 158-174 | V code, H impact |
| U4 | Low | Home "Book a call" disappears without explanation when the booking read fails | N1, N9 | features/home/components/home-screen.tsx:55 (R: E2E-REVIEW-2 O-4) | V |
| U6 | Low | Sign-up code step does not survive refresh (client state) | N5; WCAG 3.3.7 redundant entry | sign-up-form.tsx:80-103 | V |
| L3 | Low | /social/accounts, /social/ads, /social/content use temporary `redirect()` while every other alias is permanent (the R2-01 rule) | N4 | app/(app)/social/accounts/page.tsx, ads/page.tsx, content/page.tsx | V |
| A1 | Low | (auth) and (pay) frames have `main#page` with no skip link and no `tabIndex=-1`, unlike (app). Pages are short, so WCAG 2.4.1 is probably met | WCAG 2.4.1 | app/(auth)/layout.tsx:13; app/(pay)/layout.tsx:23 | V |
| A2 | Low | Focus Not Obscured (2.4.11): sticky top bar (`sticky top-0 z-20`), fixed SaveBar and fixed phone tab bar, and no `scroll-padding` or `scroll-margin` in globals.css. Needs a real-browser keyboard check | WCAG 2.4.11 | top-bar.tsx:24; save-bar.tsx:20; styles/globals.css (no scroll-padding) | I |
| A3 | Low | Command search input is `role=combobox` with `aria-expanded` always true and `aria-controls` pointing at an element that is not rendered when there are no results | WCAG 4.1.2 | features/shell/components/command-search.tsx:63-66, 78-83 | V |

## 2. Positive evidence (kept so fixes do not regress)

- Banner uses `role=alert` for negative and `role=status` otherwise (ui/banner.tsx:27). V.
- First invalid field takes focus after a refused submit (R2-02), implemented in ui/field.tsx:39-41. V.
- Default control height 44px on touch and 36px on desktop; small variant 30px (styles/tokens.css:85-87, 109-111), above the 24px minimum of 2.5.8. V.
- `tokens.contrast.test.ts` fails the build if a token pair drops below its ratio (CLAUDE.md). R, test file exists.
- Autocomplete: `one-time-code` on the sign-up code field, current-password on the delete form. V (sign-up-form.tsx:124; delete-account-flow.tsx). 3.3.8 accessible authentication looks fine (paste allowed; Turnstile is a risk to check in a browser, U).
- Reduced motion respected (styles/globals.css:324). V.
- Payment waiting component has delayed text and a support mailto. V (checkout-screen.tsx:25-31).

## 3. Per-family findings

| Family | Screens | Findings | Sev |
|---|---|---|---|
| Entry (sign in, sign up, forgot, reset, setup, invite) | app/(auth)/* , app/invite | U6, E2, reset form shows for used token (reset-password page comment), no return URL (N5) | Med |
| First payment (start, checkout, pay pages) | app/(pay)/* | C3, B3, Help is mailto only, no skip link (A1). Waiting, failed, under-review all have copy | Med |
| Home | app/(app)/page.tsx | 15 states in one page (home/rules.ts:38-55); U4; B3 | Med |
| Website | /website, /pages, /domain | N3, E1; approve confirm and focus handling good (preview-decision.tsx:28-30) | Med |
| Blog | /website/blog/* | N1, U3, create-then-edit two screens for a single field on authors and categories (create-form.tsx) H | Low |
| Social and Ads | /social, /ads, /social/* | C1, C2, L1, L3; Ads has no primary CTA and no ads-specific ask | High |
| Requests | /requests, /requests/[id] | N6, U2 | Med |
| Billing | /billing, /invoices, /payment | B1, C2, C3; add and cancel dialogs have clear destructive labelling (services-panel.tsx:96 variant danger) | Med |
| Settings and privacy | /settings/* | D3 silent Team redirect (nav doc); delete reachable only from Privacy; notification topics not mapped to every email (I) | Low |
| Reports | /reports/* | Link hidden until first report; PDF failure plain text (pdf/route.ts:18-21) | Low |
| Affiliate | /affiliate | separate persona, own error and loading files | Info |

## 4. E2E-REVIEW-2.md claims re-checked against current code

Source: docs/customer-app-v4/E2E-REVIEW-2.md (3 Nov 2026), Reported in historical document. Re-check on c702f6c7.

| Claim | Status now | Evidence | Label |
|---|---|---|---|
| O-1 Only Business profile has a loading skeleton; no Suspense | Still open | `find` shows only (app)/business/loading.tsx and affiliate/(portal)/loading.tsx; no Suspense import in src | V |
| O-2 A dropped request on most forms shows the route error and loses typed content (33 client components, 3 handled) | Still open, small progress: per family below | use-action-form.ts:20 (no catch); 21 useActionState files, ~15 catches in 63 components | V |
| O-3 Unsaved changes lost on in-app links; beforeunload only | Still open | post-editor.tsx:190, taxonomy-editors.tsx:52, save-bar-host.tsx | V |
| O-4 Home Book a call disappears silently | Still open | home-screen.tsx:55 | V |
| O-5 Help and calls shows two identical error banners | Probably open (two panels share one `loadCalls` read); not re-rendered | features/calls/loader.ts, help-screens.tsx | I |
| O-6 Panels omitted when empty (Pages, campaigns, invitations, flat enquiries chart) | Still true in code | social-screens.tsx:136 returns null for empty campaigns; website-screen.tsx:173 hasPages | V |
| R2-01 Aliases permanent | Fixed for content, details, oyechats, website/enquiries, login sign-up branch; three social aliases still use `redirect()` | social/accounts, ads, content pages | V |
| R2-02 Focus to first error | Fixed in shared Field | ui/field.tsx:39-41 | V |
| R2-03 Cmd K focus on search box | Fixed | command-search.tsx:57 `initialFocus={input}` | V |
| R2-04 Business profile dropped-save | Fixed for business only | use-section-form.ts:63-69 | V |
| R2-05 Blog clock | Not re-checked | post-editor.tsx | U |
| R2-06 Taxonomy beforeunload | Fixed | taxonomy-editors.tsx:52 | V |
| R2-07 Billing notice read failure | Fixed | billing-screens.tsx Notices PanelError | V |

### Dropped-request handling by form family

| Family | Components | Handles a rejected action call | Status |
|---|---|---|---|
| Business profile sections (contact, hours, announcement) | use-section-form.ts | Yes, form stays, "We could not save that" | Fixed |
| Blog post editor | post-editor.tsx:51 | Yes (one catch) | Fixed (partial, not audited per call) |
| Preview feedback (Ask for changes) | preview-decision.tsx:61 `useActionState` | Server failures return `actionFail` and the body is held in `useState`; a rejected call is not caught | Open for rejections, content kept for returned failures |
| Preview approve | preview-decision.tsx:24 | Not caught | Open |
| New request, reply | new-request-dialog.tsx, reply-form.tsx | No catch | Open |
| Billing add, cancel, reactivate, details | services-panel.tsx, reactivate-card.tsx, billing-details-form.tsx | No catch | Open |
| Checkout pay, code | pay-form.tsx, code-form.tsx | No catch | Open |
| Entry (sign in, sign up, reset, setup, forgot) | features/entry/components/*.tsx | No catch; sign-up keeps fields in state so a returned failure keeps them | Open for rejections |
| Settings (profile, password, notifications, nominee, delete) | features/settings/components/*.tsx via useActionForm | No catch | Open |
| Team (invite, revoke) | invite-dialog.tsx, revoke-invite-button.tsx | No catch (remove-member has one) | Open |
| Checklist items | features/checklist/components/*.tsx | No catch | Open |
| Social approvals | approvals-panel.tsx:50 | No catch | Open |
| Calls (book, cancel, slot picker) | features/calls/components/*.tsx | Yes (one catch each) | Fixed |
| Legacy social review | use-review-action.ts:33 | Yes | Fixed |

Caveat: "No catch" is from grep of `catch` per file. A form could use a wrapper not matched by that grep; behaviour on a real dropped connection was not run (U).

### Incomplete loading skeletons

All pages except /business and the affiliate portal have no `loading.tsx`. `Panel`, `DataTable` and `MetricStrip` have loading variants (components/panel.tsx, data-table.tsx, metric-strip.tsx) that no page uses. V. Impact is a design hypothesis (H): on slow networks, a navigation shows no feedback beyond the old page staying put.

## 5. Mobile notes (code only)

- Five-tab bar, Services and More as menus; Billing and Settings two taps (rules.ts:158-174). SaveBar sits above the tab bar (`bottom-15`). Business loading and blog editor were tested at 390 by the earlier pass (R).
- Tables hide secondary columns on phone (`hideOnPhone`, social-screens.tsx CampaignsTable); DataTable opens an inspector sheet.
- Legacy social uses fixed rem max widths and a side channels column (`lg:flex-row`); phone layout `order-first` (review-view.tsx). Browser check needed (U).


---

<!-- source: admin-operations/admin-roles-and-permissions.md -->

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


---

<!-- source: admin-operations/client-workspace-review.md -->

# Per-client workspace review (`apps/admin/app/(protected)/clients/[businessId]/*`)

Labels: Verified in code | Reported in historical document | Inferred | Unknown. Paths relative to `brandbasket-platform/`.

## 1. Frame

| Part | What it does | Evidence |
|---|---|---|
| Layout | Reads the client once, shows avatar, name, owner, plan tier, website stage, billing currency, service tags (website, social, ads, monitoring from live bundled add-ons), a "Leaving, erased on" pill, and a five-step website `StageTrack`. Refuses unknown ids with `notFound`. Verified in code | `clients/[businessId]/layout.tsx:27-59` |
| Stage track | `clientStage(client)` only knows website build states (lead, setup, building, preview, live, paused). A customer with Social and no website shows "setup". Verified in code | `lib/pipeline.ts:7-49` |
| Tabs | Five: Overview, Website, Plan and billing, Messages, People. No tab is capability-gated; money is gated inside the Plan and billing tab. Verified in code | `lib/client-tabs.ts:15-21` |
| Access log | Every tab logs `client.view` (People logs `client.people_view`) with the tab name. Verified in code | `lib/server/client-page.ts:25-34` |
| Notice forwarding | Old links with a notice query are forwarded to the owning tab (`NOTICE_TABS`). Verified in code | `lib/client-tabs.ts:51-85` |

## 2. Tabs

### Overview `/clients/{id}`
Next step card (website only), What happened (6 recent activity lines), Owner facts, Kickoff call booking facts, Money (finance and admin only), What they told us (pre-payment intake), Setup answers (legacy website checklist n of m).
Duplicates: Activity is a longer fold on Messages; kickoff facts repeat on Website and Calls; Money repeats part of Plan and billing. Verified in code (`page.tsx:59-171`).
Missing: owner of the client, per-service state, the post-payment Social and Search setup answers (not read anywhere in the console), due dates.

### Website `/clients/{id}/website`
Largest tab (323 lines plus about 15 action groups). Notices; billing and rounds warnings; Next step card with Start building, Send preview or Mark live; delivery facts; Move-to-own-domain panel; Preview versions; Customer feedback; More controls fold (launch email resend, builder, extra round, launch day, cancel, website build section: start, hold, resume, preview picture); Domain; Notes for the builder; Logo and photos with uploader; Kickoff call; Site details fold (website URL, hosting, API token, analytics keys, features, business details, opening hours, offers, Google card).
Customer counterpart: `/website`, `/project`, `/todo`, `/domain` in the customer app.
Problems:
* Builder assignment, extra round and Cancel are inside a fold that is closed unless on hold or a move notice is showing (`website/page.tsx:112-113,201-211`). The owner is not visible on the card.
* Billing "needs attention" is a text banner that does not change any state (`website/page.tsx:133-137`, `billing-attention.ts:5-14`).
* Customer feedback is listed by round and linked to the ticket; preview versions have no feedback link (`project-preview-versions.ts:53-61`). Verified in code.
* Domain handling appears in three places: the Move section, the Domain section and Site details > Their website/hosting.

### Plan and billing `/clients/{id}/billing`
Sections in order: Posts, pages and reports; Monthly numbers; Ad campaigns; Connected accounts; Updates for the customer; Add-ons; Chatbots (only if the website was bought); Billing (finance and admin: payments, charges, refunds, invoices, billing details).
This is the real Social and Ads workspace and it is named Plan and billing. Support staff see and use everything except the last block (`billing/page.tsx:53-77`).
Customer counterparts: `/social`, `/ads`, `/reports`, `/billing`, `/billing/invoices`, `/oyechats`.
Problems:
* Service delivery (posts, ads, numbers, accounts) and billing share a tab and a URL fragment scheme (`?work=`, `?numbers=`, `?campaigns=`, `?accounts=`, `?updates=`, `?addOns=`).
* Social and Ads are one service (`SERVICE_OF_ADD_ON` maps both to `social`), so Ads cannot be listed, owned or reported on its own (`service-setup.ts:30-31`). The Posts section title is "Social & Ads" for both.
* Local SEO + AEO (`search`) branches in the work, numbers and report code are unreachable: `SERVICE_OF_ADD_ON` maps only `social-media` and `paid-ads`, so `listBoughtServices` never returns `search` (`service-setup.ts:29-30`, `work-section.tsx:23`). Dead code, not live forms. Verified in code.
* No assignee on any item. No count of posts due this week or approved and unpublished.
* A second report path: the "report link" saved here (`monthly_reports`, `deliverables.ts:77-96`) and the drafted reports under `/reports` (`reports` tables), unrelated rows with the same customer-facing idea.

### Messages `/clients/{id}/requests`
Change requests (quote, start included, start free, send for checking, done, decline), Calls (team calls held, summary), Requests table (25 newest tickets), Activity fold (200 lines).
Customer counterparts: `/requests`, `/requests/{id}`, `/requests/calls`.
Problems: change requests are only visible here; the global `/support` shows the underlying tickets without the quote or state (`support/page.tsx:97-121`). A paid, started request is "waiting on client" in the global queue (`reply-clock.ts:23-29`). Two lists of the same tickets (here and in `/support`). Verified in code.

### People `/clients/{id}/people`
Members, rename owner, Leaving (restore or extend, admin only). Duplicates `/leaving`, Compliance "Accounts being erased" and the Clients "Leaving" stage. Verified in code (`people/page.tsx`).

### Redirect-only pages
`/project` redirects to Website, `/services` redirects to Plan and billing (this is `LegacyServicesPage`, `services/page.tsx:5-14`), `/activity` redirects to Messages#activity. They exist for emailed or bookmarked links; none holds logic. Verified in code. Safe to remove once no outbound message links them (Unknown whether any email template does; `rg` for the paths in `packages/email` was not run).

## 3. Duplication with global lists

| Global screen | Client duplicate | Overlap |
|---|---|---|
| `/projects` Board | Website tab Next step card | same stage and due data |
| `/calls` | Website Kickoff call; Messages Calls | same "mark held" action in three places (`kickoff-actions.ts` x2, `calls/kickoff-actions.ts`) |
| `/support` | Messages Requests table | same tickets, different filters |
| `/reports` | Plan and billing report link | two report systems |
| `/payments`, `/invoices` | Billing section | register versus per-client |
| `/leaving`, `/access-log` Compliance | People Leaving | closures |
| Settings Google states | Website > Site details Google card | account versus per-client |
| Today add-on rows | Plan and billing Add-ons | queue versus action |

## 4. Dormant and unimplemented inside the workspace

| Item | Class | Evidence |
|---|---|---|
| Listing section, listing tags, verified and trusted marks | Dormant, page section hidden by `sellsDirectory`, but its reads (`readDirectoryStatuses`, `findPlaces`, `findListingPlacement`) still run on every Site details render | `website/site-details.tsx:54-93,145` |
| Features: time zone and modules (appointments) | Dormant business modules; actions `setModuleAction`, `setTimeZoneAction` live | `clients/[businessId]/actions.ts:376-449` |
| Opening hours, What they offer, Business details | Directory/profile data shown to staff; Brandbasket customers' customer app does not appear to edit offers (Unknown) | `site-details.tsx:170-204` |
| Chatbots (OyeChats) | Live but only for website customers | `billing/page.tsx:69-76` |
| Monitoring | Tag only, no work screen | `service-tags.tsx:9` |
| Search (Local SEO + AEO) work | Dormant and unreachable (service not sold, never returned as bought) | `service-setup.ts:29-30` |
| Free-listing accounts | Dormant | `CLAUDE.md` "Dormant code" |

## 5. What a service-specific per-client workspace should contain

Header: client name, plan, billing state chip (paid, past due, lapsed), one named owner per service, next customer-visible event, open Today items for this client.

| Tab or card | Contents | Owner and state fields needed | Why (evidence) |
|---|---|---|---|
| Overview | One card per service bought: Website, Social, Paid Ads, Monitoring. Each card: owner, state, next action, due, "customer currently sees" line, last staff action | `service_owner`, per-service state, `next_due_at` | Today only models website (`client-next-step.ts`) |
| Website | Build project (stages, preview versions with feedback, launch checks), Domain and hosting, Site details, Kickoff | builder (visible), preview-awaiting clock | `website/page.tsx` already has most |
| Social | Setup answers from the customer (new read of `service_setup`), accounts, content calendar of posts with due dates, approval inbox, published list, numbers, report | owner, post due queue, approval wait clock | unread `service_setup`; `work-section.tsx` |
| Paid Ads | Setup answers, ad accounts, campaigns, creative approvals (needs new data), spend notes, results, report | owner, campaign state | `campaigns-section.tsx`; no state machine today |
| Monitoring | Weekly check list and issues found across website, social, ads | owner, last check date | UNIMPLEMENTED: tag only |
| Billing | Plan, add-ons, payments, charges, invoices, refunds; lapse state with policy | finance only | `billing-section.tsx` |
| Messages | Tickets and change requests in one list with state and owner; calls; activity | ticket owner | `requests/page.tsx` |
| Account | People, owner name, closure, privacy | admin actions | `people/page.tsx` |

Every action on any tab should end with a "Customer sees" line and a link to the customer screen, as the Website tab already does for stages (`delivery-tab.tsx`). Social and Billing actions have no such line today.

