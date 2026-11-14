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
