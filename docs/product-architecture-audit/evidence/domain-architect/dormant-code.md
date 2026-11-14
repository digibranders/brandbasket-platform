# Dormant versus live code (domain-architect audit)

Commit c702f6c7. Labels as in other files. CLAUDE.md says the directory and clinic pages and public booking endpoints were removed in plan 35 and the "free-listing account type (signup_choice = listing_only, a business of kind listing)" is switched off. The code agrees for most of it and disagrees for two items (rows marked LIVE).

## 1. Classification table
| Item | Status | Evidence |
|---|---|---|
| `businesses.kind = 'listing'` as a value | LIVE, not dormant. It is the state of every new sign-up until the first payment; `isAwaitingFirstPayment` = kind listing and `signup_choice = managed`. First payment converts to `website`. | features/entry/server/listing-account.ts:119 (insert), checkout/server/entry.ts:20-23, checkout/actions.ts:62-66, directory-ads.ts:789-802, (pay)/checkout/pay/page.tsx:25 (V) |
| `signup_choice = 'managed'` | LIVE (only offered choice) | features/entry/rules/brand.ts:13, sign-up-form.tsx:91 (V) |
| `signup_choice = 'listing_only'` | Dormant: no UI offers it. Code still parses `plan=free` to it (account-entry.ts:99) and sets INR for it (listing-account.ts:182); `offersChoice` refuses it (brand.ts:20). | V |
| `signup_choice = 'own_website'` | Dormant legacy value kept for old accounts (schema businesses.ts:25-29) | V |
| Directory tables and queries (`directory-*` schema files 14, about 30 tables; 19 `queries/directory*.ts`; 17 `directory_*` enums plus 2 geo enums) | Dormant data layer, present, migrated, tested (many `directory-*.integration.test.ts`), never read by customer pages | V |
| Admin directory, ads, deals, geography sections | Dormant by flag: `DirectoryOnly` returns 404 unless `adminBrand().sellsDirectory`, which is hard-coded `false` (admin/lib/brand.ts:30, components/console/directory-only.tsx:10-12). BUT the server actions in those folders have no such check (grep `sellsDirectory`: only the layout wrapper and site-details.tsx:145). Pages 404, actions remain callable by any authenticated staff who has the action id (CODE-PATH risk, I). | V |
| Admin media routes for directory assets (`/directory-pictures/[id]`, `/staff-ad-pictures/[id]`) | Dormant routes still routable | V |
| Customer `/api/product-photos` | Dormant directory-listing feature still routable; uses the legacy guard stack and `isAwaitingMembership` | api/product-photos/route.ts:19-30 (V) |
| Customer `/api/privacy-requests/contribution*` (visitor contributions, directory visitors) | Probably dormant (directory visitor identities); intake token route still live | route comments; platform/lib/server/directory-visitor.ts (I) |
| Charge kinds `listing_promotion`, `directory_ad`, `plan_upgrade`, `press_release` | Dormant kinds; code that opens them lives only in dormant paths (I) | schema/billing.ts:484-494 |
| `plan_upgrades`, `plan_tier` has only `managed`, Care/Premium words | Dead machine (see state-machines.md section 10) | schema/billing.ts:88, 595 (V schema, I dead) |
| Clinic: `appointments`, `patients`, `practitioners`, `business_module = 'appointments'` | Partly LIVE. Customer UI removed (no appointments or patient reads in `apps/customer/src` except `platform/lib/site-info*`), but staff can switch the module per client (`setModuleAction`, client-features.tsx:107 reached from website/site-details.tsx:136) and `/api/site/info` returns booking and practitioners when on (api/site/info/route.ts:30-33). So the public booking read path is live for client sites. Public booking WRITE endpoints: none in customer routes (V by route list). | V |
| `/api/site/info` practitioners and booking | LIVE read path to client websites | V |
| Legacy customer URLs (`/plan`, `/services`, `/add-ons`, `/onboarding/*`, `/personalize`, `/monitoring`, `/social/ads`, `/content/blog/[id]/preview`) | Live as redirects only | app/plan/page.tsx, (app)/monitoring/page.tsx, (app)/social/ads/page.tsx (V) |
| `apps/customer/src/platform/` (about 100 files of lib) | Ported from deleted apps/platform and still LIVE: webhook handler, site APIs, kickoff sync, lead intake, conversions, account erasure, calcom, oyechats. It is not dormant, only legacy-named. Several files are dormant (directory-api, owner-replies, photos-view, listing pictures). | V |
| `apps/customer/src/legacy-social/` | LIVE when `SOCIAL_AUTO_URL` and `SOCIAL_AUTO_KEY` are set; otherwise skipped (app/(app)/social/page.tsx:19-21). "copied as it was" with a lint exemption (shims.ts:2-3). | V |
| Local SEO + AEO / `search` service | Not sold; still typed, listed in nav only if present, admin and reports forms, checklists, requests intents, lead plan ids | see services doc (V) |
| Admin "Ads" menu | NOT the customer Paid Ads product. It is Brandbasket's own acquisition ad results (`/ad-results`, money role) and ad credit due (`/ad-credit`). Name collision. | console-rail.ts:81-87, ad-results/page.tsx (V) |
| Referral / affiliate programme | LIVE (coupons, affiliate portal at /affiliate, admin affiliates); billing "Refer a business" tab hidden pending decision G8 (billing/rules.ts BILLING_TABS comment) | V |
| `account_otp_purpose = staff_sign_in` | Dead enum value | schema/account-otps.ts:7-12 (V) |
| `domain_status` beyond `pending`/`active` | Mostly dead values | schema/onboarding.ts:127 comment (V) |
| `project_kind = redesign` | Value exists, no creator found | grep (I) |
| `add_on_subscriptions` | Legacy rows only, no creator | state-machines.md section 8 (V) |
| `templates/client-site` | Template for client websites, has its own `proxy.ts`; not an app of this monorepo build | (V) |

## 2. Doc/code mismatches to correct in CLAUDE.md (decision for owner)
1. "Still in the tree and switched off: free-listing account type (signup_choice = listing_only, a business of kind listing)". The `listing` kind is the live unpaid-account state. Suggest rewording: "kind listing = signed up, unpaid; the directory listing product is dormant".
2. "The dashboard's directory and clinic pages and the public directory and booking endpoints were removed in plan 35". True for pages and routes; but `/api/site/info` still serves booking and practitioners to client sites, `/api/product-photos` remains, and admin action files remain callable.
3. CLAUDE.md (customer) says apps/platform is deleted. True, but its code was carried into `apps/customer/src/platform` (about 100 lib files plus API behaviour). Several comments still say "the signed webhook in apps/platform" (restore-account/keep-plan/callback/route.ts:3-4) and "proxy.ts" which does not exist.

## 3. Safe to treat as dormant for refactors (I)
Directory schema and queries, charge kinds above, plan_upgrades, add_on_subscriptions creation paths, product-photos route, directory admin pages. Do not delete in this audit; they carry migrations and sold-record rows ("rows are kept on erasure", schema/add-ons.ts:9).
