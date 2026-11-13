# Customer app v4: parity checklist (old `apps/platform` customer app to `apps/customer`)

Written 2026-11-03 from the worktree `wt/customer-v4`. Source of truth for what the old app does. Plan: `docs/customer-app-v4/61-customer-app-v4-implementation-plan.md` (sections 3 and 5). Rules: `docs/customer-app-v4/BUILD-RULES.md`.

How to read: paths are relative to `apps/platform` unless they start with `packages/` or `apps/`. `PROT` = `app/app-host/(protected)`. Evidence is `(path:line)` as read in this worktree; line numbers drift, grep the quoted name. "Test" = a sibling `.test.ts(x)` exists. Part 1 is per feature area. Part 2 is the redirect table. Part 3 is the guard list.

Method note: entry, start, checkout and billing, the redirect table and the guard list were read directly. The other areas were read by delegated research agents and spot-checked; sections end with what was not read.

## Plan 61 statements that the code contradicts or does not cover

| Plan says | Code says |
|---|---|
| `/signup` "keeps `claim` and `plan` parameters" (section 3) | `claim` is not read anywhere. `/join` copies only `plan` (`lib/account-entry.ts:125-130`); a test asserts claim links open plain sign-in (`lib/account-entry.test.ts:102`). Real parameters: `new`, `plan`, `addons`, `start` (sealed ad token), `notice` |
| Free-listing flows are dropped (section 3, "Dead and dropped") | The unpaid hold IS a free-listing state: an owner who chose Managed Website is a business of kind `listing` held on `/plan` by the layout (`PROT/layout.tsx:24-30`). `/start` and `/checkout` must reproduce it. The business becomes a client when the first payment is applied |
| Domain page has "all 8" states | 9 values: `none`, `free-building`, `free`, `move-requested`, `move-connect`, `own-not-approved`, `own-getting-ready`, `own-connect`, `own-live` (`lib/domain-page.ts:16-25`) |
| Upload rules: "alt text required on photos" | Alt text is required only in onboarding step 03; on the Business page new photos are saved with `altText: null` and no field edits it (`lib/server/onboarding-media.ts:159`) |
| `/checklist` has "no send step" | A first payment submits onboarding inside the payment transaction (`lib/server/payment-confirmation.ts:144-172`); something must still move the project `onboarding` to `submitted` |
| "Cancel a service" is new screens (section 6, tag Exists) | Remove-at-next-payment already exists and refuses the last service (`lib/server/add-ons.ts:200-262`); the new work is screens and reason capture |
| `noindex` on every response | Only rewritten pages get `X-Robots-Tag` (`proxy.ts:15`); the matcher skips `/api/`, `/_next/` and static extensions (`proxy.ts:52-54`), so `robots.txt`, `security.txt` and API routes carry none |
| Route map | Missing: POST callbacks `/billing/pay/callback`, `/billing/charges/callback`, `/restore-account/keep-plan/callback`; fake-provider confirm pages; `/website/preview-image`; `/billing/receipts` emailed query form; settings export; five image routes; support attachment route; upload endpoints |
| Ticket numbers never in the list | `FY-<uuid hex>` display ref (Fynix prefix) is returned in the saved state (`packages/db/src/queries/support.ts:114`, `PROT/requests/actions.ts:70`) |
| Reports: "Staff only" read path over `report_documents` | Nothing in `apps/platform` or `apps/admin` calls `composeReport`, `moveReport` or `listSentReports`; there is no PDF generator; the only customer-visible report is the staff-pasted `monthly_reports` link (see reports) |


# Part 1. Feature areas

## entry (login, signup, forgot/reset, setup token, restore account, keep plan)

### Old routes
| File (under `app/app-host/`) | Serves | Query params read |
|---|---|---|
| `login/page.tsx` | `/login`: sign in AND create account, one page | `new=1`, `plan` (`free`, `managed`, `website,growth,search` list), `addons=` (older links), `start=` (sealed ad token), `notice=password-changed\|account-closed` |
| `join/page.tsx` | `/join` redirects to `/login?new=1[&plan=]`; copies only `plan` (`lib/account-entry.ts:125-130`) | `plan`; everything else, including `claim`, is dropped |
| `forgot-password/page.tsx` | `/forgot-password` | none |
| `reset-password/[token]/page.tsx` | `/reset-password/<token>` | none |
| `setup/[token]/page.tsx` | `/setup/<token>`: staff invite redemption, creates account and business | none |
| `affiliate/setup/[token]/page.tsx` | affiliate login-link redemption (see affiliate) | none |
| `restore-account/page.tsx` | `/restore-account`: closing account choice | `keep=<refusal reason>` |
| `restore-account/keep-plan/page.tsx` | opens Razorpay or the fake confirm for a new mandate | none |
| `restore-account/keep-plan/callback/route.ts` | POST: Razorpay return, 303 to `/restore-account` (`:11`). NOT in plan 61 route map | none |
| `error.tsx`, `not-found.tsx`, `[...missing]/page.tsx` | see shell | |

### Server actions
| File | Exports | Guard / protection |
|---|---|---|
| `login/actions.ts` | `signInCustomer`, `joinForListing` | Turnstile `checkHuman(formData, "sign_in")` (`:21`) and `"join"` (`:40`); no session guard (public) |
| `forgot-password/actions.ts` | `requestPasswordResetAction` | Turnstile `"forgot_password"` (`:17`) |
| `reset-password/[token]/actions.ts` | `resetPasswordAction` | Turnstile `"reset_password"` (`:9`) |
| `setup/[token]/actions.ts` | `completeSetup` | Turnstile `"setup"` (`:18`), per-network rate limit in `redeemSetupInvite` |
| `restore-account/actions.ts` | `restoreAccount`, `keepPlan` | `getCustomerAccess()` must be `closing` (`:11-12`, `:22-23`) |

### Lib modules
| Path | Decides / does | Test |
|---|---|---|
| `lib/account-entry.ts` | Reads the entry address: view (sign-in vs create), plan choice, basket of services, `entryHrefForJoin` | yes |
| `lib/join-form.ts` | Sign-up form schema: name max 60, business name max 200, email max 254 lowercased, 6 digit code, terms tick `agree=yes`, India-only `stateCode` | yes |
| `lib/start-token.ts` | AES-256-GCM sealed ad-landing token (`start` param): prefill name/email/phone + attribution; 1 hour life; attribution value caps (utm 120, gclid 120, fbp 60, ga_client_id 40...); key from `LEADS_API_TOKEN` | yes |
| `lib/start-attribution.ts` | Turns the sealed attribution into `NewSignupAttribution`; null when no secret, bad or expired token | yes |
| `lib/login-notice.ts` | Fixed messages for `?notice=` (password-changed, account-closed) | yes |
| `lib/auth-retry.ts`, `lib/use-otp-retry-cooldown.ts` | Retry facts and client cooldown carried from the budget that blocked (send vs confirm scopes) | auth-retry yes, hook no |
| `lib/email-hint.ts` | "m•••@example.com" hint for the code step | yes |
| `lib/setup-form.ts` | New password rule (min 8, max 128, letter, number, symbol; `packages/auth/src/password-policy.ts:9-14`), setup form parse, terms tick | yes |
| `lib/account-recovery-form.ts` | Forgot/reset form parsing, `FORGOT_PASSWORD_PATH` | no |
| `lib/account-settings-form.ts` | `RESTORE_ACCOUNT_PATH`, `ACCOUNT_CLOSED_NOTICE` constants | yes |
| `lib/keep-plan-copy.ts` | Keep my plan note and refusal wording for `?keep=` | yes |
| `lib/brand.ts` | Which plans a host sells (`offersChoice`), join choices; Brandbasket sells Managed Website only | yes |
| `lib/server/sign-in.ts` | Phone-or-email password sign-in; phone turned into the account email or a placeholder so non-accounts cost the same; `firstBlockedSignInLimit` | yes |
| `lib/server/customer-sign-in.ts`, `customer-sign-in-form.ts` | Better Auth `signInEmail`; identifier parsing (email or E.164 phone) | yes, yes |
| `lib/server/listing-account.ts` | Two-step sign-up: `requestJoinCode`, `createListingAccount` (account, phone, consent, business, lead, attribution, ads report, sign in) | yes |
| `lib/server/account-email-code.ts` | Emailed sign-up code: 6 digits, 600 s, 5 tries, HMAC; send limits ip 10/h, email 3/10 min and 8/day, global 1000/day, confirm 30/h per ip | yes |
| `lib/server/account-consent.ts` | Writes Terms and Privacy consent proof (DPDP s.6) when the account exists | yes |
| `lib/server/account-recovery.ts` | Reset link request (6/h per ip, 3/h per email or phone) and use (10/h per ip) | yes |
| `lib/server/setup.ts` | Invite redemption: page view limit 60/h per ip, redeem 10/h per ip, `verify-existing` mode, `redeemInviteIntoBusiness`, tenant sync | yes |
| `lib/server/keep-plan.ts` | Keep my plan: new mandate that carries the cancelled plan; checkout rate limit shared | no (integration test only) |
| `lib/server/account-exit.ts` | `restoreAccountFor`, closure state (also settings) | yes |
| `lib/server/auth.ts`, `auth-reset-mail.ts` | Better Auth instance, reset email builder, `resetPasswordPath` | auth-reset-mail yes |
| `lib/server/conversions.ts` | `reportSignUpToAds` (GA4 measurement protocol, consent gated) and `reportFirstPaymentToAds` | yes |
| `lib/server/website-api-auth.ts` | `leadsApiToken()`, `hasValidWebsiteToken`: the shared secret that also seals the `start` token | no |
| `lib/server/env.ts` | `emailCodeBypassed()` (EMAIL_CODE_BYPASS dev switch), origin normalising | yes |
| `lib/server/ip-key.ts` | IPv6 aware rate-limit key | yes |
| `lib/server/affiliate-access.ts` | `landingForSignedInUser`: affiliate-only users land on `/affiliate` | no |

### Components with logic
| Path | Logic |
|---|---|
| `components/panel/join-form.tsx` | Two-step state (details, then code), resend, retry cooldown, plan question, basket line with INR/USD price by country, phone country picker, hidden `start` field carried through both steps |
| `components/panel/entry-switch.tsx`, `entry-screen.tsx` | Sign in vs create switch; `ENTRY_LEDE_SLOT_ID` slot for "Go back" |
| `components/panel/setup-form.tsx`, `forgot-password-form.tsx`, `reset-password-form.tsx` | Form states, field errors, Turnstile action names |
| `@brandbasket/shared/ui/turnstile-scope`, `ui/panel/sign-in-form` | Turnstile widget scope and sign-in form (shared package, not importable by `apps/customer`; must be rebuilt) |

### Package functions used
`@brandbasket/auth`: `createVerifiedEmailAccountWithGrant`, `createAccountWithGrant`, `AccountAlreadyExistsError`, `isInvalidCredentialsError`, `isInvalidTokenError`, password policy. `@brandbasket/db`: `consumeRateLimit`, `findUserByEmail`, `findUserByPhone`, `phoneNumberIsTaken`, `setUserPhoneNumber`, `isPhoneAccountEmail`, `phoneAccountEmail`, `createUnlistedAccountBusiness`, `recordSignupLead`, `recordSignupAttribution`, `claimAccountOtpAttempt`, `findRedeemableInvite`, `redeemInviteIntoBusiness`, `InviteNoLongerRedeemableError`, `findOpenClosureForUser`. `@brandbasket/shared`: `server/turnstile-request` (`checkHuman`), `lib/sign-in-limits`, `server/rate-limits` (`firstBlockedSignInLimit`), `lib/client-ip`, `lib/pricing` (`currencyForCountry`), `lib/validation/phone` (`parsePhoneEntry`), `lib/appointments/otp`, `lib/billing/bundle` (`readBundleSelection`), `lib/site-config`. `@brandbasket/email`: `signupCodeEmail`, `passwordResetEmail`, `createOutboxTransport`, `createEmailDelivery`.

### Behaviours a rebuild must keep
- Sign-in accepts email OR mobile number plus password; a number with no account takes the same path (placeholder email), so nothing says which numbers exist (`lib/server/sign-in.ts:32-35`).
- Sign-in limits in order: 20 per 15 min per ip, 8 per 15 min per account+ip, 50 per 15 min per account; keys have no surface so staff and customer share them (`packages/shared/src/lib/sign-in-limits.ts:22-27`). A block fires `noteSecurityEvent("sign_in_blocked")` without awaiting (`sign-in.ts:42`).
- A wrong password says "That email|number and password don't match an account." and echoes exactly what was typed (`sign-in.ts:52-53`).
- Successful sign-in lands via `landingForSignedInUser`: affiliate-only users go to `/affiliate`, anyone with a business goes to `/` (`lib/server/affiliate-access.ts:48-51`, `login/actions.ts:25`).
- Already signed in on `/login`: member goes `/` (or `/plan` if the link names a plan), closing account goes `/restore-account`, affiliate with no business goes `/affiliate`, a user with no business sees "Almost there" with sign out and a mailto (`login/page.tsx:58-87`).
- Sign-up is two posts of one form: no code sends a code, with code creates the account; "Send a new code" strips `otpId` and `code` (`login/actions.ts:42-46`).
- Sign-up order: Turnstile, brand offers the plan (`offersChoice`), parse, phone valid and not taken BEFORE the code is spent, email not taken, ip limit 10 code requests per hour BEFORE the account lookup so the answer cannot enumerate addresses (`listing-account.ts:77-91`, `:124-127`).
- Join account budget is 5 per hour per ip, counted only after a code is proven, so wrong codes never spend it (`listing-account.ts:45`, `:147-152`).
- Code: 6 digits, 10 minutes, 5 tries; a non-6-digit entry costs no try; remaining tries are shown "N tries left" (`account-email-code.ts:23`, `:148-178`; `listing-account.ts:136-140`).
- A phone-only placeholder email is refused as a sign-up address (`listing-account.ts:77`, `:123`).
- The mobile number is REQUIRED at sign-up, saved unproven; if another sign-up took it meanwhile the owner is still signed in (`listing-account.ts:165-167`).
- Account is created before the business; a business failure is tolerated (`UserAlreadyHasBusinessError`) and the owner is signed in anyway (`listing-account.ts:189-194`).
- Terms consent is written as soon as the account exists, before the business (`listing-account.ts:169-171`).
- Every sign-up writes a lead to the staff Leads list with plan and phone, best effort (`listing-account.ts:184`, `:215-236`). A rebuild that skips `recordSignupLead` makes unpaid sign-ups invisible to staff follow-up.
- Attribution: read from the sealed `start` field only; saved best effort via `recordSignupAttribution`, then `reportSignUpToAds` (not awaited) (`listing-account.ts:185-188`; `lib/start-attribution.ts:30-35`).
- Currency is fixed at sign-up from the country: INR for India, USD elsewhere (`listing-account.ts:182`). State code (GST state) is asked only for India (`lib/join-form.ts:88-91`).
- The `claim` parameter is already dead: the old `/join` copies only `plan`, and `account-entry.test.ts:102` asserts directory claim links open plain sign-in. Plan 61 says `/signup` "keeps `claim`"; there is nothing to keep.
- `start` token: valid 1 hour, ignored with no secret, repeated param or bad token; prefill name, email, phone (`login/page.tsx:141-144`; `start-token.ts:14`, `:78-95`).
- `plan` parameter forms: `free`/`managed`, comma lists `website,growth,search` (mapped to catalogue ids), older `plan=managed&addons=`; Brandbasket opens Create account for ANY plan value, even one it does not sell (`account-entry.ts:30-34`, `:64-78`, `:89-94`). The basket rides in a hidden `services` field and in the post-sign-up redirect (`login/actions.ts:80-83`).
- After sign-up the owner goes to `/personalize?services=...` (the questions), never straight to the plan (`login/actions.ts:83`).
- Prices on the form are computed per currency via `membershipPriceLine` and `basketNetCents`, not in the page (`login/page.tsx:129-138`).
- Form text promises no real code check when `EMAIL_CODE_BYPASS` is on (`login/page.tsx:139-140`).
- Forgot password: 6 per hour per ip, 3 per hour per email or per number (a number also spends the account's email budget), neutral "accepted" whatever happens, over-budget answers "accepted" too, delivery runs in `after()` so timing leaks nothing, a no-account address still does a rolled-back outbox write (`account-recovery.ts:23-27`, `:47-99`).
- Reset link use: 10 per hour per ip; dead link vs limited are distinct outcomes; resetting signs every device out (`account-recovery.ts:105-114`).
- Reset email is rendered with the request host's brand and origin (`lib/server/auth.ts:55-60`).
- Setup link: view budget 60/h per ip on a different key from redeem 10/h so reloading cannot spend submit attempts; a rate limit never turns a good token into a dead link (`setup.ts:24-26`, `:64-86`).
- Setup redeem: terms tick required to create an account (not for verify-existing); duplicate email goes to an explicit "enter that account's password" step using the SAME sign-in limits; race of two submissions is stopped by `redeemInviteIntoBusiness` as the transaction gate (`setup.ts:133-181`, `:193-214`; `setup/[token]/actions.ts:27-41`). Payload tenant sync runs after (`setup.ts:210`).
- Setup success redirects to `/` (`setup/[token]/actions.ts:44`).
- Restore account: any signed-in closing user can restore only their own closure; sign out leaves the deletion as is; "Keep my plan" is offered only when `loadKeepPlanOffered`; refusal returns as `?keep=<reason>` (`restore-account/actions.ts:10-25`, `page.tsx:31-65`).
- A closing account is redirected to `/restore-account` by `requireCustomerAccess` on EVERY page (`customer-access.ts:106`); `/login` also sends it there.
- Keep plan callback is POST-only, UX only, always 303 to `/restore-account` (`restore-account/keep-plan/callback/route.ts:11`); the page sets it as Razorpay `callbackUrl` (`keep-plan/page.tsx:53`). The fake provider's keep confirm shares the path `/restore-account/keep-plan` (`packages/billing/src/fake-provider.ts:34`).
- Notices after sign-out flows are fixed strings keyed by `?notice=`; unknown values show nothing (`login-notice.ts:11-13`).

### Old paths and query params that need a redirect
`/join`, `/login?new=1`, `/login?plan=`, `/login?addons=`, `/login?start=`, `/login?notice=` (sign-in page keeps it), `/setup/<token>` and `/affiliate/setup/<token>` (emails already sent), `/restore-account`, `/restore-account/keep-plan`, POST `/restore-account/keep-plan/callback`.

---

## start (pre-payment questions, old `/personalize`)

### Old routes
| File | Serves | Query params |
|---|---|---|
| `(protected)/personalize/page.tsx` | `/personalize`: one question per step, then summary | `services` (comma catalogue ids), `q` (question field or `summary`) |

### Server actions
`(protected)/personalize/actions.ts`: `saveAnswerAction`, `toggleServiceAction`, `continueToCheckoutAction`, `skipIntakeAction`. Guard `requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" })` (`:13`). No rate limit, no idempotency key (answers are upserts).

### Lib modules
| Path | Decides / does | Test |
|---|---|---|
| `lib/intake/links.ts` | `personalizeHref(services, step)`, param names `services`, `q`, `summary` | yes |
| `lib/intake/answers.ts` | `parseIntakeAnswer`: validates a posted answer against the question's own options, returns a column patch | yes |
| `lib/server/intake.ts` | `loadIntake`, `saveIntakeAnswer`, `saveIntakeServices`, `completeIntake` through `withTenantScope` | no |
| `lib/first-look.ts` | `SERVICE_KEY_OF`: catalogue id to question group key | yes |
| `lib/membership.ts` | `readSelectedServices`, `servicesAfterToggle` (never removes the last service), `membershipHrefWithServices` | yes |
| `lib/checkout-ledger.ts` | `ledgerSummary`, `ledgerRows` for the price aside (browser and server) | yes |
| `lib/server/membership-checkout.ts` | `loadMembershipCheckout`: plan, forfeited package offer, ever paid, services for the aside | yes |
| `@brandbasket/shared/lib/intake/questions` | Question catalogue: `questionAfter`, `questionBefore`, `visibleQuestions`, `firstUnanswered`, `summaryRows`, `questionPosition`, `unansweredCount`, `NO_ANSWERS` | (shared package) |

### Components with logic
`components/intake/question-form.tsx` (single vs multi, optional, saved values, back link), `intake-summary.tsx` (answered rows, add or remove service, unanswered count), `intake-aside.tsx` (ledger aside, Change link hidden on summary).

### Package functions used
`@brandbasket/db`: `findClientIntake`, `saveClientIntakeAnswers`, `completeClientIntake`, `withTenantScope`. `@brandbasket/shared`: `lib/billing/bundle` (`bundleLines`, `readBundleSelection`), `lib/billing/add-ons` (`MONTHLY_ADD_ON_IDS`, `addOnById`), `lib/money`.

### Behaviours a rebuild must keep
- The page is only for an account that has NOT paid (`entry.kind === "listing"`); a member is redirected to `/` (`personalize/page.tsx:35-36`).
- No `q` param: go to the first unanswered visible question, or the summary when all answered (`:45`, `:49`). A `q` naming a question not visible for this basket goes to the summary (`:50`).
- Every answer is saved as given, so refresh or Back resumes; the basket is stored as `askedForServices` ("what the questions were asked for", never read for billing) (`lib/server/intake.ts:35-48`).
- A refused answer writes nothing and shows the message beside the question (`personalize/actions.ts:41`).
- After an answer: next applicable question for the CURRENT basket, else summary (`:43-44`).
- Toggling a service never empties the basket and stays on the summary where new questions appear (`:47-54`; `membership.ts:53-56`).
- Continue to checkout marks the intake complete and opens `/plan?services=...`; Skip does the same (`:58-69`).
- Basket from the form is re-read through `readBundleSelection`: only catalogue ids survive, website alone when none (`membership.ts:34-39`).
- Questions are grouped: common ones plus per-service ones, with "Asked because you chose X" (`personalize/page.tsx:94-96`).
- Prices on the page come from `bundleLines` and the plan (no page maths): list price per service and the ledger aside (`:53-54`).

### Old paths and query params that need a redirect
`/personalize` (with `services`, `q`) to `/start`; the post-sign-up redirect in `login/actions.ts:83` and `lib/intake/links.ts:4`.

---

## checkout (old `/plan`, `/billing/pay`, charge pay, confirm, receipts)

### Old routes
| File | Serves | Notes |
|---|---|---|
| `components/panel/membership/membership-page.tsx` via `(protected)/plan/page.tsx` | `/plan`: basket, code, billing details, Pay | params `services`, `payment=received\|failed` |
| `billing/pay/page.tsx` | `/billing/pay`: opens Razorpay on the business's open `incomplete` subscription | Razorpay only, else 404 (`:31`) |
| `billing/pay/callback/route.ts` | POST: Razorpay return, 303 | marks `membership=<tier>` or `return=billing` |
| `billing/confirm/page.tsx` | `/billing/confirm?token=`: FAKE provider checkout | 404 unless fake provider (`:51`) |
| `billing/charges/[chargeId]/pay/page.tsx` | `/billing/charges/<id>/pay`: Razorpay on a charge order | Razorpay only |
| `billing/charges/callback/route.ts` | POST: charge return, 303 | marks `for=ad\|upgrade\|press-release\|add-on\|change`, `ticket=<uuid>` |
| `billing/charges/confirm/page.tsx` | FAKE provider charge confirm | |
| `billing/receipts/route.ts` | GET `/billing/receipts[?ids=a,b]` PDF | |
| `(protected)/onboarding/review/page.tsx` | `/onboarding/review`: Check and send and pay for staff-invited clients; ALSO the Razorpay return `?payment=received\|failed` (`packages/shared/src/lib/billing/payment-step.ts:14`, `:221`) | see checklist |

### Server actions
| File | Exports | Guard / limits |
|---|---|---|
| `(protected)/plan/actions.ts` | `startMembership`, `startMembershipWithBilling`, `applyMembershipCode`, `removeMembershipCode`, `chooseFreeListing` | `requireCustomerAccess(listingAccount allow, membershipCheckout allow)` (`:19`); tier and brand checked (`:35-37`) |
| `(protected)/onboarding/review/actions.ts` | `startCheckout`, `submitOnboarding`, `applyReferralCode`, `removeReferralCode` | `requireCustomerAccess` / `requireBillingAccess` (see checklist) |
| `(protected)/billing/actions.ts` | `payChargeAction`, `reactivateAction`, `saveBillingDetailsAction`, `lookupBillingPincodeAction` | `requireCustomerAccess` variants (`:33`, `:44`, `:59`, `:103`) |
| `(protected)/requests/pay-actions.ts` | `acceptQuoteAction` | `requireBillingAccess` (see requests) |

### Lib modules
| Path | Decides / does | Test |
|---|---|---|
| `lib/server/checkout.ts` | `startCheckoutFor`, `startMembershipCheckoutFor`, `startReactivationFor`, `openPlanCheckout` (lock, decide reuse/replace/new, call provider, record, cancel orphan); limit 10 per hour per business | yes |
| `lib/server/payment-confirmation.ts` | Fake-provider confirm and verify: `verifyCheckoutFor`, `confirmFirstPayment` (activation, sends onboarding inside the payment transaction, unapplied reasons) | yes |
| `lib/server/billing.ts` | Provider selection (`BILLING_PROVIDER`, fake refused on real deployments), `requireBillingAccess`, `requireWebsiteAccess`, `BillingRequiredError`, `WebsiteRequiredError` | yes |
| `lib/server/billing-details.ts` | `billingDetailsMissing`: INR customers cannot check out without saved billing details; USD never | yes |
| `lib/server/referrals.ts` | `applyReferralCodeFor`, `removeReferralCodeFor`, `resolveAppliedDiscount`, `codeBasisFor`; limit 20 per hour per business; one message for every invalid reason | yes |
| `lib/server/charges.ts` | `startCustomerChargePayment` (one Razorpay order per charge, `onlyIfUnset`), `listOpenCustomerCharges`, `confirmFakeChargePayment`, `recordRazorpayChargePayment` (webhook), `customerBlogAllowance`, `openBlogUnlock` | yes |
| `lib/server/charge-redirect.ts` | Maps a started charge payment to a redirect or notice | no |
| `lib/server/discount-plans.ts` | Provider plan made on first use of a discount | yes |
| `lib/server/payment-failure.ts` | Records a failed Razorpay payment | yes |
| `lib/server/payment-emails.ts` | Wires `sendPaymentReceipt` and `sendPaymentFailed` (shared) to the customer transport | no |
| `lib/server/first-payment-event.ts`, `lib/purchase-event.ts` | First payment as a dataLayer `purchase` event, once per transaction id per browser | purchase-event yes |
| `lib/server/conversions.ts`, `lib/conversions/*` | Server-side GA4 and Meta first-payment reporting, claim per (payment, destination), consent gated, retry route | yes |
| `lib/billing/pay-callback.ts` | Where Razorpay's return lands: Billing (reactivation), plan page (membership), `/onboarding/review?payment=` (client) | yes |
| `lib/billing/confirm-href.ts` | Where each fake-confirm outcome sends the customer | yes |
| `lib/billing/checkout-url.ts` | `isSafeCheckoutUrl`: only `/path` (not `//`, not `/\`) or `https:` is followed | yes |
| `lib/billing/razorpay-checkout-options.ts` | Checkout options for a subscription vs an order | yes |
| `lib/billing/charge-notices.ts` | `?charge=` notices and per-kind return hrefs; `AD_RETURN_PARAM=for`, `CHANGE_TICKET_PARAM=ticket` | yes |
| `lib/billing/receipt-document.ts`, `receipt-download.ts`, `receipt-rows.ts` | Receipt contents, download href, status pills | yes, no, yes |
| `lib/server/receipt-pdf.ts` | Receipt PDF render (A4) | yes |
| `lib/checkout-included.ts`, `checkout-plans.ts`, `checkout-ledger.ts` | What is included, plan words, ledger sums | yes each |
| `lib/membership.ts` | Plan path `/plan`, services param, return hrefs `?payment=received\|failed`, callback tier mark | yes |
| `lib/server/membership.ts` | `getMembershipPlan`, `continueWithFreeListing` | no |
| `packages/shared/src/lib/billing/payment-step.ts` | `PAYMENT_STEP_HREF`, `billingBanner`, `afterPaymentHref`, `reactivationReturnHref` | (shared) |
| `packages/shared/src/lib/billing/billing-details-form.ts` | GSTIN, pincode, state, email and phone checks | (shared) |
| `packages/shared/src/lib/billing/receipt-download.ts` | `receiptDownloadHref`, `parseReceiptSelection` (1 to 50 uuids) | (shared) |
| `packages/shared/src/server/payment-emails.ts` | Receipt and failed-payment emails and their links | integration test |

### Components with logic
`components/panel/membership/membership-page.tsx` (hold gate, basket, price, pay form), `components/panel/billing/billing-details*.tsx` (GSTIN toggle, pincode lookup, state), `components/panel/referral-code-form.tsx`, `components/panel/razorpay-checkout-screen.tsx` and `lib/billing/razorpay-checkout-options.ts` (Checkout.js launch, dismiss href), `components/panel/test-checkout-form.tsx` (fake provider), `components/panel/payment-waiting.tsx` (poll until confirmed, delayed text), `components/panel/membership-gate-shell.tsx`.

### Package functions used
`@brandbasket/billing`: `decideCheckout`, `bundleKey`, `getBillingProvider` result (`startCheckout`, `confirmCheckout`, `startChargePayment`), `hasBillingAccess`, `chargedAmountCents`, `CheckoutVerificationError`, `isValidGstin`, `stateCodeOfGstin`, `RAZORPAY_PAY_PATH`, `FAKE_*_PATH`. `@brandbasket/db`: `lockBusinessForBilling`, `findBillingState`, `findActivePlan`, `findBusinessReferralCode`, `findRedeemableReferralCode`, `findBundledAddOnsForSubscription`, `setChargeProviderOrder`, `findChargeForBusiness`, `saveBillingProfile`, `findBillingProfile`, `findPincode`, `hasPincodeDirectory`, `listCustomerReceipts`/`listCustomerTaxInvoices` (receipts), `findFirstPayment`, `withCustomerRole`, `flagPaymentForAttention`. `@brandbasket/shared`: `server/billing-activation` (`activateFirstPayment`, `activateReactivationPayment`), `server/basket-change`, `server/provider-cancellation` (`cancelAtProvider`), `lib/billing/packages` (`adCreditCentsAtCheckout`, `packageBasisPointsFor`), `lib/billing/bundle`, `lib/billing/terms`, `server/tax-invoice-pdf`, `server/billing-log`. `@brandbasket/email`: `paymentReceivedEmail`, `paymentFailedEmail`.

### Behaviours a rebuild must keep
- Unpaid hold: an owner who chose Managed Website at sign-up is a business of kind `listing` with `signupChoice=managed`; the LAYOUT replaces the whole dashboard with `MembershipGateShell` and every page redirects such an account to `/plan` unless it passes `membershipCheckout: "allow"` (`(protected)/layout.tsx:24-30`; `customer-access.ts:79-84`). Plan 61 drops "free listing" flows but this state IS the unpaid hold; the new `/start` and `/checkout` guard "signed in, unpaid" must reproduce it, or an unpaid owner sees the full dashboard.
- Two different unpaid entry paths exist: sign-up (kind `listing`, pays on `/plan`, payment turns it into a client) and staff invite (kind client, pays on `/onboarding/review`). Both must reach `/checkout` (`checkout.ts:289-307`, `:256-277`).
- Checkout rate limit: 10 attempts per hour per business, key `checkout:business:<id>`, SHARED by first payment, membership and reactivation (`checkout.ts:47`, `:260`, `:299`, `:322`); add-on changes use a separate `add-on-checkout:business:` 10 per hour (`add-ons.ts:38`, `:179`, `:222`).
- INR customers must have saved billing details before any checkout (their first tax invoice is made from them and cannot change); USD never (`checkout.ts:263`, `:304`; `billing-details.ts:47-50`).
- A client checks the onboarding checklist before paying while answers are still open; already-sent answers are not re-checked (`checkout.ts:266-271`).
- Price is never taken from the form: basket (catalogue ids only), code and package offer re-validated under the per-business billing lock when the checkout opens (`checkout.ts:370-420`; `plan/actions.ts:39-42`, `:66-67`).
- Pressing Pay twice opens two provider subscriptions; the first to record wins, the loser cancels its own and looks again once (`lookAgain`) then asks to retry (`checkout.ts:354-369`, `:222-238`). Orphans are cancelled at the provider (`cancelAtProvider`).
- `decideCheckout` reuses a recent unpaid checkout, replaces a stale or lapsed one, or opens a new one; the basket key includes net cents and ad credit so a changed price is a NEW checkout (`checkout.ts:333-335`, `:413-418`).
- Referral code: 20 attempts per hour per business, one message for every invalid reason (anti-oracle), own affiliate code refused, refused after the first payment, a package refuses a code, code comes off the package net once, `months` frozen on the subscription (`referrals.ts:31`, `:154-205`, `checkout.ts` discount lines).
- Reactivation: lapse comes back as it was (same basket, code with months left, ad credit kept); a customer who cancelled chooses services again at list with nothing carried (`checkout.ts:313-326`, `:356-377`).
- Ad credit ("first payment ad money") is granted only at first purchase of services together, never on reactivation (`checkout.ts:408`).
- Redirect targets from the provider are checked: only a path or `https:` URL is followed (`lib/billing/checkout-url.ts:5-12`; `UnsafeCheckoutUrlError` `checkout.ts:54`).
- `/billing/pay` reads the business's OWN open subscription, never an id from the URL; goes back if the business has access, or the subscription is not `incomplete` and `razorpay` (`pay/page.tsx:33-43`).
- Razorpay callback pages are POST, UX only, never read the signature, write nothing; unreadable body or `error[...]` field counts as failed (`pay/callback/route.ts:21-39`; `charges/callback/route.ts:9-26`).
- Return destinations: reactivation `/billing?payment=received|failed`, membership `/plan?payment=received|failed`, client `/onboarding/review?payment=received|failed`; closing the Razorpay window (`dismissHref`) lands on the failed destination (`lib/billing/pay-callback.ts:25-29`; `pay/page.tsx:48-52`).
- Charge returns: ad spot `/advertise?notice=`, add-on `/services?charge=`, change quote `/requests?open=<ticket>&charge=`, otherwise `/billing?charge=` (`charge-notices.ts:50-56`). Old links carry no `ticket`.
- A Razorpay charge order is opened once; a second tab reuses it; the order id is recorded BEFORE redirecting so the webhook can always match (`charges.ts:58-96`).
- The webhook, not the return page, is the source of truth for payment; the page waits (`PaymentWaiting`) and says confirmed or delayed (`billing/page.tsx:103-109`, `:120-142`).
- Fake provider confirm: token verified (signature, expiry, own business) before showing; token never rendered, captured in a closure; refused token logged as `other-business-token`; page 404 unless the fake provider (`confirm/page.tsx:51-93`; `payment-confirmation.ts:102-132`). Fake provider is refused on real deployments unless `BRANDBASKET_ALLOW_FAKE_BILLING=1` (`billing.ts`, `packages/billing/src/select.ts:88`).
- First payment applicability: already paid = unapplied `already_paid`; subscription not `incomplete` = `checkout_replaced`; amount != expected = `amount_mismatch`; unapplied payments are recorded for staff and the customer is told the team will be in touch (`payment-confirmation.ts:183-199`).
- First payment sends the onboarding inside the payment transaction (`sendOnboardingWithin`); a refusal rolls back only a savepoint so the payment stays; unexpected failure flags `submission_failed` for staff (`payment-confirmation.ts:144-172`). The plan's "no send step" in `/checklist` must still move the project from `onboarding` to `submitted`.
- After payment fan-out: tenant sync, site hosting sync, `reportFirstPaymentToAds`, `sendPaymentReceipt`, Teams alert (`payment-confirmation.ts:367-376`).
- Receipt email is idempotent by outbox lookup on the receipt link (`packages/shared/src/server/payment-emails.ts:72-76`); only for payments recorded first time.
- GA4/GTM `purchase` event: pushed once per transaction in this browser using `bb-purchase-<id>` in storage; nothing pushed or remembered until Tag Manager started; value is major units without GST (`lib/purchase-event.ts:16-40`, `lib/server/first-payment-event.ts`). The welcome popup reads it with a swallowed error returning null (`first-payment-event.ts:20-23`).
- Server conversions: `skipped` reasons `no_attribution`, `no_consent`, `no_ids`; GA4 needs measurement consent and `gaClientId`; Meta needs advertising consent (`lib/conversions/report.ts:84-100`); one claim per (payment, destination) (`:77`).
- Billing details: GSTIN fixes the state (first two digits) and must agree; without GSTIN the state is chosen by hand and must agree with a listed pincode (an unlisted pincode passes); form carries kept legal name, email, phone that staff may have set (`billing-details-form.ts:97-124`, `:176-199`; `billing/actions.ts:62-80`).
- Pay form on the plan page saves billing details first when it carries address fields, then pays (`plan/actions.ts:58-64`).
- Pincode lookup action: needs a signed-in customer, length cap 12, returns found, not-found or no-directory (Brandbasket has no directory) (`billing/actions.ts:102-107`).
- `startMembership` for USD (no tax invoice) skips billing details (`plan/actions.ts:47-50`).
- Receipts: `GET /billing/receipts` with no `ids` = every downloadable payment; `ids` = 1 to 50 distinct uuids, comma separated; invalid = 400, not signed in = 401, any id not the customer's = 404 (RLS); sorted oldest first; a payment with a tax invoice downloads as the invoice, else a receipt (pre-invoicing and USD); runs of invoices and receipts are rendered separately then joined (`receipts/route.ts:21-34`, `:99-139`; `receipt-download.ts`). Editor's phone is not printed, only the owner's (`route.ts:126`). `Cache-Control` no-store, `nosniff`. Emailed links are `/billing/receipts?ids=<paymentId>` and MUST keep working (`payment-emails.ts:72`).
- File names: `brandbasket-invoice-<number with / replaced by ->.pdf`, `brandbasket-invoices.pdf`, `brandbasket-receipts.pdf`, `brandbasket-invoices-and-receipts.pdf` (`route.ts:81-90`).
- Open-redirect guard also applies to `returnTo`: only `billing` is meaningful, anything else is ignored (`pay-callback.ts:16-27`).
- `FAKE_ADD_ON_CONFIRM_PATH="/add-ons/confirm"` has no page behind it (dead constant; `/add-ons` redirect in `next.config.ts:64` matches only the exact path).

### Old paths and query params that need a redirect
`/plan` (`services`, `payment`), `/onboarding/review` (`payment=received|failed`: LIVE Razorpay return for in-flight checkouts and in emails), `/billing/pay`, POST `/billing/pay/callback`, `/billing/confirm`, `/billing/charges/<id>/pay`, POST `/billing/charges/callback`, `/billing/charges/confirm`, `/billing/receipts[?ids=]`.

---

## billing (old `/services`, `/billing`)

### Old routes
| File | Serves | Query params |
|---|---|---|
| `(protected)/billing/page.tsx` | `/billing`: payments by month, invoices, payment method, billing details, plan summary, reactivate | `payment=received\|failed`, `charge=<notice>`, `services=` (reactivation basket) |
| `(protected)/services/page.tsx` | `/services`: the services, add or remove (tab "Plan" of Plan & billing, `lib/plan/tabs.ts`) | `charge=<notice>` |
| `next.config.ts:64` | `/add-ons` permanent to `/services` | `?charge=` passes through |

### Server actions
`services/actions.ts`: `removeBundledAddOnAction`, `addBundledAddOnAction` (`requireCustomerAccess({ listingAccount: "allow" })` `:24`, `:44`; zod `addOn` enum). `billing/actions.ts`: `payChargeAction`, `reactivateAction`, `saveBillingDetailsAction`, `lookupBillingPincodeAction` (see checkout). `settings/actions.ts`: `deleteAccountAction` (see settings).

### Lib modules
| Path | Decides / does | Test |
|---|---|---|
| `lib/server/add-ons.ts` | `addBundledAddOnFor`, `removeBundledAddOnFor`; refusal wording; limit 10/h | yes |
| `lib/billing/drop-service.ts` | What the customer is shown before dropping a service | yes |
| `lib/billing/add-on-copy.ts` | Services page dates in India time | yes |
| `lib/billing/billing-months.ts` | Groups receipts and open charges into months | yes |
| `lib/billing/pagination.ts` | Months shown at a time | yes |
| `lib/billing/receipt-rows.ts` | Status pill colours | yes |
| `lib/billing/invoice-title.ts` | Invoice number as issued (`FY/26-27/000001`) | yes |
| `lib/billing/payment-method-view.ts` | Payment method section from newest payment and plan | yes |
| `lib/billing/billing-details-view.ts` | Billing details view and form start values | yes |
| `lib/billing/opening-payment.ts` | Pay button held state | yes |
| `lib/billing/payments-continue.ts` | `paymentsContinue(subscription)` | no |
| `lib/billing/public-prices.ts` | Prices the marketing site reads | yes |
| `lib/billing/reactivate-form.ts` | Reactivate form result type | no |
| `lib/plan/order.ts`, `lib/plan/tabs.ts` | Service order (owned first), Plan and billing tabs | order yes, tabs no |
| `lib/server/billing-banner.ts` | Banner model (unpaid price, under review, renewal failing, lapsed) | no |
| `lib/server/charges.ts` | Open charges list | yes |
| `lib/server/customer-access.ts` | `getCustomerBilling` (React cache), `summariseBilling` | yes |
| `lib/add-ons.ts`, `lib/currency-words.ts` | Add-on catalogue reexport, currency plural for sentences | no, yes |
| `packages/shared/src/lib/billing/*` | `status` (`summariseBilling`), `bundle`, `terms`, `period`, `payment-return`, `packages`, `bundle` | (shared) |
| `packages/shared/src/server/basket-change.ts` | `startAddOn`, `removeBundledAddOn` under the billing lock | (shared) |

### Components with logic
`components/panel/billing/plan-summary.tsx` (what is paid, next payment, discount months), `payments-list.tsx` (months, invoice and receipt links), `payment-method.tsx`, `service-picker.tsx` and `reactivate-plan.tsx` (cancelled customers choose services), `summary-card.tsx`, `components/panel/add-ons/add-on-row.tsx`, `components/panel/notice-banner.tsx`, `components/panel/billing-banner.tsx`, `components/panel/payment-waiting.tsx`, `components/panel/delete-account-flow.tsx` (the only cancel today).

### Package functions used
`@brandbasket/db`: `listCustomerReceipts`, `findCustomerPaymentMethod` (via `lib/server`), `findReactivation`, `findReactivationPlan`, `listOpenCustomerCharges`, `findBillingProfile`. `@brandbasket/shared`: `lib/billing/status`, `bundle`, `terms`, `payment-step`, `payment-return`, `receipt-title`, `server/basket-change`. `@brandbasket/billing`: `hasBillingAccess`, `nextPaymentDate`.

### Behaviours a rebuild must keep
- Billing page states, in order: listing account (charges + receipts only), unpaid with `paymentUnderReview` ("There's nothing more for you to pay"), unpaid (how paying works, points to `/onboarding/review` or the next incomplete step), then paid or lapsed (`billing/page.tsx:17-92`, `:94`).
- Paid page: charge notice from `?charge=`; `processing` shows a "confirming with the bank" wait while any charge is still open, then flips to `paid`; renewal failing card while `renewalFailingUntil` is set (`:105-130`).
- `?payment=received` is NOT a confirmation: `paymentReturnView` waits for the webhook and shows confirming, then confirmed or failed (`:103-109`, `:136-142`; `payment-return.ts:26`).
- Lapsed: reactivation plan shown with the lapsed basket's monthly amount; a customer who cancelled themselves gets a service picker; `?services=` is read raw and the db keeps only catalogue ids (`:96-100`, `:120-125`).
- No plan found (`plan === null`) renders "We couldn't find your plan's details" instead of crashing (`:153-158`).
- Remove a service: stops at the NEXT payment date, not now; refused for: not in plan, only service ("delete your account from Settings"), account set to close, plan kept/ending; the page refreshes whether it worked or not (`add-ons.ts:200-262`, `services/actions.ts:34-35`). This is today's only cancel; the plan's "cancel a service with reason" is new on top.
- Add a service: opens a charge for the REST of the paid month and goes straight to pay; keeping an ending service costs nothing; refusal "plan starts again on <date>" while the plan is ending (`add-ons.ts:177-198`).
- Form carries only the add-on id; price, row and date come from the server under the billing lock (`services/actions.ts:20-22`).
- Pay a charge is a POST so a prefetch never opens a payment; charge id must be a uuid else `notFound`, and is checked against the customer's own charges (`billing/actions.ts:30-35`).
- Dates on the Services page are in India time (`lib/billing/add-on-copy.ts`).
- Banner: not shown on `/` (Home places it itself) (`(protected)/layout.tsx:17-18`); unpaid banner shows price with the applied discount; paying or lapsed customers never pay for the referral lookup (`billing-banner.ts:25-33`).
- Receipts and invoices sort and group per month with open extras; USD customers have no GST wording (plan section 4).
- Billing details section is shown on every billing state, including under review.

### Old paths and query params that need a redirect
`/services` and `/add-ons` (with `?charge=`) to `/billing`; `/billing?payment=`, `/billing?charge=`, `/billing?services=`; the Services tab and Billing tab links in `lib/plan/tabs.ts`.

---

## home

### Old routes
| File | URL | Reads |
|---|---|---|
| PROT/page.tsx | `/` | `searchParams.welcome` (only the exact value `1`) (page.tsx:56) |
| PROT/todo/page.tsx | `/todo` | redirect to `/` (todo/page.tsx:8) |
| PROT/monitoring/page.tsx | `/monitoring` | redirect to `/` (retired 2026-09-22) (monitoring/page.tsx:14-16) |
| PROT/project/page.tsx | `/project` | `response` (preview notice); redirects to `/website` or `websiteNoticeHref(notice)` (project/page.tsx:11-12) |
| PROT/project/actions.ts | action | see below |
| PROT/layout.tsx | wraps all | lists the banner on every page except `/` (layout.tsx:18,36-40) |

### Server actions
| File | Action | Guard / limits |
|---|---|---|
| PROT/project/actions.ts | `checkDomainAction` | `requireCustomerAccess`; reads domain from DB, never the form; refuses no-domain, free subdomain, `pending` status; records on staff DB; emails team once on first connected (project/actions.ts:18-36). No rate limit, no idempotency key. |
| PROT/setup-call-actions.ts | `bookCallSlot`, `loadCallSlots`, `recordSetupCallBooked` | see kickoff section |

### Lib modules
| path | what it decides or does | .test.ts? |
|---|---|---|
| lib/home/state.ts | `deriveClientHomeState` (15 states) and `homeLayoutOf` (5 layouts); `LAUNCH_GREETING_DAYS=7`; `kickoffIsOver` | yes |
| lib/home/countdown.ts | `countdownBlocks`, `countdownLabel`: days+hours, hours+minutes, minutes; never seconds | yes |
| lib/home/due.ts | `stillAhead`, `dayStillAhead`: promised date shown only while in the future (IST day) | yes |
| lib/home/milestones.ts | `websiteMilestones`: 5 bars (Kickoff, Building, Your review, Changes, Live) with dated notes | yes |
| lib/server/home.ts | `loadHome`: reads facts, derives state, skips reads by layout, builds `attention` | NO |
| lib/overview.ts | `monthKey`, `monthStart`, `monthName`, `greetingFor`, `resultLines`, `activityRows` | yes |
| lib/server/overview.ts | `loadOverview` (month figures, activity, next payment, included edits, next call) | yes |
| lib/todo.ts | `buildTodo`, `openCount` (ready items to to-do rows) | yes |
| lib/server/todo.ts | `loadTodo` (cached per tenant) | yes |
| lib/ready-items.ts | `READY_ITEMS` (7 asks: brand, services, domain, accounts, offers, budget, areas), `readyRows` open-first stable sort | yes |
| lib/first-look.ts | `ServiceKey`, `SERVICE_NAMES`, `servicesBought`, `firstLookInput`, `inFirstLook`, `HELD_GRACE_MS=2 days`, `andList` | yes |
| lib/first-look-steps.ts | `firstLookSteps`: "What happens next" rows with 48h and 7 working day promises | yes |
| lib/server/first-look.ts | `loadServicesBought`, `loadSetupServices` | yes |
| lib/server/active-services.ts | `loadActiveServices` (cached) | NO |
| lib/celebration.ts | `WELCOME_PARAM`, `MEMBER_WELCOME_HREF`, `wantsWelcome`, `withoutWelcome`, confetti physics (90 pieces per cannon, 180 frames, 60 fade) | yes |
| lib/project-stages.ts | `PROJECT_STAGES` (4), `projectStageIndex` (on_hold keeps stage 2 if preview sent else 1; cancelled 0 or 1) | yes |
| lib/purchase-event.ts | `purchaseEventFrom`, `pushPurchase` (GA4 dataLayer purchase, once per transaction per browser) | yes |
| lib/server/first-payment-event.ts | `loadFirstPaymentEvent` (first payment + tax invoice GST) | NO |
| lib/server/missed-kickoff.ts | `loadMissedKickoffAt` (staff DB) | yes |
| lib/server/intake.ts | `loadIntake` (pre-payment answers shown as "What we will cover") | NO |
| lib/server/onboarding.ts | `getProjectOverview`, `getLiveWebsite`, `getLatestProjectStatus` (cached per request) | yes |
| lib/server/billing-banner.ts | `getBillingBanner` (shown on Home header; layout hides its own copy on `/`) | not read |
| packages/shared/src/lib/next-step.ts | `nextStep` for the old unpaid Home: live wins, then project status | yes |
| packages/shared/src/lib/names.ts | `firstName` | yes |
| lib/requests/needs.ts | `needsYouFrom`, `waitingOnYouFrom` feed `attention` | yes |

### Components with logic
| path | logic |
|---|---|
| components/first-look/payment-welcome.tsx | native `<dialog>`; open only when `?welcome=1`; closing does `router.replace` with the param removed; focuses title; fires confetti; pushes GA4 purchase once (payment-welcome.tsx:38-77) |
| components/first-look/fire-poppers.ts | canvas animation; test exists |
| components/first-look/kickoff-picker.tsx | wraps SlotPicker; says "your website can be live by <date>" only when plan has website (kickoff-picker.tsx:25-29); `router.refresh()` after booking |
| components/first-look/booked-line.tsx | Add to calendar + Change (older variant of KickoffActions) |
| components/home/kickoff-actions.tsx | Add to calendar (.ics) only if both times; Reschedule toggles picker; `BookNewTime` for `kickoff_unconfirmed` |
| components/home/countdown.tsx | 30 s tick from a server-clock offset; `role=timer aria-live=off`; "Starting now" under a minute |
| components/home/kickoff-home.tsx | `canBook` false for phone accounts shows "Add an email address in Settings"; missed-call line; "What we will cover" from intake rows |
| components/home/progress-home.tsx | copy per state; `kickoff_unconfirmed` offers Book a new time; `launched` shows Visit + Request an update (`/requests/new?kind=website`); milestones hidden when launched |
| components/home/ongoing-home.tsx | "<Month> so far" with results; Next payment card; New request link |
| components/home/attention.tsx | shows only the first ask plus "n more are waiting after it" |
| components/home/status-hero.tsx | has test |
| components/overview/result-line.tsx | pure markup |
| components/todo/setup-item-form.tsx | per-item form; echoes values on error; used on Social and Search pages |

### Package functions used
- `@brandbasket/db`: `isPhoneAccountEmail`, `findLiveBundledAddOns`, `listBoughtSetupServices`, `listServiceSetups`, `findSetupCallBooking`, `findLatestKickoffOutcome`, `findOpenProject`, `findLatestProject`, `getPrimaryDomain`, `listStepProgress`, `countChatbotLeadsSince`, `countIncludedEdits`, `countSiteEvents`, `listActivityEvents`, `listMonthlySnapshots`, `findFirstPayment`, `findTaxInvoiceByPaymentId`, `findClientIntake`, `getConnectingDomain`, `recordDomainDnsCheck`, type `ProjectStatus`.
- `@brandbasket/shared/lib/*`: `billing/period` (`nextPaymentDate`), `billing/bundle` (`nextBundledNetCents`, `nextDiscountCents`), `billing/terms` (`renewalCharge`), `change-requests` (`includedEditsAllowed`, `monthBoundsIst`), `money` (`formatMoney`), `call-slots` (`dayKey`, `callInviteHref`), `intake/questions` (`summaryRows`), `project-customer-line` (`CUSTOMER_STAGE_HEADLINE`), `onboarding/steps`, `names`, `next-step`.
- `@brandbasket/billing`: `deriveSiteStatus` (bell only, lib/server/account-panel.ts:2).

### Behaviours a rebuild must keep
1. State order: unpaid gives `payment_processing` if `paymentUnderReview` else `payment_required`; lapsed gives `lapsed`; then kickoff-not-over gives unbooked or booked; then no website service gives `ongoing`; then live site gives `launched` (inside 7 days of `launchedAt`) or `ongoing`; then `kickoff_unconfirmed`; then project status map (lib/home/state.ts:64-105).
2. A booking with no start or end time is still "booked", not "unbooked" (lib/home/state.ts:70-72).
3. Kickoff is "over" only if staff marked it held OR `endsAt <= now`; a booking with no `endsAt` never ends until staff mark it (lib/home/state.ts:59-62).
4. `kickoff_unconfirmed` needs `heldAt === null`, a call time AND project still `onboarding`; Cal.com cannot tell who joined, so nothing is claimed until staff say (lib/home/state.ts:83-86).
5. "We missed each other on <time>" only when there is no booking, the plan has the website, and billing is paid; outcome read on the staff connection; only `customer_no_show` or `team_no_show` count; time is `callStartsAt ?? callEndsAt` (lib/server/home.ts:44; lib/server/missed-kickoff.ts:13-18; lib/home/state.ts:72).
6. Billing layouts skip every other read and render the old UnpaidHome (which owns pay and reactivate); stage index is `live` when a live site exists because going live closes the project (lib/server/home.ts:63; PROT/page.tsx:44-53).
7. Promised dates (first preview due) are shown only while still ahead; a past date falls back to a line naming no date (lib/home/due.ts:4-12; lib/server/home.ts:58,62).
8. Welcome dialog shows only in the kickoff layout; `?welcome=1` must be exactly `1`; closing replaces the URL so refresh does not replay it (PROT/page.tsx:56,61; lib/celebration.ts:16-26; components/first-look/payment-welcome.tsx:75-77). Landing hrefs come from `MEMBER_WELCOME_HREF` (lib/billing/confirm-href.ts:21, components/panel/membership/membership-page.tsx:51). NOTE: plan section 4 says Home never has confetti; owner decision needed on keeping the welcome.
9. GA4 purchase: read first payment only on the welcome visit; value excludes GST; id is provider payment id; pushed once per transaction via localStorage key `bb-purchase-<id>`; nothing pushed or remembered when `window.dataLayer` is undefined (consent not given) (PROT/page.tsx:55-56; lib/purchase-event.ts:12-47). Event shape: `{event:"purchase", ecommerce:{transaction_id,value,currency,items:[first-payment]}}` after an `{ecommerce:null}` reset.
10. Needs-you order: request asks (accept quote, pay, check change) then "Reply to" conversations not already listed, then (ongoing) Social/Search blocking setup items; the posts-to-approve row comes first in Overview's list (lib/server/home.ts:65-75; lib/server/overview.ts:94-108,108).
11. Blocking setup asks are only `accounts`, `budget`, `areas`; `offers` is not asked; website checklist items are not asked on Home (lib/service-setup.ts:18; lib/server/home.ts:71).
12. Attention card shows one ask plus a count; calm line "Nothing needed from you right now" when empty (components/home/attention.tsx:22-47).
13. Result lines only for bought services and only when measured; no zeros; website line uses site events if any, else chatbot lead count; previous month total includes chatbot leads so months compare (lib/overview.ts:52-111; lib/server/overview.ts:56-68).
14. Activity: 8 staff events fetched, merged with `previewSentAt` and `launchedAt` rows, sorted newest first with key tiebreak, cut to 6 (lib/server/overview.ts:79,111-117; lib/overview.ts:121-135).
15. Next payment shown only when `hasAccess` and `paymentsContinue(subscription)`; amount is `renewalCharge` with next discount and bundled net; null amount shows "To be confirmed" (lib/server/overview.ts:100-103; components/home/ongoing-home.tsx:45).
16. Included edits: 2 a month and only with the website; counted with IST month bounds; hidden when allowed is 0 or the read failed (lib/server/overview.ts:73,83-85,109; packages/shared/src/lib/change-requests.ts:13,80).
17. All month and day logic is IST (`Asia/Kolkata`): `monthKey` = first of month, greeting is morning before 12, afternoon before 17, else evening (lib/overview.ts:7-27; PROT/page.tsx:26).
18. Home subtitle "<weekday, d month>. Your A and B services are active." comes from `andList(SERVICE_NAMES)` (PROT/page.tsx:57-58).
19. Countdown: floor to whole units, never negative, never seconds; ticks every 30 s using offset to the server clock so SSR and browser agree (lib/home/countdown.ts:15-29; components/home/countdown.tsx:13-17).
20. First look window: ends when website live, onboarding sent, call held, or 2 days after call end (no end time keeps it open); never for unpaid or lapsed. Drives rail quiet mode and calls availability (lib/first-look.ts:31,68-72).
21. A plan without the website skips build states: after kickoff it is `ongoing` straight away (lib/home/state.ts:77).
22. `canBook` false for phone-only account emails: Home shows the booking-page link instead of the picker (PROT/page.tsx:65; components/home/kickoff-home.tsx:64-81).
23. `/todo` and `/monitoring` redirect `/`; a test fails the build if any file links `/todo` (lib/legacy-links.test.ts:19-30).
24. Milestone bar index: 0 kickoff unconfirmed, 1 building, 2 preview_ready, 3 revisions, 4 approved, 5 launched; on_hold shows "Paused" on Building (lib/home/milestones.ts:14-21).
25. `checkDomainAction` records the DNS result on the staff connection (customer role cannot change domain status) and emails the team only the first time `becameConnected` (PROT/project/actions.ts:28-31).

### Old paths and query params that need a redirect
- `/todo`, `/monitoring` to `/`.
- `/project?response=<notice>` to `/website` (keep notice mapping via `websiteNoticeHref`). In-app links to `/project`: components/panel/next-step-card.tsx:114,164,176; components/panel/onboarding-summary.tsx:249.
- `/?welcome=1` must keep working (billing confirm and membership redirects).
- `/onboarding` links used from Home: components/website/stage-header.tsx:23, packages/shared/src/lib/account-panel.ts:111.

---

## checklist

### Old routes
| File | URL | Notes |
|---|---|---|
| PROT/onboarding/layout.tsx | `/onboarding/*` frame | `requireWebsiteClient`; empty state "There's nothing to set up right now" when no project; `LockedNotice` when locked; lede "Five steps. Each one is saved when you continue..." (layout.tsx:15-38) |
| PROT/onboarding/page.tsx | `/onboarding` | redirects to first incomplete answer step, or `review` when locked (page.tsx:10) |
| PROT/onboarding/business/page.tsx | `/onboarding/business` | locked shows summary; saved phone shown in its own country layout, default country from visitor headers (page.tsx:34-37) |
| PROT/onboarding/content/page.tsx | `/onboarding/content` | currency from `billing.plan` |
| PROT/onboarding/brand/page.tsx | `/onboarding/brand` | only id, size, alt text, filename go to the browser (page.tsx:15-24) |
| PROT/onboarding/domain/page.tsx | `/onboarding/domain` | free address form hidden if base domain unset or already on a temp subdomain (page.tsx:60) |
| PROT/onboarding/review/page.tsx | `/onboarding/review` | query `payment` = `received` or `failed` (page.tsx:242,284-309) |
| app/api/uploads/route.ts | `POST /api/uploads?purpose=logo|photo` | outside proxy so the 1 MB action body limit does not apply (uploads/route.ts:10-16) |

### Server actions
| File | Actions | Guards |
|---|---|---|
| onboarding/business/actions.ts | `saveBusinessStep` | `requireCustomerAccess`; parse then one tx |
| onboarding/content/actions.ts | `saveContentStep` | same; maps `ServiceNotFoundError` and `DuplicateServiceIdError` to "reload" message (content/actions.ts:17-25) |
| onboarding/brand/actions.ts | `saveBrandStep`, `removeBrandImage` | photos read inside the tx so descriptions are checked against stored photos (brand/actions.ts:32-42); remove calls `refresh()` |
| onboarding/domain/actions.ts | `saveDomainStep`, `useTemporarySubdomainAction` | reserved host list; `DomainTakenError` mapped without naming the other business |
| onboarding/review/actions.ts | `startCheckout`, `submitOnboarding`, `applyReferralCode`, `removeReferralCode` | see behaviours; none read the posted form for money |
| PROT/setup-actions.ts | `saveSetupItemAction` | `requireCustomerAccess`; needs `billing.hasAccess`; item's service must be in `loadSetupServices`; never logs answers; revalidates `/social`, `/search`, `/` (setup-actions.ts:15-46) |
| app/app-host/(protected)/project/actions.ts | `checkDomainAction` | see home |

Every step save ends with `revalidatePath("/onboarding","layout")` then `redirect(hrefAfter(step))` (business/actions.ts:31-32 and siblings).
Idempotency keys: none on steps (saves are overwrites). Rate limits: media upload 60/hour/business, checkout 10/hour/business, referral 20/hour/business.

### Lib modules
| path | what it decides or does | .test.ts? |
|---|---|---|
| packages/shared/src/lib/onboarding/steps.ts | 5 steps order, `ANSWER_STEPS`, `hrefAfter`, `firstIncompleteStep` | yes |
| packages/shared/src/lib/onboarding/checklist.ts | 6-item send checklist, `firstMissing` | yes |
| packages/shared/src/lib/onboarding/hours.ts | `toStoredHours`, `fromStoredHours` | yes |
| packages/shared/src/lib/onboarding/domain-form.ts | `parseDomainForm`, `readSubdomainName`, `temporarySubdomainFor`, `reservedHostnamesFrom`, `clientSiteBaseDomain`, `isTemporarySubdomain`, `suggestSubdomainName` | yes |
| packages/shared/src/lib/billing/payment-step.ts | `paymentStep` (pay-and-send, pay, send, reactivate, under-review, no-plan, none), `PAYMENT_STEP_HREF`, banner model, `afterPaymentHref` | yes |
| packages/shared/src/lib/billing/payment-return.ts | `paymentReturnView` (none, confirming, confirmed, failed) | yes |
| packages/shared/src/lib/uploads/limits.ts | 4 MB, 2400 px, jpeg/png/webp, `MAX_PHOTOS=20` | NO |
| lib/onboarding/snapshot.ts | `isOnboardingLocked`, `completedStepKeys`, `openingHoursFromRows`, `checklistInputFrom` | yes |
| lib/onboarding/form-state.ts | `StepFormState`, `refusedStepState` (echoes typed values), locked message | yes |
| lib/onboarding/business-form.ts | step 1 zod parse | yes |
| lib/onboarding/content-form.ts | step 2 zod parse | yes |
| lib/onboarding/brand-form.ts | step 3 parse; alt text max 250 | yes |
| lib/onboarding/review-copy.ts | `sentHeading` | yes |
| lib/onboarding/step-notes.ts | "What this is for" copy (locked copy: owner approves changes) | yes |
| lib/server/onboarding.ts | `readOnboardingSnapshot`, `saveOnboardingStep`, `sendOnboardingWithin`, `submitOnboardingFor`, `missingProblem` | yes |
| lib/server/onboarding-media.ts | upload allowance, `storeOnboardingImage`, `storeBrandImage`, remove | yes |
| lib/server/onboarding-alert.ts | `notifyTeamOnboardingSent` (email + Teams `setup_sent`) | yes |
| lib/server/upload-request.ts | `handleUploadRequest` (origin check, body limit order) | yes |
| lib/server/checkout.ts | `startCheckoutFor`, `openPlanCheckout`, `CHECKOUT_RATE_LIMIT` | yes |
| lib/server/referrals.ts | `applyReferralCodeFor`, `removeReferralCodeFor`, `resolveAppliedDiscount`, `findLapsedAppliedCode`, `codeBasisFor`, `REFERRAL_RATE_LIMIT` | yes |
| lib/server/billing-details.ts | `billingDetailsMissing`, `loadBillingDetailsView` (GST details before pay) | yes |
| lib/server/payment-confirmation.ts | submits onboarding inside the first payment tx | not read in full |
| lib/service-setup.ts | Social/Search ask fields, `parseSetupItem`, `doneSetupKeys`, `BLOCKING_SETUP_KEYS` | yes |
| lib/setup-asks.ts | `setupAsks`, `setupPageHref` (`/social#setup`, `/search#setup`) | yes |
| lib/server/setup-call.ts | not checklist (kickoff) | yes |

### Components with logic
| path | logic |
|---|---|
| components/panel/media-uploader.tsx (BrandStepForm) | client upload to `/api/uploads`, shrinks to 2400 px, converts to accepted types (per limits.ts comment); not read in full |
| components/panel/review-submit-form.tsx | pay or send button with pending label; not read in full |
| components/panel/referral-code-form.tsx | apply/remove via actions |
| components/panel/payment-waiting.tsx | `waitKey "review:first-payment"`, delayed text after a wait (review/page.tsx:291-296) |
| components/panel/step-form.tsx | `useStepForm`; tested in lib/onboarding-wizard.test.ts |
| components/panel/onboarding-steps.tsx, onboarding-step-list.tsx | progress ticks from `completed` |
| components/todo/setup-item-form.tsx | Social/Search ask forms |

### Package functions used
- `@brandbasket/db`: `findOpenProject`, `listStepProgress`, `markStepComplete`, `submitProject`, `OnboardingLockedError`, `ProjectNotInOnboardingError`, `saveBusinessProfile`, `replaceBusinessHours`, `getBusinessProfile`, `getBusinessHours`, `replaceServices`, `listServices`, `saveProjectBrief`, `getProjectBrief`, `ServiceNotFoundError`, `DuplicateServiceIdError`, `savePrimaryDomain`, `getPrimaryDomain`, `DomainTakenError`, `listMediaAssets`, `updateMediaAltText`, `recordUploadedMedia`, `recordBrandAsset`, `softDeleteMediaAsset`, `removeBrandAsset`, `PhotoLimitReachedError`, `newMediaAssetId`, `consumeRateLimit`, `saveServiceSetup`, `FIRST_PREVIEW_DUE_HOURS`, `slugify`, `findBillingState`, `findActivePlan`, `findBusinessReferralCode`, `findRedeemableReferralCode`, `setBusinessReferralCode`, `lockBusinessForBilling`, `openCheckoutSubscription`, `isPackageOfferForfeited`.
- `@brandbasket/billing`: `decideCheckout`, `bundleKey`, `BillingProvider`, `isRealDeployment`.
- `@brandbasket/email`: `onboardingSentEmail`, `createAppEmailTransport`, `emailTeamInboxDefault`.
- `@brandbasket/shared/server`: `media-storage`, `media-upload` (`processUpload`, `hasDecodeCapacity`), `billing-activation`, `reactivation-basket`, `provider-cancellation`, `phone-countries`, `phone-defaults`.

### Behaviours a rebuild must keep
1. Five steps in order business, content, brand, domain, review; "review" is never stored as complete; once sent every step reads as done (packages/shared/src/lib/onboarding/steps.ts:10-19; lib/onboarding/snapshot.ts:30-42).
2. Locked = no open project or status not `onboarding`; locked pages show read-only summaries, and every save returns "You've sent this to us, so these answers are locked. To change anything now, see Your project." (stale: `/project` is now `/website`) (lib/onboarding/snapshot.ts:30; lib/onboarding/form-state.ts:20-21).
3. A step save runs in one tenant tx: the work, then `markStepComplete`; any returned problem throws and rolls back the whole save (lib/server/onboarding.ts:171-194).
4. Send checklist (server-side on stored data): business name, phone or email, at least one service, logo or one photo, a description for every photo (line omitted if no photos), domain confirmed as owner's (packages/shared/src/lib/onboarding/checklist.ts:27-68; lib/onboarding/snapshot.ts:63-77).
5. Business limits: name 1 to 120, tagline 120, description 600, address lines 120, city and region and country 80, postal code 20, service areas 300; times `HH:MM`; 24-hour opening needs the "Open 24 hours" mode (lib/onboarding/business-form.ts:17,41,135-150). A day left "Not set" saves no row; read-back keeps the first row of a day (PROT/onboarding/business/actions.ts:24; lib/onboarding/snapshot.ts:48-56).
6. Content limits: 20 services, name 1 to 80, summary 240, price note 60, notes 2000, style likes 600, 5 reference URLs (lib/onboarding/content-form.ts:6-7,50-64). Stale service ids give "Your list of services has changed since this page loaded. Reload the page and try again." (onboarding/content/actions.ts:17-25).
7. Photos: max 20 stored, alt text required for each and max 250 characters; a new logo replaces the old one and the old file is deleted after commit (packages/shared/src/lib/uploads/limits.ts:MAX_PHOTOS; lib/onboarding/brand-form.ts:6; lib/server/onboarding-media.ts:111,176).
8. Upload rules: 4 MB, jpeg/png/webp, longest side 2400 px; 60 uploads per business per hour (`media-upload:business:<id>`); locked check runs before the body is read or allowance spent; busy decode returns Retry-After; file written first then row, file deleted if insert fails (limits.ts:7-14; lib/server/onboarding-media.ts:26,88-105,122-178).
9. Domain: customer-chosen free address `<name>.<CLIENT_SITE_BASE_DOMAIN>`; reserved hosts are site url, app url, `APP_ORIGIN`, `ADMIN_ORIGIN` and the base domain; option absent when base domain is unset; saving stamps `ownerConfirmedAt`; taken domain never names the holder (onboarding/domain/actions.ts:21-31,39-45,71-98).
10. Pay and send: `startCheckout` reads nothing from the form; 10 checkouts per hour per business (`checkout:business:<id>`); refused if billing (GST) details missing; refuses when no project; re-runs the checklist only while answers are unlocked; pays the website alone at list (lib/server/checkout.ts:42,256-273; onboarding/review/actions.ts:22-27).
11. First payment sends onboarding itself inside the payment transaction (savepoint; outcomes `sent`, `missing`, `not-open`, `failed`); on any but `sent` the paid customer uses "Send it to us" without paying again (lib/server/payment-confirmation.ts:38-45,140-154). The new `/checklist` "no send step" (plan section 3) therefore needs a backend decision on what moves the project from `onboarding` to `submitted` (today also `startBuildsAfterKickoff`, see calls).
12. `submitOnboarding`: needs billing access (else "Make your payment to send this to us..."); paid without website redirects `/`; `submitProject` moves status and starts the 48 hour clock first, then the checklist is re-read in the same tx so a late save cannot slip in, rolled back if missing (onboarding/review/actions.ts:34-47; lib/server/onboarding.ts:214-222).
13. After commit only: team email (to `BRANDBASKET_TEAM_EMAIL` or default inbox, link to console client page) and Teams `setup_sent` with "First preview due in 48 hours"; failures logged, never undo the send (lib/server/onboarding-alert.ts:16-27).
14. Referral code is its own action so the price re-renders from the same server computation; 20 applies per hour per business (`referral:business:<id>`); refused after the first ever payment, for the customer's own affiliate code, and for unknown codes; priced against the website-alone basket; re-validated on every render and again under the lock at checkout, where the amount is frozen on the subscription (lib/server/referrals.ts:31,154-193; PROT/onboarding/review/page.tsx:245-250; lib/server/checkout.ts:229-258).
15. Payment return `?payment=received|failed`: `confirming` waits for the webhook (plan has no access yet) and hides the pay button so a second press cannot charge twice; `failed` only shows while there is no access; `received` with `paymentUnderReview` shows the staff-review message (packages/shared/src/lib/billing/payment-return.ts:21-33; review/page.tsx:284-337).
16. Payment panel variants and copy keyed on billing status and lock (pay-and-send, pay, send, reactivate, under-review, no-plan) (packages/shared/src/lib/billing/payment-step.ts:74-104).
17. `requireWebsiteClient`: paid customers without the website go Home; unpaid and lapsed pass because the first payment is taken here (lib/server/customer-access.ts:122-126).
18. Social/Search asks: blocking set is accounts, budget, areas; instagram/facebook links must be on those hosts with a path, no port or login, https added; at least one required; budget digits 1 to 7, 1..1,000,000, stored under legacy key `adBudgetRupees` in either currency; ad area 2 to 120; areas 2 to 300; competitors 300; Google profile link https on google.com, g.page, goo.gl, share.google; admin answer one of added, not_yet, need_help; never ask for passwords (lib/service-setup.ts:18,71-175).
19. Done detection: accounts if either link saved; budget needs a number > 0 and an area; areas needs text; offers needs text (lib/service-setup.ts:182-190).
20. Setup save failures show "We could not save that. Please try again."; unknown key throws; save refused when plan lacks the service ("That item is not part of your plan.") (PROT/setup-actions.ts:19-41).
21. The domain tab links to `/onboarding/domain` for connecting (PROT/domain/page.tsx:127,144) so Domain rebuild must keep a target.

### Old paths and query params that need a redirect
- `/onboarding` to `/checklist`; `/onboarding/business`, `/content`, `/brand`, `/domain` to `/checklist` (with the item open if the new page supports it).
- `/onboarding/review` plus `?payment=received|failed` is the Razorpay return URL (packages/shared/src/lib/billing/payment-step.ts:14,221; lib/billing/pay-callback.ts:9; lib/billing/confirm-href.ts:6): must redirect to the new checkout/return handler with the same param meaning.
- In-app and shared links: `PAYMENT_STEP_HREF` (billing banner lib/server/billing-banner.ts:30, account bell packages/shared/src/lib/account-panel.ts:72, billing page PROT/billing/page.tsx:201, pay and confirm pages app/app-host/billing/pay/page.tsx:38, confirm/page.tsx:57), bell `finish-setup` to `/onboarding` (account-panel.ts:111), website stage header (components/website/stage-header.tsx:23), `onboardingStepHref` used by checklist rows and `todo`.
- `/social#setup`, `/search#setup` (lib/setup-asks.ts:35-36) used by Home.

---

## kickoff and calls

### Old routes
| File | URL | Reads |
|---|---|---|
| PROT/requests/calls/page.tsx | `/requests/calls` | no query; redirects to `/requests` when `callsAreOpen` is false (calls/page.tsx:18) |
| components/home/* (Home) | kickoff picker lives on `/` | n/a |
| app/api/webhooks/calcom/route.ts | `POST /api/webhooks/calcom` | header `x-cal-signature-256` |
| app/api/internal/start-builds-after-kickoff/route.ts | `POST` | `Authorization: Bearer KICKOFF_SYNC_TOKEN` |

### Server actions
| File | Action | Guard / limits |
|---|---|---|
| PROT/setup-call-actions.ts | `loadCallSlots` | `requireCustomerAccess` only; no rate limit (setup-call-actions.ts:19-22) |
| | `bookCallSlot(startIso, timeZone)` (kickoff) | `requireCustomerAccess`; phone-account emails refused; no rate limit; revalidates `/` (setup-call-actions.ts:25-31) |
| | `recordSetupCallBooked(inviteeUri)` | NO caller found in repo (grep); dead Calendly-era action |
| PROT/requests/calls/actions.ts | `bookCallAction(input)` | `requireCustomerAccess`; phone email or `!callsAreOpen` gives `failed`; zod `{startIso,timeZone,reason,note?,replaceId uuid?}`; reason must be in `kindOptions(services)`; max 3 upcoming (calls/actions.ts:41-58) |
| | `cancelCallAction(callId)` | uuid check; `callsAreOpen`; revalidates `/requests/calls`, `/requests`, `/` (calls/actions.ts:31-35,61-69) |

Idempotency: none on booking (the provider rejects a taken slot). Rate limit: none beyond `MAX_UPCOMING_CALLS=3`.

### Lib modules
| path | what it decides or does | .test.ts? |
|---|---|---|
| lib/server/setup-call.ts | kickoff state (`getSetupCallState` cached), `bookSetupCall`, `markSetupCallBooked`, `loadSetupCallSlots` | yes |
| lib/server/setup-call-link.ts | reads `setup_call_url` from site_settings on the staff DB, re-validated | yes |
| packages/shared/src/lib/setup-call-link.ts | https only, max 300, no credentials, needs a dot, `isCalendlyUrl` | yes |
| lib/server/call-scheduling.ts | Cal.com, Calendly and fake schedulers; `readSlotStart`, `readTimeZone`, `listCallSlots`, `bookCallSlot`, `cancelCallBooking`, `calcomBookingMetadata`; `BOOKING_WINDOW_DAYS=28` | yes |
| lib/server/calls.ts | `loadCalls`, `loadNextCall`, `callsAreOpen`, `loadBookCallOptions`, `bookTeamCall`, `cancelTeamCallFor` | yes |
| lib/server/calcom-webhook.ts | signature check, event parse, created/cancelled/rescheduled handling | yes |
| lib/server/kickoff-sync.ts | `startBuildsAfterKickoff`, `kickoffStartMode`, `kickoffSyncToken` | yes |
| lib/server/call-alert.ts | `announceCallBooked` to Teams (best effort) | NO |
| lib/calls/alert-facts.ts | alert text in IST | yes |
| lib/calls/form.ts | `readBookCall`: reason in allowed list, note trim, max 500 | yes |
| lib/calls/rows.ts | `callRows`, `upcomingCount`, `nextCallLine`, `MAX_UPCOMING_CALLS=3` | yes |
| lib/calls/slot-view.ts | `splitDayTimes` at noon IST, `bookButtonLabel`, `defaultReasonOf` | yes |
| lib/calls/links.ts | `CALLS_PATH="/requests/calls"` | yes |
| lib/call-dates.ts | `BRAND_TIME_ZONE`, `promiseDates` (start by +48h, live by +7 working days), `slotLabel`, `callWhen`, `dayMonth`, `shortDay` | yes |
| lib/server/missed-kickoff.ts | see home | yes |
| packages/shared/src/lib/call-slots.ts | `dayKey`, `groupSlotsByDay`, `callInviteHref` (.ics) | yes |
| packages/shared/src/lib/working-days.ts | `addWorkingDays` (weekends only) | yes |
| packages/db/src/call-reasons.ts | `CALL_REASONS` (website, social, search, billing, other), `MAX_CALL_NOTE_LENGTH=500` | yes |
| packages/db/src/queries/setup-calls.ts, team-calls.ts, kickoff-build.ts | persistence; `KICKOFF_FALLBACK_START_HOURS=24` | no query-level tests found |

### Components with logic
| path | logic |
|---|---|
| components/calls/slot-picker.tsx | loads slots via `loadCallSlots`; 3 days then "More days"; times split Morning/Afternoon; on `taken` the slot is removed and the list refreshed locally; if none or error shows booking-page link (or Requests link when no URL) (slot-picker.tsx:15,55-125) |
| components/calls/book-call-button.tsx | side sheet; reason defaults to first option; note maxLength 500; `replacing` mode "Change your call"; phone accounts see booking link (book-call-button.tsx:34-141) |
| components/calls/cancel-call-button.tsx | two-step confirm; `gone` counts as success |
| components/calls/calls-view.tsx | upcoming and past lists (not read in detail) |

### Package functions used
- `@brandbasket/db`: `findSetupCallBooking`, `recordSetupCallBooking`, `listTeamCalls`, `findTeamCall`, `recordTeamCall`, `cancelTeamCall`, `cancelTeamCallByUri`, `moveTeamCallByUri`, `recordBookedCallFromWebhook`, `moveSetupCallBooking`, `removeSetupCallBooking`, `markSetupCallHeld` (staff), `listKickoffsToStart`, `markProjectReadyAfterKickoff`, `firstPreviewDueAfterKickoff`, `addActivityEvent`, `findSiteSetting`, `findLatestKickoffOutcome`, `isPhoneAccountEmail`, `KICKOFF_FALLBACK_START_HOURS`.
- `@brandbasket/billing`: `isRealDeployment` (fake scheduler only off real deployments).
- `@brandbasket/shared`: `read-limited-body`, `error-log-info`; shared `lib/call-slots`, `lib/setup-call-link`.

### Behaviours a rebuild must keep
1. Provider choice: Cal.com if `CALCOM_API_KEY` set and the link is `https://cal.com/<user>/<event>`; else Calendly if `CALENDLY_API_TOKEN` and a calendly.com link; else on a real deployment `null` (customers get the booking page link), off real deployments a fake weekday scheduler (lib/server/call-scheduling.ts:307-314,277-304).
2. Slots: from now + 1 minute to 28 days ahead; a picked time must be a real date in that window; time zone input is validated against `Intl`, max 64 chars, else UTC (call-scheduling.ts:316-339).
3. 8 second timeout on provider calls (call-scheduling.ts:57,97,224).
4. "Taken" detection: Cal.com 409 or 400 with message matching `available|already|busy|conflict`; Calendly 409 (call-scheduling.ts:161-163,234-236).
5. Kickoff booking metadata `{source:"dashboard", businessId, purpose, reason?, note? (cut to 500)}`; no `purpose` means kickoff; Calendly gets `utm_content = businessId` (call-scheduling.ts:27-35,156).
6. Rescheduling books the new time first and cancels the old after; only a Cal.com booking whose stored URI matches `https://api.cal.com/v2/bookings/<uid>` can be cancelled; Calendly bookings are left for the customer to cancel from the email (setup-call.ts:107-127; call-scheduling.ts:187-188,351-355).
7. Kickoff is one row per business (`onConflictDoUpdate`), `bookedAt` is latest; `startsAt/endsAt` may be absent (packages/db/src/queries/setup-calls.ts:14-37).
8. Calls after kickoff: at most 3 booked and not ended at once, not counting the one being changed; a changed call must be `booked` and still ahead; reason must be one of bought services plus Billing and Something else; note trimmed, max 500 (lib/server/calls.ts:101-104; lib/calls/rows.ts:6,94-96; lib/calls/form.ts:25-31).
9. If the DB insert fails after the provider booked, the provider booking is cancelled and the customer sees failure (lib/server/calls.ts:129-133).
10. Cancel order: provider first, then DB, so a call still on the host calendar is never shown cancelled; `gone` for not booked or already started; a webhook cancelling in between counts as success (lib/server/calls.ts:167-179).
11. Calls are closed (book, change, cancel, page) until paid AND the first look is over; the page redirects to `/requests` (lib/server/calls.ts:51-55; calls/actions.ts:43; calls/page.tsx:18).
12. Phone-only accounts cannot book (invitation cannot reach them) in all three entry points (setup-call-actions.ts:27; calls/actions.ts:43; calls/page.tsx:26).
13. Calls page rows: upcoming = booked and not ended, or kickoff not held and not ended; cancelled hidden; kickoff row only with both times and never changeable or cancellable there; `agreed` text only for held calls; upcoming soonest first, past newest first (lib/calls/rows.ts:68-91).
14. `loadCalls` throws on a read failure (page shows an error rather than an empty list) but `loadNextCall` is quiet (lib/server/calls.ts:29-45).
15. Webhook signature: HMAC-SHA256 of raw body, hex, constant-time compare; no secret gives 503; bad signature gives 401 plus a `webhook_signature_invalid` security event; body over 256 KiB gives 413; everything else returns 200 `{received:true}` so Cal.com does not retry; every outcome is logged with `noteWebhook("calcom")` (lib/server/calcom-webhook.ts:63-67,126-129; app/api/webhooks/calcom/route.ts:8,40-67).
16. Webhook `BOOKING_CREATED`: dashboard `purpose:"kickoff"` is ignored; the attendee email must belong to exactly one business (or the metadata hint must be one of the attendee's businesses); recorded only after the kickoff is held; reason defaults to `other`; source `dashboard` if purpose is `call` else `booking_page`; deduped by provider URI (packages/db/src/queries/team-calls.ts:111-165).
17. Webhook `BOOKING_CANCELLED`: kickoff booking held by staff keeps its row and held mark but clears URI and times; unheld kickoff row is deleted so Home asks again; otherwise tries team calls (setup-calls.ts:61-72; calcom-webhook.ts:146-151). `BOOKING_RESCHEDULED` moves by the old URI (calcom-webhook.ts:152-159).
18. Build start after kickoff: `POST /api/internal/start-builds-after-kickoff` every 15 minutes; 503 if token unset or too short, 401 wrong token, 502 if any build failed, else 200 with report; starts when staff marked held OR the call ended more than 24 hours ago (unless `KICKOFF_AUTO_START=off`); first preview due 48 hours after the call; writes activity "Kickoff call completed"; safe to repeat (lib/server/kickoff-sync.ts:13-62; app/api/internal/start-builds-after-kickoff/route.ts:15-21; packages/db/src/queries/kickoff-build.ts:14).
19. Mismatch to keep in mind: Home's `kickoff_unconfirmed` window is open until staff mark or the 24h sync fires, while the first look closes 2 days after the call (lib/first-look.ts:31 vs kickoff-build.ts:14).
20. Promises on screen: "within 48 hours of the call", live "within 7 working days" (weekends skipped, holidays not); picker note "your website can be live by <date>" (lib/call-dates.ts:10-24; lib/first-look-steps.ts:27-33; components/first-look/kickoff-picker.tsx:25-29).
21. The .ics download is a data URL, UID from start stamp, title "Brandbasket kickoff call", description "The video link is in your confirmation email." (packages/shared/src/lib/call-slots.ts:35-52).
22. Staff Teams alert for kickoff and later calls: events `kickoff_booked|kickoff_changed|call_booked|call_changed`, facts When (IST), Moved from, About, Services, Meeting link, customer's note, Join meeting button (lib/calls/alert-facts.ts:38-58); never throws (lib/server/call-alert.ts:41-43).
23. The booking link is read from `site_settings` on every request so console edits show at once (lib/server/setup-call-link.ts:7-13).
24. Kickoff state read is cached per tenant object so shell and page agree on `readAtMs` (lib/server/setup-call.ts:33-39).
25. SlotPicker "taken" path removes the slot and, if no slots remain, falls back to the booking-page link; error text per reason: taken, failed, limit "You already have 3 calls booked. Change or cancel one first." (components/calls/slot-picker.tsx:27-31,112-123).

### Old paths and query params that need a redirect
- `/requests/calls` (CALLS_PATH, used by lib/rail.ts:3) to `/help`.
- Home kickoff picker is on `/`; keep working.
- Webhook paths `/api/webhooks/calcom` and `/api/internal/start-builds-after-kickoff` stay in platform (plan section 5).

---

## requests

### Old routes
| File | URL | Query read |
|---|---|---|
| PROT/requests/page.tsx | `/requests` | `open` (must be uuid else 404; unknown ticket 404), `filter` (waiting, open, done), `notice` (changed, window, failed), `charge` (payment result via `readChargeNotice`) (requests/page.tsx:17-37) |
| PROT/requests/new/page.tsx | `/requests/new` | `intent` or old `kind`, `page`, `from=preview`, `about=<post uuid>`; unpaid redirects `/` (new/page.tsx:28-43) |
| (support)/support/page.tsx | `/support` | redirect `/requests` |
| (support)/support/[ticketId]/page.tsx | `/support/[ticketId]` | non-uuid 404, else `/requests?open=<id>` |
| app/app-host/support-attachments/[attachmentId]/route.ts | `GET /support-attachments/<id>` | 401 unsigned; owner only |
| app/api/support-uploads/route.ts | `POST`, `DELETE ?attachmentId=` | see below |

### Server actions
| File | Action | Guard / limits / key |
|---|---|---|
| PROT/requests/actions.ts | `askForChangeAction` | `requireCustomerAccess`; unpaid redirect `/`; rollout flag; 5 per 10 minutes and 20 per day per user; `submissionKey` idempotent; alerts once |
| PROT/requests/move-actions.ts | `declineQuoteAction`, `approveChangeAction`, `reopenRequestAction` | `requireCustomerAccess`; ids are uuids; DB function `moveChangeAsCustomer` checks business, state, 14 days |
| PROT/requests/pay-actions.ts | `acceptQuoteAction` | `requireBillingAccess`; opens charge idempotently |
| (support)/support/actions.ts | `replyToSupportRequest`, `acknowledgeSupportReplies` | `getSupportAccess` (works for unpaid and affiliates, not closing accounts); 30 replies per hour; `submissionKey` idempotent |
| PROT/billing/actions.ts | `payChargeAction` (used by "Pay" in NextStepBox) | other agent's area |

### Lib modules
| path | what it decides or does | .test.ts? |
|---|---|---|
| lib/requests/form.ts | intents (7), `intentRule`, `intentOptions`, `kindOptions`, `parseAskForm`, `titleFromText`, `readAskDefaults`, `cleanPage` | yes |
| lib/requests/rows.ts | list rows, filters, `chooseView`, `includedHeaderLine` | yes |
| lib/requests/status.ts | `stepperRows`, `readyByDay`, `canReopen`, `nextStep` copy per state | yes |
| lib/requests/needs.ts | `needsYouFrom`, `waitingOnYouFrom`, `noticeInputsFrom` (bell) | yes |
| lib/requests/links.ts | `REQUESTS_PATH`, `requestHref`, `listRowHref`, `requestChangeHref` | yes |
| lib/requests/notices.ts | notice and payment return sentences | yes |
| lib/server/requests.ts | `loadRequests`, `loadRequestNeeds`, `loadWaitingOnYou`, `loadRequestsBadge`, `loadUnreadReplies`, `loadRequestDetail`, `loadTicketIdOfRequest`, `loadTicketIdOfChangeCharge` | yes |
| lib/server/change-quote.ts | `openQuoteCharge` (staff DB, price from stored quote, GST from plan) | yes |
| lib/server/request-form-ids.ts | `readRequestIds` (uuid or 404) | NO |
| lib/server/support-limits.ts | `supportRateLimit` | NO |
| lib/server/support-rollout.ts, lib/support-rollout.ts | `BRANDBASKET_SUPPORT_MODE` gate (unset or `on`: all; `internal`: listed accounts) | pure part yes, server wrapper NO |
| lib/server/support-access.ts, lib/support-access.ts | support works for any live account | pure part yes |
| lib/server/support-uploads.ts | multipart handler, image re-encode, staging | yes |
| lib/server/support-alerts.ts | staff email on new ticket and reply (staff connection; outbox copy has only reference, category, status, link) | yes |
| lib/server/support-attachment-maintenance.ts, support-retention.ts, support-account-erasure.ts | purge, 24 month retention, erasure | yes |
| lib/support-form-state.ts | `SupportFormState` | NO |
| lib/support-paste.ts | pasted image to `screenshot-HHMMSS.png` | yes |
| lib/reply-bar.ts | Cmd/Ctrl+Enter sends; textarea height capped at 136 px | yes |
| lib/ask-form.test.ts, lib/requests/new-defaults.test.ts | tests for form.ts (no module of that name) | yes |
| lib/server/account-panel.ts | bell data: banner, project, requests, unread | yes |
| packages/shared/src/lib/change-requests.ts | constants and labels (2 edits a month, 15 min, 2 working days, 14 day reopen, quote cap 40 h and 30 days), `customerStatus`, `ticketStatusWord` | yes |
| packages/shared/src/lib/support.ts, support-form.ts | categories, 3 attachments, 4 MB, reply schema (1 to 5000) | yes (support-form) |
| lib/owner-replies.ts | NOT requests: dormant directory review replies and CORS; do not port | yes |

### Components with logic
| path | logic |
|---|---|
| components/requests/ask-form.tsx | paste images, hidden `submissionKey`, `page` field only for website intent |
| components/requests/reply-form.tsx | new `crypto.randomUUID()` key after each send; focus status on error; `router.refresh()` on saved; label "Ask for a fix" when change is in `preview` (reply-form.tsx:93-107; request-detail.tsx:75) |
| components/requests/next-step-box.tsx | one dark button (accept, pay, approve) plus soft decline or reopen |
| components/requests/request-detail.tsx | "Talk about it on a call" link with default reason and note "About my request: <subject>", hidden when ticket closed (request-detail.tsx:49-51); closed message links to new request |
| components/panel/support/support-read-receipt.tsx | acknowledges on visible tab only; fires once; dispatches `brandbasket:support-read` |
| components/panel/support/support-attachments (not read) | screenshot upload UI |

### Package functions used
- `@brandbasket/db`: `createSupportTicketWithOutcome`, `appendSupportReplyWithOutcome`, `markSupportTicketRead`, `getSupportTicket`, `SupportQueryError`, `listRequestItems`, `listRequestNeeds`, `listWaitingOnYou`, `listUnreadReplies`, `getChangeWithEvents`, `findTicketIdOfChangeRequest`, `findTicketIdOfChangeCharge`, `moveChangeAsCustomer`, `ChangeRequestError`, `acceptChangeQuote`, `countIncludedEdits`, `findDeliverableForBusiness`, `getSupportAttachmentForUser`, `stageSupportAttachment`, `confirmSupportAttachmentUpload`, `getStagedSupportAttachment`, `markSupportAttachmentDeleted`, `markSupportAttachmentPurged`, `withSupportUploadLock`, `findOpenClosureForUser`, `consumeRateLimit`.
- `@brandbasket/shared`: `lib/change-requests`, `lib/support`, `lib/support-form`, `lib/account-panel` (`noticesFrom`), `server/support-attachment-serving`, `server/support-storage`, `server/support-attachment-maintenance`.
- `@brandbasket/email`: staff alert templates via support-alerts (not read in detail).

### Behaviours a rebuild must keep
1. Seven intents: website_update, social_request, search_request, question, send_info, not_working, billing. Service intents offered only if the service is bought. Only the first three open a change request (a quote and a state); the rest are plain conversations filed under categories website_change, other, other, support, general, bug, billing (lib/requests/form.ts:28-108,121-126).
2. Body 10 to 5000 characters and must contain a letter or digit; page max 200 and kept only for website_update; up to 3 distinct screenshot uuids; submissionKey 8 to 128 of `[A-Za-z0-9_-]` (lib/requests/form.ts:223-250).
3. Subject is derived (no title field): first sentence if at least 8 characters else whole text, cut to 60 including `...` at a word boundary only if the space is past character 20, trailing punctuation stripped, min 3 chars else text or "Request", first letter upper-cased (lib/requests/form.ts:142-171).
4. Creation limits: 5 per 600 s AND 20 per 86400 s per user (`support:create-short|create-day:<userId>`), replies 30 per 3600 s (`support:reply:<userId>`), counted on the staff connection; message "Please wait N seconds before sending another request." (lib/server/support-limits.ts:9-21).
5. Idempotency: ticket and first message share the key; same key and same hash returns the saved ticket with `created:false` (no second alert); same key, different payload throws `conflict`; guarded by an advisory lock. Reply path works the same on message key (packages/db/src/queries/support.ts:91-113,173-186; PROT/requests/actions.ts:60-67).
6. A fresh `randomUUID()` key is generated per server render of the page and per reply box, and again after each reply is sent (requests/page.tsx:52; new/page.tsx:48; components/requests/reply-form.tsx:94-100).
7. Rollout flag: new requests refused with "New requests are temporarily unavailable. Please try again later." when `BRANDBASKET_SUPPORT_MODE=internal` and the user is not listed; unset or `on` allows all; replies are not gated (lib/support-rollout.ts:1-5; PROT/requests/actions.ts:38).
8. Ticket plus change request created in one transaction; business membership checked; `create_change_request(ticket, kind, page)` DB function runs under `app.business_id` (packages/db/src/queries/support.ts:114-122).
9. Display ref is `FY-<uuid hex>` (Fynix prefix) and is returned in the saved state; plan says no ticket numbers in the list (support.ts:114; PROT/requests/actions.ts:70).
10. Move actions never trust the posted ticket id: the ticket to return to is looked up from the request id; error codes `wrong_state` and `not_found` give notice `changed`, `window_closed` gives `window`, anything else `failed` and is logged; revalidates `/requests` and `/` (move-actions.ts:14-35).
11. Reopen window is 14 days counted from the latest event that entered the current state; reopenable states are approved, shipped, and withdrawn with paid coverage (lib/requests/status.ts:57-63; packages/shared/src/lib/change-requests.ts:19).
12. Accept quote: same charge on double press; business from session, price from stored quote, GST rate from the customer's plan (needs a plan or throws `forbidden`); on `wrong_state` or `not_found` the notice is `changed` (not logged); then redirect through the shared charge payment flow (pay-actions.ts:20-38; lib/server/change-quote.ts:12-22). Payment return `?charge=paid` gives "Payment received. We have started on your change."; `processing` gives "...starts within a minute or two." (lib/requests/notices.ts:28-38).
13. Stepper: Sent, Quoted, In progress, Ready to check, Done with the date each was first reached; a covered request without a quote shows "Included" under Quoted; declined or withdrawn requests have no stepper (lib/requests/status.ts:21-34).
14. Ready-by date: quoted gives today + `quote.workingDays`; paid work in progress gives accepted day + working days; an included edit gives created day + 2 working days; weekends skipped, public holidays not; all IST (lib/requests/status.ts:41-54; change-requests.ts:17).
15. Next-step box copy and buttons per state: requested, quoted (accept label with price, "Not now"), quoted with open charge ("Pay <total>"), in_progress, revisions, preview ("Looks good"), approved, shipped, declined (shows `closedReason`), withdrawn ("Reopen the quote") (lib/requests/status.ts:85-139).
16. Included edits: 2 a month for website plans, 15 minutes each; header line "This month: x of 2 included edits used." hidden when allowed is 0 (change-requests.ts:13-17,80; lib/requests/rows.ts:110-112).
17. List: filters waiting, open, done (closed is filed under done); default is waiting if any else open; `?open=` of a row picks the filter containing it; unknown or non-uuid `open` is 404; status "Waiting for you" when the ticket is `waiting_on_you` and the change is not done or closed (lib/requests/rows.ts:42-107; requests/page.tsx:31-37).
18. Needs you wording: preview gives "Check this change: <subject>", accepted-not-paid gives "Pay for: <subject>" with price, else "Accept a quote: <subject>" ; "Reply to: <subject>" for team questions not already listed (lib/requests/needs.ts:32-48). Rail badge counts distinct tickets (lib/server/requests.ts:67-71).
19. Bell: a reply notice is skipped when the ticket already has an ask; subject cut at `NOTICE_SUBJECT_LIMIT` with `...`; link `/requests?open=<ticketId>`; reply notices not "actionable" (lib/requests/needs.ts:12-18; packages/shared/src/lib/account-panel.ts:119-126).
20. Read receipt: marks the newest public message read only when the tab is visible, once, on `visibilitychange`; a prefetch must not clear replies; DB keeps `greatest(last_read_message_id)`; revalidates `/support` and `/requests`; unread = any public staff message newer than the read marker (components/panel/support/support-read-receipt.tsx:6-21; packages/db/src/queries/support.ts:162-165,194-199; (support)/support/actions.ts:41-55).
21. Reply errors: closed ticket gives "This request is closed. Open a new request to continue."; ticket in retention counts as closed; conflict gives "This request changed. Refresh it and try again."; unexpected errors report to `reportServerError` and say the draft is still there ((support)/support/actions.ts:16-22; support.ts:183-185).
22. Screenshot upload: `POST /api/support-uploads` multipart; max 3 files per request, 4 MiB each, 12 MiB total, body limit 12 MiB + 64 KiB; PNG/JPEG/WebP only, re-encoded, max 3200 px side and 16 megapixels; filename cleaned to 120 chars; 20 uploads per hour per user (`support-upload:user:<id>`); staged rows expire in 24 hours; per-user advisory lock; account being closed refused; semaphores allow 2 requests and 2 decodes with a queue of 4, else 503 (lib/server/support-uploads.ts:13-20,148-149,189,216; app/api/support-uploads/route.ts:30-41).
23. `DELETE /api/support-uploads?attachmentId=` removes only the caller's staged (unattached) screenshot; attached images are immutable; 204 or 202 (route.ts:54-98; support-uploads.ts:323-348).
24. Attachments served only to the owner through `getSupportAttachmentForUser`, 401 if signed out, private no-store (app/app-host/support-attachments/[attachmentId]/route.ts:10-24).
25. Retention: closed tickets and attachments purged after 24 months (`SUPPORT_TICKET_RETENTION_MONTHS` 1 to 120, invalid value throws so a typo never purges early) (lib/server/support-retention.ts:7-30).
26. Support access: any non-closing, non-signed-out account including unpaid and affiliate users; `businessId` null for non-granted (lib/support-access.ts:10-14).
27. `/requests/new` defaults: `intent` wins over old `kind` (website, social, search, billing, other); only an offered intent is selected; `from=preview` shows "Your preview is waiting. Tell us what to change."; `about=<uuid>` loads the post scoped to the business and prefills `About the post "<title>" (<due>): ` (lib/requests/form.ts:129-207; new/page.tsx:30-43).
28. Alerts to staff: new ticket and reply alerts are best effort (`.catch` and log); outbox copy holds only reference, category, status, link; system error alerts are deduped per error class and route (lib/server/support-alerts.ts:15-18,176-180).
29. Reply composer: max 5000, Cmd/Ctrl+Enter submits unless pending or uploading, textarea grows to 136 px then scrolls (lib/reply-bar.ts:8-19; components/requests/reply-form.tsx:46-50).

### Old paths and query params that need a redirect
- `/support` to `/requests`; `/support/[ticketId]` to `/requests?open=<id>` (404 for non-uuid). Emails already sent point here: apps/admin/lib/server/staff-opened-request.ts:77 builds `APP_ORIGIN/support/<ticketId>` for the "staff opened a request" email.
- `/requests/new` to the new dialog (`/requests?new=1`), preserving `intent`, `kind`, `page`, `from=preview`, `about`. In-app producers: Home `/requests/new` and `/requests/new?kind=website` (components/home/ongoing-home.tsx:53, progress-home.tsx:77), `/requests/new?kind=website[&page=]` (lib/website/tabs.ts:21), `/requests/new?kind=social&about=<postId>` (lib/requests/links.ts:26-28), `/requests/new?intent=send_info` (components/panel/details/brand-assets-panel.tsx:113), OyeChats intro (components/panel/oyechats/oyechats-intro.tsx:13,29).
- `/requests?open=<ticket>[&filter=][&notice=changed|window|failed][&charge=<code>]`: the bell (packages/shared/src/lib/account-panel.ts:126), move actions and charge returns produce these (lib/requests/links.ts:11-23; lib/billing/charge-notices.ts).
- `/support-attachments/<id>` links stored in messages must keep resolving (host-level route).
- `/requests/calls` to `/help` (calls section).

---

## enquiries

### Old routes
| File | URL | Query read |
|---|---|---|
| PROT/website/enquiries/page.tsx | `/website/enquiries` | `page` (`readPageParam`: `^[1-9][0-9]{0,5}$` else 1; past end clamps to last) |
| PROT/website/enquiries/leads/page.tsx | `/website/enquiries/leads` | `page`; redirect to enquiries (leads/page.tsx:5-8) |
| PROT/website/enquiries/name/page.tsx | `/website/enquiries/name` | redirect (name/page.tsx:5) |
| PROT/oyechats/page.tsx | `/oyechats` | `page`; redirect (oyechats/page.tsx:5-8) |
| PROT/website/layout.tsx | frame | `requireWebsiteClient`, `WebsiteFrame` |
| app/api/webhooks/oyechats/route.ts | `POST` (stays in platform) | header `x-oyechats-signature`, body max 64 KiB |

### Server actions
| File | Action | Guard / limits |
|---|---|---|
| PROT/website/enquiries/actions.ts | `openLeadConversationAction(leadId)` | `requireWebsiteClient`; lead found through RLS first; 60 opens per minute per business (`oyechats-conversation:business:<id>`) |
| | `renameChatbotAction(chatbotId, name)` | `requireWebsiteClient`; name 1 to 80; revalidates `/website/enquiries` layout |

### Lib modules
| path | what it decides or does | .test.ts? |
|---|---|---|
| lib/chatbots-view.ts | `CHATBOT_PATH`, status lines, warmth words, lead title, `buildLeadRows`, notices, `parseChatbotName`, `readPageParam`, `paginationItems`, `pageRangeLabel`, `conversationsAvailable` | yes |
| lib/server/chatbots.ts | `loadLeadsPage` (10 per page, week and month counts), `renameCustomerChatbot`, `loadChatbots` | yes |
| lib/server/chatbot-conversations.ts | `loadBotActivity`, `loadLeadConversation` (staff key read only for the lead's own bot) | yes |
| lib/server/oyechats-api.ts | OyeChats HTTP client: `fetchLeadActivity` (cached), `fetchConversation`, parsers | yes |
| lib/server/oyechats-webhook.ts | lead and qualification intake, Teams alert (not in customer UI) | yes |
| lib/server/site-contacts.ts | `loadSiteContacts` (quiet) | NO |
| lib/site-contacts.ts | `measuredContacts`, 30 and 90 day windows | yes |
| lib/site-events.ts | `websiteEnquiriesLine` (Home) | yes |
| packages/shared/src/server/oyechats-webhook.ts | `verifyOyeChatsSignature`, `parseOyeChatsEvent`, `readOyeChatsBotId` | yes |

### Components with logic
| path | logic |
|---|---|
| components/panel/oyechats/lead-table.tsx | `readable = conversationsAvailable(rows)`: hides message counts and open buttons when no row has a count; `aria-haspopup=dialog` |
| components/panel/oyechats/lead-conversation-dialog.tsx | opens native dialog, calls `openLeadConversationAction`, `aria-live=polite`; `mailto:` and `tel:` (non-digits except `+` stripped) links (dialog.tsx:64-69) |
| components/panel/oyechats/chatbot-name.tsx | inline rename, maxLength 80 |
| components/panel/oyechats/lead-pagination.tsx | uses `paginationItems` |
| components/panel/oyechats/site-contact-figures.tsx | Calls, WhatsApp, Forms for last 30 days |
| components/panel/oyechats/chatbot-panel.tsx, lead-figures.tsx, oyechats-intro.tsx | status lines; "Included in your plan"; links to `/requests/new` |

### Package functions used
- `@brandbasket/db`: `listChatbotsForBusiness`, `listChatbotLeadsForBusiness`, `countChatbotLeadsForBusiness`, `countChatbotLeadsSince`, `findChatbotLeadForBusiness`, `findChatbotOperatorAccess` (staff), `renameChatbot`, `countSiteEvents`, `consumeRateLimit`, types `Chatbot`, `ChatbotLead`, `ChatbotStatus`; webhook side: `findChatbotWebhookTarget`, `recordChatbotLead`, `applyChatbotQualification`.
- `@brandbasket/shared/server`: `oyechats-webhook`, `read-limited-body`.

### Behaviours a rebuild must keep
1. Gate is `requireWebsiteClient` (paid customers without the Managed Website service go Home; unpaid and lapsed pass); data is read as the customer through RLS (lib/server/customer-access.ts:122-126; lib/server/chatbots.ts:28-51).
2. 10 leads a page newest first; figures are total, last 7 days, last 30 days; page clamped to `[1, pageCount]` (lib/server/chatbots.ts:7,32-50).
3. With no bots the page shows only contact figures and "no assistant yet"; with bots but zero leads it shows "No leads yet" (enquiries/page.tsx:32-44,61-67).
4. Website contacts (calls, WhatsApp, forms) over the last 30 days come from website-reported events; hidden entirely when nothing was reported in the last 90 days, so a non-reporting site never shows three unmeasured zeros; read failure also hides (lib/site-contacts.ts:8-21; lib/server/site-contacts.ts:11-21). Plan: Google profile calls only as daily count, taps are "Counted" with no reply action.
5. Message counts come from OyeChats, fetched only when `total > 0`; a bot without operator key or an unreachable OyeChats gives `null` for that bot and the lead rows still render with a dash (enquiries/page.tsx:46-48; lib/server/chatbot-conversations.ts:22-33; lib/chatbots-view.ts:104-125).
6. OyeChats client: 5 s timeout, `redirect:"error"`, header `X-Operator-Key`, 200 sessions a page up to 5 pages, summaries cached 60 s per bot (failures 15 s, max 200 bots); 404 is `not-found`; any other failure `unavailable`; keys never logged (lib/server/oyechats-api.ts:17-22,125-141,169-190).
7. Open conversation: lead id resolved through RLS first (other business's id gives `not-found` before any key is read); per-business budget 60 per minute then `limited`; operator key read on the staff connection for that lead's bot only; the session id sent to OyeChats is the stored one, never from the browser (lib/server/chatbot-conversations.ts:15,46-58).
8. Conversation parsing: roles `user` to visitor, `bot` to assistant (shown "OyeChats"), `operator` to team; `system` and unknown roles dropped; text cut at 4000 characters; timestamps without a zone are read as UTC (lib/server/oyechats-api.ts:24,80-87,101-119; lib/chatbots-view.ts:139).
9. Pop-up notices: not-found "This conversation is no longer available.", unavailable "...Try again in a minute...", limited "You have opened a lot of conversations in a short time. Wait a minute and try again.", empty "There are no messages in this conversation." (lib/chatbots-view.ts:129-134).
10. Lead title is the first present of name, email, phone, company, else "Unnamed visitor"; company line is not repeated in the details; avatar initial is the first letter or digit else `?` (lib/chatbots-view.ts:41-50,77-81,115).
11. Warmth words: `sql` Hot, `sal` Warm, `mql` Cool (case-insensitive); anything else shows nothing (lib/chatbots-view.ts:20-25).
12. Bot status copy: setting_up, live, paused with fixed sentences (lib/chatbots-view.ts:13-17).
13. Rename: whitespace collapsed, 1 to 80 characters; scoped to the session's business; DB column grant means the customer role can change names only; revalidates the whole `/website/enquiries` layout because both pages show the name (lib/chatbots-view.ts:141-149; actions.ts:41-51; lib/server/chatbots.ts:53-60).
14. Pagination shows first, last, current and one either side, with a gap marker, or the missing single page when the gap is one (lib/chatbots-view.ts:160-181); range text "Showing 11 to 20 of 23 leads" (lib/chatbots-view.ts:184-189).
15. Overview's enquiries figure is calls + WhatsApp + forms + chatbot leads this month, compares with last month including its chatbot leads, and falls back to chatbot-only when no site events exist (lib/server/overview.ts:56-68; lib/site-events.ts:34-48).
16. Webhook (stays): body max 64 KiB; one 401 for unknown bot, missing and wrong signature so bot ids are not revealed; business comes from our bot record never the body; wrong signature raises a `webhook_signature_invalid` security event; always logged with `noteWebhook("oyechats")`; new lead alerts the Teams enquiries channel (app/api/webhooks/oyechats/route.ts:8,20-47; lib/server/oyechats-webhook.ts:41-60).
17. Tab visibility: Enquiries tab is hidden before the site is live (rail flag `websiteLive`) (lib/rail.ts:43; lib/website/tabs.ts:11).
18. Plan section 5 requires rename chatbot, conversation view and contact figures to survive in the new Enquiries; section 4 adds status filters, source filters and Call/WhatsApp actions that do not exist in the old code (new work, not parity).

### Old paths and query params that need a redirect
- `/website/enquiries` (and `?page=N`) to `/enquiries` (page number: new list has `?open=id` only; decide how `page` maps).
- `/website/enquiries/leads?page=N`, `/website/enquiries/name`, `/oyechats?page=N` to `/enquiries`.
- `/website/pages` to `/website` (already a redirect, PROT/website/pages/page.tsx:4).
- In-app links: Website tab list (lib/website/tabs.ts:11), OyeChats pagination (components/panel/oyechats/lead-pagination.tsx uses `CHATBOT_PATH`), `legacy-links.test.ts` guards `/oyechats` references (lib/legacy-links.test.ts:15).

---

## website

### Old routes
| File | URL | Reads |
|---|---|---|
| (protected)/website/page.tsx | `/website` | `?response=` one of `approved`, `changes-sent`, `not-ready` (anything else ignored) (page.tsx:32,40-41; lib/website/notices.ts:21-23) |
| (protected)/website/layout.tsx | frame for `/website/*` | calls `requireWebsiteClient` (layout.tsx:7) |
| (protected)/website/pages/page.tsx | `/website/pages` | redirect to `/website` (pages/page.tsx:5) |
| (protected)/website/preview-image/route.ts | `GET /website/preview-image?v=<capturedAt ms>` | `v` is only a cache buster, never read (route.ts:7-11) |
| (protected)/project/page.tsx | `/project` | `?response=` passed on to `/website?response=` (project/page.tsx:11-12) |
| (protected)/website/enquiries/* | `/website/enquiries`, `/leads`, `/name` | OUT OF MY SCOPE (Enquiries); `WEBSITE_TABS` links to it (lib/website/tabs.ts:8-12) |

### Server actions
| File | Action | Guards, limits, idempotency |
|---|---|---|
| (protected)/website/actions.ts | `approvePreviewAction` | `requireCustomerAccess`, then `!billing.hasAccess` goes `/` (actions.ts:26-28); staff DB; no rate limit; no key. Idempotent by a conditional update `status='preview'`; a second press throws `ProjectNotAwaitingResponseError` and redirects `?response=not-ready` (actions.ts:32; packages/db/src/queries/projects.ts:204-212) |
| same | `sendPreviewFeedbackAction` | `requireCustomerAccess`, `hasAccess`, `canCreateSupportRequest` kill switch, `parsePreviewFeedback`, `supportRateLimit(user.id,false)` = 5 per 600 s and 20 per 86400 s, `submissionKey` (8 to 128 of `[A-Za-z0-9_-]`) (actions.ts:49-62; lib/server/support-limits.ts:10-15; lib/website/feedback.ts:26) |
| (protected)/project/actions.ts | `checkDomainAction` | `requireCustomerAccess` only; no rate limit; no key (project/actions.ts:18-19). Belongs to domain, listed there |

### Lib modules
| path | what it decides or does | Test |
|---|---|---|
| lib/server/website.ts | `loadWebsite`: project, domain, live read strictly; history, picture, versions, changes, kickoff-first read via `quietly`; derives `previewDue`, `plannedLaunch`, `pictureUrl` | yes |
| lib/website/progress-view.ts | `progressView` (9 kinds), `roundsUsedUp`, `roundsLine`, `ROUNDS_USED_UP`, `revisionDue` (2 working days) | yes |
| lib/website/timeline.ts | 4-step "What happens next", `liveDate`, `currentStep`; constants 2/1/7 working days | yes |
| lib/website/history.ts | `versionRows`, `inProgressRow`, `changesView`, `detailRows`, `stageChip`, `recentChanges` (5 max) | yes |
| lib/website/feedback.ts | `parsePreviewFeedback`, `feedbackSubject` | yes |
| lib/website/notices.ts | three fixed `?response=` messages, `websiteNoticeHref` | no |
| lib/website/tabs.ts | `WEBSITE_PATH`, `WEBSITE_PREVIEW_IMAGE_PATH`, tabs, `askAboutHref` | yes |
| lib/website/address.ts | `siteAddress`, `previewHost`, `addressCardView` | yes |
| lib/website/change-yourself.ts | the two "change it yourself" items (Business, Blog) | yes |
| lib/server/project-response.ts | `respondToPreview`: DB move then best-effort team email | yes |
| lib/server/preview-changes-email.ts | customer confirmation email with ready-by date | no |
| lib/server/preview-versions.ts | `loadPreviewVersions`, `loadSentChanges` on the staff DB | yes |
| lib/server/website-address.ts | request-cached address for the frame | no |
| lib/project-stages.ts | second, older 4-stage model (`projectStageIndex`) used by Home next-step card | yes |
| lib/server/support-limits.ts, lib/server/support-rollout.ts, lib/support-rollout.ts, lib/support-form-state.ts | shared with Requests (other agent) | unverified |
| lib/server/customer-access.ts, lib/server/billing.ts | guards above | customer-access yes |
| lib/server/onboarding.ts (`getLiveWebsite`, `readLiveWebsite`) | live = latest project `live` AND a primary domain exists, else null (onboarding.ts:119-127) | yes |
| lib/server/live-preview.ts, lib/preview-link.ts, preview-origins.ts, preview-draft.ts | live preview of the directory page; used by Business page only (see business profile) | live-preview no; others yes |
| lib/server/website-refresh.ts | tells the marketing site a directory page changed; called only from privacy-requests | yes |
| lib/server/site-hosting.ts, lib/site-hosting-sync.ts, lib/site-hosting-alert.ts, lib/vercel-projects.ts | plan 57 hosting enforcement (pause/unpause Vercel project). Machine job, STAYS in platform | sync/alert/vercel yes; site-hosting.ts no |
| lib/server/site-api.ts, site-info.ts, site-media.ts, site-cors.ts, site-events.ts, site-hit-*.ts, lib/site-*.ts, app/api/site/* | public API client websites call (info, posts, media, events). STAYS in platform, not the customer app | mostly yes (site-media, site-cors no) |

### Components with logic
| path | logic worth porting |
|---|---|
| components/website/preview-approve.tsx | in-page two-step confirm ("Yes, approve" / "Keep reviewing"), focus moves to the sentence then back, never a modal (preview-approve.tsx:19-47) |
| components/website/preview-feedback.tsx | textarea 5000 max, focus on `body` error, paste-screenshot handler, Send disabled while uploads run, hidden `submissionKey` and `attachmentIds` (preview-feedback.tsx:25-31,43-46,57,70) |
| components/website/preview-card.tsx | Approve and feedback only on the newest version while reviewing; rounds-used-up swaps the box for the rounds line and an "Ask for a change" link; browser frame only while reviewing (preview-card.tsx:20-35,45,75) |
| components/website/website-frame.tsx | address in the lede, tabs only once live (website-frame.tsx:14-16) |
| components/website/address-card.tsx, live-card.tsx, recent-changes-card.tsx, timeline.tsx, stage-header.tsx, details-card.tsx, change-yourself-card.tsx | markup over the lib views; live-card uses `safeExternalHref` (live-card.tsx:11) |
| components/panel/support/support-attachments.tsx (not read) | staging of screenshots; owned by the Requests agent |

### Package functions used
- `@brandbasket/db`: `findLatestProject`, `getPrimaryDomain`, `listProjectEvents`, `findSetupCallBooking`, `findPreviewImageInfo`, `findPreviewImage`, `listPreviewVersions`, `listFeedbackForProject`, `approveProjectPreview`, `requestProjectRevisions`, `linkFeedbackTicket`, `createSupportTicketWithOutcome`, `consumeRateLimit`, `isPhoneAccountEmail`, `businessUrlCode`, `withTenantScope`; errors `ProjectNotAwaitingResponseError`, `RevisionRoundsUsedUpError`, `SupportQueryError`.
- `@brandbasket/shared`: `lib/working-days` (`revisionReadyDay`, `REVISION_READY_WORKING_DAYS`, `workingDayOf`), `lib/call-slots` (`dayKey`), `lib/project-customer-line` (`CUSTOMER_STAGE_HEADLINE`), `lib/support` (`SUPPORT_ATTACHMENT_LIMIT` = 3), `lib/safe-link` (`safeExternalHref`), `lib/onboarding/domain-form` (`isTemporarySubdomain`), `server/error-log-info`.
- `@brandbasket/email`: `createAppEmailTransport`, `previewApprovedEmail`, `previewRevisionsRequestedEmail`, `previewChangesReceivedEmail`.
- `@brandbasket/billing`: `planHostingActions` (hosting job only).

### Behaviours a rebuild must keep
1. Page needs a paid account; unpaid and lapsed pass `requireWebsiteClient` but the page still sends `!hasAccess` Home; paid-without-website goes Home (website/page.tsx:37-39; lib/server/customer-access.ts:122-126).
2. Both preview actions re-check `hasAccess` and send Home, because a page opened before access lapsed must not answer (website/actions.ts:27-28,51).
3. Business and person come only from the session; nothing in the approve form is read (website/actions.ts:21-24).
4. Approve and revisions run on the STAFF connection because the database locks `bb_app` to onboarding to submitted (packages/db/src/queries/projects.ts:196-203; website/actions.ts:30).
5. Approve is a conditional update from `preview` only; any other state shows "Nothing sent: there is no preview waiting" (projects.ts:204-212; lib/website/notices.ts:14).
6. Team email after approve or revisions is best effort; a missing `BRANDBASKET_TEAM_EMAIL` only logs and the customer still succeeds (lib/server/project-response.ts:26-32,41-46).
7. Feedback body: trimmed, at least 10 characters, must contain a letter or digit, at most 5000; screenshots are UUIDs, no duplicates, at most 3 (lib/website/feedback.ts:21-26; packages/shared/src/lib/support.ts:7).
8. Messages in `parsePreviewFeedback` are customer-facing verbatim, e.g. "Tell us what to change, in at least 10 characters." (lib/website/feedback.ts:15-16).
9. `submissionKey` is a fresh `randomUUID()` per page render, so a double press makes one ticket (website/page.tsx:103; preview-card.tsx:31).
10. Ticket is saved FIRST; a retry with the same key finds it (`created=false`) so no second team alert or customer email, then the link insert is `onConflictDoNothing`, then only the move to Revisions repeats (website/actions.ts:44-48,74-91; packages/db/src/queries/project-feedback.ts:16; packages/db/src/queries/support.ts:101-108).
11. Same key with a different payload throws "already used for different feedback"; the action maps `SupportQueryError` to "Check what you wrote and your screenshots" (support.ts:106; website/actions.ts:94).
12. Feedback is a plain ticket, category `website_change`, NOT a change request, so it never counts against the month's included edits (website/actions.ts:43-47,65-73).
13. Ticket subject is `Preview feedback, round N: <first sentence>` with N = rounds granted + 1; subject limit is 3 to 120 characters, description 10 to 5000 (lib/website/feedback.ts:37-39; support.ts:94).
14. Support rate limit 5 per 10 minutes and 20 per day, message "Please wait N seconds before sending another request."; `BRANDBASKET_SUPPORT_MODE` can switch creation off (lib/server/support-limits.ts:10-18; lib/support-rollout.ts:1-5; website/actions.ts:52).
15. Round accounting: pre-check `granted >= included` shows "Further changes are quoted first."; the real gate is the same UPDATE with `granted < included`, so two sends cannot take the last round. The race loser still has a ticket plus alert (linked, round recorded) because the ticket is written first (website/actions.ts:60-61,88-93; projects.ts:232).
16. Staff granting a round raises the allowance and re-opens sending; there is no customer path to buy a round (projects.ts:219; lib/website/progress-view.ts:33).
17. Customer confirmation email: skipped for phone-only accounts, never throws, `rounds` shown as `max(included, round)`, ready-by = 2 working days after the day asked (lib/server/preview-changes-email.ts:26,33-36; lib/website/progress-view.ts:90-92).
18. After a send: `revalidatePath("/requests")`, `revalidatePath("/")`, redirect `?response=changes-sent`. Approve does NOT revalidate `/` or `/requests` (website/actions.ts:99-101 vs 37-40).
19. View kind from `projects.status`: null or cancelled = none; onboarding = kickoff (if intake `completedAt` set) else setup; submitted/building = building; on_hold = paused (reason text or a default); preview; revisions = revising; approved; live (lib/website/progress-view.ts:52-86). Do not add a second state machine (plan 61 section 5).
20. `kickoffFirst` comes from `loadIntake` under `quietly` with fallback `false`, so a failed read shows "Finish your setup" instead of "Book your call" (lib/server/website.ts:77).
21. "Due" dates only show while still ahead: first preview from `slaDueAt` for submitted/building; updated preview from the last `revisions` event + 2 working days; planned launch from `launchPlannedOn` (lib/server/website.ts:97-106,127).
22. Live-by date: none while on hold; a staff `launchPlannedOn` overrides; approved = +1 working day from approval; else approve-by = sent/asked + 2 wd, live-by = +1 wd after; fallbacks call start + 7 wd, then onboarding submitted + 7 wd (lib/website/timeline.ts:7-9,80-102).
23. Build step note "We start within 48 hours of the call" only while onboarding/submitted; step 1 starts once the call time has passed (lib/website/timeline.ts:62,150).
24. Version history: a version's outcome is changes sent between it and the next version, or "You approved it" on the newest when approved/live; the newest also reads "You asked for changes" when status is `revisions` even if the ticket read failed; "Live now" only on the newest when live (lib/website/history.ts:57-75).
25. While in revisions an unsent row "Version N+1, ready by <day>" is shown, N = highest sent (lib/website/history.ts:78-82).
26. "Your changes" card shows only the LAST round; `of = max(included, round)`; "Done in Version X" = first version sent after the ask; blank text hidden (lib/website/history.ts:98-111).
27. Preview picture is shown only when it was taken of the project's CURRENT `previewUrl`; address carries `?v=capturedAt`; route returns bare 401/404 and `image/webp`, `private, max-age=31536000, immutable` (lib/server/website.ts:128; (protected)/website/preview-image/route.ts:14-22).
28. Preview links open only when `safeExternalHref` accepts them; host label only for http(s) (lib/website/history.ts:67; lib/website/address.ts:17-25).
29. Recent changes (live only): last 5 website-kind requests, declined and withdrawn left out, statuses mapped to Received / In progress / Done (waiting_on_you counts as In progress); the whole card disappears if the read fails, an empty list says "Nothing yet" (website/page.tsx:82-83; lib/website/history.ts:192-228).
30. Address shown: live hostname, else the free address, never the customer's own domain before it works; details row "Set before launch" when none (lib/website/address.ts:11-14; lib/website/history.ts:118).
31. Address card only for `own-connect` ("One step left for you") and `own-live` ("Connected"); a live site moving to its own domain shows no card (shortcut note) (lib/website/address.ts:43-55).
32. WebsiteFrame shows tabs Overview and Enquiries only once live (components/website/website-frame.tsx:16).
33. "Change it yourself" (Business, Blog) replaces the timeline once live (website/page.tsx:112; lib/website/change-yourself.ts:10-13).
34. Empty state when no project/cancelled: "Ask for a change" linking `/requests/new?kind=website` (website/page.tsx:52-66; lib/website/tabs.ts:20-22).
35. Two stage models exist: `progressView` (cancelled = none) and `projectStageIndex` for Home (cancelled = stage 0 or 1) (lib/project-stages.ts:22-40).

### quietly() in this area (what it hides)
| Where | Label | Fallback | Effect when it fails |
|---|---|---|---|
| lib/server/website.ts:65 | project's history | null | timeline empty (`steps=[]`), call date missing, "due" dates fall back |
| lib/server/website.ts:71 | preview picture | null | frame shows business name instead of the picture |
| lib/server/website.ts:72 | preview versions | [] | "No preview has been sent yet" while one waits; Approve and Ask for changes live on the version row, so they VANISH (components/website/preview-card.tsx:47-49,75) |
| lib/server/website.ts:73 | changes sent | [] | no "Your changes" card; version outcomes lose "asked changes" except via status |
| lib/server/website.ts:77 | first questions | false | setup shown instead of kickoff |
| (protected)/website/page.tsx:83 | recent changes | null | Recent changes card removed |
| components/v2/app-shell.tsx:33 | live website (rail) | true | assumes live, so the Enquiries tab shows |

### Old paths and query params that need a redirect
- `/project` and `/project?response=approved|changes-sent|not-ready` to `/website` (+ `?response`) (project/page.tsx:11-12). In-app links: components/panel/next-step-card.tsx:114,164,176, components/panel/onboarding-summary.tsx:249.
- `/website/pages` to `/website` (pages/page.tsx:5).
- `/website/preview-image` is not in plan 61 section 3; keep the route or move it (image `src` is built from `WEBSITE_PREVIEW_IMAGE_PATH`) (lib/website/tabs.ts:5).
- `/website?response=` must keep working (links built by `websiteNoticeHref`) (lib/website/notices.ts:17-19).
- Other in-app links to `/website`: packages/shared/src/lib/account-panel.ts:88-100, (protected)/onboarding/review/actions.ts:46, components/home/progress-home.tsx:69, packages/shared/src/lib/billing/payment-step.ts:225.
- `/requests/new?kind=website&page=<text>` produced by `askAboutHref` (lib/website/tabs.ts:20-22).

---

## domain

### Old routes
| File | URL | Reads |
|---|---|---|
| (protected)/domain/page.tsx | `/domain` | no query parameters; state from DB only |
| (protected)/onboarding/domain/page.tsx | `/onboarding/domain` (step 04) | none; `snapshot.locked` swaps in a read-only summary (page.tsx:23-34) |
| (protected)/project/actions.ts | n/a | holds `checkDomainAction` used by `/domain` |

### Server actions
| File | Action | Guards, limits, idempotency |
|---|---|---|
| (protected)/domain/actions.ts | `requestOwnDomainAction` | `requireCustomerAccess` (no `hasAccess` check); must be live on a free address; `parseDomainForm`; no rate limit; no key (each submit retires the previous unswitched request and inserts a new one) (actions.ts:20-49; packages/db/src/queries/domain-connect.ts:62-88) |
| (protected)/project/actions.ts | `checkDomainAction` | `requireCustomerAccess`; reads stored domain only; no rate limit (project/actions.ts:18-37) |
| (protected)/onboarding/domain/actions.ts | `saveDomainStep`, `useTemporarySubdomainAction` | `requireCustomerAccess`; `saveOnboardingStep` (onboarding lock); `revalidatePath("/onboarding","layout")`; redirect to next step (actions.ts:34-103) |

### Lib modules
| path | what it decides or does | Test |
|---|---|---|
| lib/domain-page.ts | `domainPageState` (9 values) and `domainSteps` (4-step list) | yes |
| lib/connect-domain-state.ts | `ConnectDomainState` union, `CHECK_FAILED_MESSAGE` | no |
| lib/move-domain-state.ts | `MoveDomainState`, two refusal messages | no |
| lib/server/domain-check.ts | DNS lookups (A + CNAME), resolver `timeout 3000, tries 2`, "nothing there" codes = pending | yes |
| lib/server/domain-alert.ts | team emails `notifyTeamDomainConnected`, `notifyTeamDomainRequested` (best effort) | yes |
| packages/shared/src/lib/onboarding/domain-dns.ts | records to add, status per record, overall status | yes |
| packages/shared/src/lib/onboarding/domain-form.ts | hostname normalise/validate/reserved, free-address helpers, subdomain name rules | yes |
| packages/db/src/queries/domain-connect.ts | `getConnectingDomain`, `requestDomainMove`, `recordDomainDnsCheck`, plus staff `markDomainReadyForDns`, `switchToDomain` | integration (not read) |
| lib/server/onboarding.ts (`getOnboardingSnapshot`) | provides `domain`, `project`, `locked` | yes |

### Components with logic
| path | logic worth porting |
|---|---|
| components/panel/connect-domain-card.tsx | three instructions, copy buttons with `execCommand` fallback, verdict text per `connected/pending/elsewhere`, shows "connected" at once when status is `verifying`, Cloudflare "DNS only" advice (connect-domain-card.tsx:29-48,117-137,148-167) |
| components/panel/move-domain-form.tsx | fields `domain` (maxLength 300) and `ownerConfirmed` checkbox; field-level error marking (move-domain-form.tsx:26-52) |
| components/domain/domain-steps.tsx | done/now/next rendering with sr-only words (domain-steps.tsx:8,24-26) |
| (protected)/domain/page.tsx | one switch from state to section; `connect` row selection (page.tsx:100,137-191) |

### Package functions used
- `@brandbasket/db`: `getConnectingDomain`, `recordDomainDnsCheck`, `requestDomainMove`, `getPrimaryDomain`, `DomainTakenError`, `savePrimaryDomain`, `withTenantScope`.
- `@brandbasket/shared`: `onboarding/domain-dns` (`dnsRecordsFor`, `dnsRecordStatus`, `overallDnsStatus`), `onboarding/domain-form` (`parseDomainForm`, `reservedHostnamesFrom`, `clientSiteBaseDomain`, `isTemporarySubdomain`, `readSubdomainName`, `temporarySubdomainFor`, `suggestSubdomainName`), `site-config`, `safe-link`, `money`.
- `@brandbasket/email`: `createAppEmailTransport`, `domainConnectedEmail`, `domainRequestedEmail`, `emailTeamInboxDefault`; staff side `domainReadyEmail`, `domainMovedEmail`.

### Behaviours a rebuild must keep
1. `DomainPageState` has NINE values, not eight: `none, free-building, free, move-requested, move-connect, own-not-approved, own-getting-ready, own-connect, own-live`. Plan 61 says "8 states" (plan lines 103 and 197); presumably excludes `none`. Build and test all nine (lib/domain-page.ts:16-25).
2. State rules: no domain = none; free address + not live = free-building; live + no move = free; move row in DNS step = move-connect else move-requested; own domain live or `active` = own-live; in DNS step = own-connect; else project `approved` = own-getting-ready, otherwise own-not-approved (lib/domain-page.ts:38-48).
3. DNS step statuses are exactly `awaiting_dns, verifying, misconfigured`; `pending` hides the records (lib/domain-page.ts:36; packages/db/src/queries/domain-connect.ts:120).
4. "moving" row = the not-primary live domain; the connecting query orders non-primary first, so a requested move wins over the current address (domain/page.tsx:91; domain-connect.ts:34-42).
5. Records card shows for `move-connect` (the moving row), `own-connect` and `own-live` (the main domain, kept "in case you need to look again") (domain/page.tsx:100,176-182).
6. Step list is 4 steps; the first step is "Send your domain" for a live free-address customer and "Approve your preview" for one who chose a domain in setup; none for none, free-building, own-live (lib/domain-page.ts:59-100).
7. Check action reads the STORED hostname only (never a form value) so it cannot probe arbitrary names; refuses a free address ("no domain of your own to check") and `pending` ("It isn't time to connect yet") (project/actions.ts:20-26; lib/server/domain-check.ts:30-34).
8. A DNS lookup that fails with ENODATA, ENOTFOUND or ENOENT is "pending", not an error; any other failure shows "We couldn't look that up just now" and is logged with the business id (domain-check.ts:11-20; project/actions.ts:33-35).
9. Records: bare domain or `www.` form gets A `@` to 76.76.21.21 and CNAME `www` to cname.vercel-dns.com; any other subdomain gets one CNAME; second-level suffixes `co|com|org|net|gov|ac|edu|nic|res` + 2 letters count as part of the registrable domain (packages/shared/src/lib/onboarding/domain-dns.ts:9-10,24-49).
10. Status per record: CNAME is connected if it matches the target OR (no CNAME and the A set contains the Vercel IP); A is connected only on the exact IP; no data = pending; overall connected only if all are; any "elsewhere" outranks pending (domain-dns.ts:65-80).
11. Recording the check moves `awaiting_dns|misconfigured` to `verifying` on connected, `verifying` back to `awaiting_dns` when it stops being connected, and to `misconfigured` on elsewhere; domains not in the DNS step are never touched; the write is tied to the hostname that was looked up (domain-connect.ts:165-178).
12. The team is emailed ONLY the first time it becomes connected (`becameConnected`); email failure is logged and swallowed (domain-connect.ts:177; project/actions.ts:31; lib/server/domain-alert.ts:11-19).
13. The check runs for a live site on its own domain too, but only DNS-step rows change status (project/actions.ts:11-17 comment).
14. Request own domain is allowed only when live AND the primary is a free address; rechecked server side whatever the page showed (domain/actions.ts:24-26).
15. Domain parsing: strips scheme, path, `www.`, trailing dot, lowercases; max 253; labels `[a-z0-9-]{1,63}` not starting/ending with `-`; TLD letters or `xn--`; `.localhost` refused; own hosts refused (site, app, APP_ORIGIN, ADMIN_ORIGIN and the free-address base domain); ownership checkbox required (packages/shared/src/lib/onboarding/domain-form.ts:3-6,18-31,101-127; domain/actions.ts:28-34).
16. A taken hostname answers "already connected to another website. Email us" without naming the holder (domain-connect.ts:85; lib/move-domain-state.ts:9).
17. Earlier unswitched move requests are retired (`removedAt`) so there is only ever one; the current address keeps working until staff switch (domain-connect.ts:57-60,72-75).
18. Staff moves: `markDomainReadyForDns` needs project `approved` for a first launch or `live` for a move, and returns `changed:false` on a second press so the customer is not emailed twice; `switchToDomain` needs status `verifying` (domain-connect.ts:135-151,100-117).
19. The "domain ready" email already points customers at `${APP_ORIGIN}/domain` (apps/admin/lib/server/domain-ready.ts:37).
20. Page copy depends on lock: `snapshot.locked` hides "Choose your address" and "Change it in setup" and says email us (domain/page.tsx:117-130,143).
21. "Good to know" cost line is per currency: INR "a few hundred rupees a year", USD "about $10 to $15 a year" (domain/page.tsx:45,197).
22. "Visit your website" button only in `free` and `own-live` with a safe https href (domain/page.tsx:102-107).
23. Free address exists only when `CLIENT_SITE_BASE_DOMAIN` is set (invalid value throws); name 3 to 40 chars, letters/numbers/single hyphens, about 170 reserved names, base domain typed on the end is dropped; reserved platform hosts refused again under the base; taken name says "already taken. Try another name." (domain-form.ts:53-60,129-171; onboarding/domain/actions.ts:71-97).
24. Step 04 stores `ownerConfirmedAt` and revalidates the onboarding layout so the step list ticks (onboarding/domain/actions.ts:52,60).
25. No rate limit on the check; DNS timeout 3 s x 2 tries per lookup, both lookups per record in parallel (project/actions.ts:18; domain-check.ts:23-27,35).

### quietly() in this area
None. Both `/domain` reads and the check are strict; failures bubble to the error boundary.

### Old paths and query params that need a redirect
- `/domain` to `/website/domain` (emails already sent link here: apps/admin/lib/server/domain-ready.ts:37; in-app: components/website/address-card.tsx:16).
- `/onboarding/domain` maps to the checklist item; `/domain` "Choose your address" and "Change it in setup" link to it (domain/page.tsx:127,145).
- `checkDomainAction` currently lives under `/project/actions.ts`; moving it is a code move, not a URL.

---

## blog

### Old routes
| File | URL | Reads |
|---|---|---|
| (protected)/content/page.tsx | `/content` | redirect to `/content/blog` (page.tsx:12) |
| (protected)/content/layout.tsx | frame | `requireWebsiteClient` + `BlogFrame` tabs Posts, Authors, Categories (layout.tsx:6-8; lib/blog/tabs.ts:8-12) |
| (protected)/content/blog/page.tsx | `/content/blog` | none; usage line "X of Y posts used" |
| (protected)/content/blog/new/page.tsx | `/content/blog/new` | title-only create form |
| (protected)/content/blog/[postId]/page.tsx | `/content/blog/:postId` | 404 for missing or other business's post |
| (protected)/content/blog/[postId]/preview/route.ts | `GET /content/blog/:postId/preview` | signs a 30 minute link and redirects to the customer's own site (route.ts:14-27) |
| (protected)/content/blog/settings/page.tsx | `/content/blog/settings` | redirect to `/content/categories` (settings/page.tsx:5) |
| (protected)/content/authors (page, new, [authorId]) | `/content/authors`, `/new`, `/:authorId` | 404 for foreign id |
| (protected)/content/categories (page, new, [categoryId]) | `/content/categories`, `/new`, `/:categoryId` | 404 for foreign id |
| app/app-host/content-media/[mediaId]/route.ts | `GET /content-media/:id` | customer or staff only, else bare 401 (route.ts:22-28) |
| app/api/content-media-uploads/route.ts | `POST /api/content-media-uploads` | raw image body; `X-File-Name` header (route.ts:46-117) |
| app/api/site/posts, posts/preview, media/[mediaId] | machine API for client sites | STAYS in platform |

### Server actions
All call `paidCustomerOrNull()` first (returns "Your blog opens once your plan is paid. You can pay from Billing."), take the business from the session, and check client ids against it. None has a rate limit or idempotency key.
| File | Actions |
|---|---|
| (protected)/content/blog/actions.ts | `createBlogPostAction`, `unlockBlogPostsAction`, `updateBlogPostAction(postId, fields, intent)`, `setCoverImageAction`, `removeCoverImageAction`, `duplicateBlogPostAction`, `publishBlogPostAction`, `unpublishBlogPostAction`, `deleteBlogPostAction` |
| (protected)/content/blog/taxonomy-actions.ts | `createBlogCategoryAction(name)`, `createBlogAuthorByNameAction(name)` (editor inline) |
| (protected)/content/authors/actions.ts | `createAuthorAction`, `saveAuthorAction`, `setAuthorPhotoAction`, `removeAuthorPhotoAction`, `deleteAuthorAction` |
| (protected)/content/categories/actions.ts | `createCategoryAction`, `saveCategoryAction`, `deleteCategoryAction` |

`publishBlogPostAction`, `unpublishBlogPostAction` and `deleteBlogPostAction` let ownership errors propagate (throw) instead of returning "gone" (blog/actions.ts:437-477). `unlockBlogPostsAction` redirects to `/billing` when `paidCustomerOrNull` is null (blog/actions.ts:140-143).

### Lib modules
| path | what it decides or does | Test |
|---|---|---|
| lib/blog-slug.ts | `slugify`, `firstUnusedSlug`, `RESERVED_SLUGS` (`preview`,`category`), `MAX_SLUG_LENGTH` 100, `slugFromInput`, `isSlugTaken` (current or previous), `withPreviousSlug` | yes |
| lib/post-path.ts | one "Web address" box: `prefix/slug` or root `slug`; reserved prefixes/root names; `storedPostPath` falls back to `blog` | yes |
| lib/blog-seo.ts | `resolveSeo` defaults; `META_TITLE_MAX_LENGTH` 70, `META_DESCRIPTION_MAX_LENGTH` 160; `truncateAtWord` | yes |
| lib/blog-seo-health.ts | 9 checks, score = share passed, grade good >= 80, fair >= 50 | yes |
| lib/blog-publish-state.ts | draft / scheduled (published with future date) / published | yes |
| lib/blog-editor-fields.ts | editor field model, "Auto" search fields stored as blank, datetime-local to ISO | yes |
| lib/blog-author-fields.ts | name 60, role 80, bio 160, five link kinds | yes |
| lib/author-links.ts | adds `https://` when missing, http(s) only, host needs a dot, max 300, no spaces | yes |
| lib/blog-category-fields.ts | name 60, description 300, meta title 200, `slugTyped` vs auto, `slugFollowsName` | yes |
| lib/blog-text-stats.ts | words, reading time at 200 wpm | yes |
| lib/blog-html.ts, lib/blog-text.ts | Lexical to safe HTML / plain text / outline; closed grammar; http(s) links only; heading ids | html yes, text.ts no |
| lib/blog/tabs.ts | `BLOG_PATH` etc. (old paths hard coded) | no |
| lib/server/blog.ts | post read/shape, `requireOwnedBlogPost`, list limit 200, `BLOG_PAYMENT_REQUIRED_MESSAGE` | no |
| lib/server/blog-access.ts | `paidCustomerOrNull`, `PAID_PLAN_REQUIRED_MESSAGE` | yes |
| lib/server/blog-allowance.ts | `getBlogUsage`, `isAtBlogLimit` (used >= allowance), next block price with tax | no |
| lib/server/blog-taxonomy.ts | owned lookups, per-author/category published and draft counts | no |
| lib/server/blog-preview-token.ts | HMAC token `claims.sig`, TTL 30 min, key derived with context `brandbasket:blog-preview:v1` | yes |
| lib/server/blog-preview-link.ts | preview URL on the client site `/blog/preview?token=` | no |
| lib/server/blog-preview-request.ts | machine endpoint: site bearer token + preview token must name the same business | yes |
| lib/server/charges.ts (`customerBlogAllowance`, `openBlogUnlock`, `startCustomerChargePayment`) | allowance = included + block size x paid blocks; unlock opens one charge | yes |
| lib/server/charge-redirect.ts | where a started charge goes (Razorpay page or notice) | no |
| lib/changelog.ts:27 | STALE copy "with no limit on how often" about blog posts | n/a |
| lib/uploads/content-media-upload-client.ts | browser resize then POST to the route; 413 fallback message | no |
| packages/cms (`@brandbasket/cms`) | `buildCmsConfig`, `toRelationId`, collections `BlogPosts`, `BlogAuthors`, `BlogCategories`, `Media`, `Tenants`, `syncTenantForBusiness` | tenant-sync yes |
| lib/server/payload-media-serving.ts | reads Payload media from local disk; `sharing` public / preview variants | yes |

### Components with logic
| path | logic worth porting |
|---|---|
| components/panel/blog-editor/blog-post-editor.tsx | dirty tracking, `beforeunload` guard, Ctrl/Cmd+S saves without changing status, Save/Publish/Schedule labels by state, title required to enable buttons, server data merged only if untouched, duplicate/delete `confirm`s (blog-post-editor.tsx:28,87-140,143-146,425-429) |
| components/panel/blog-editor/cover-image-field.tsx | client check JPEG/PNG/WEBP and 4 MB, upload then attach, alt text cleared on remove (cover-image-field.tsx:44-70) |
| components/panel/blog-editor/search-panel.tsx, parts.tsx | SEO health display, Auto toggles, counters (not read in detail) |
| components/panel/blog-editor/author-editor.tsx, category-editor.tsx | same save/photo/delete flows (not read in detail) |
| components/panel/rich-text-editor.tsx | Lexical editor; only these nodes survive `lexicalToHtml` |

### Package functions used
- `@brandbasket/cms`: `toRelationId`, `buildCmsConfig`, `syncTenantForBusiness`. Payload Local API `getPayload({config})` with `overrideAccess: true` (collections deny all REST) (packages/cms/src/collections/BlogPosts.ts:14).
- `@brandbasket/db`: `countPaidBlogBlocks`, `openBlogPostsCharge`, `findBusinessWebsiteUrl`, `withTenantScope`.
- `@brandbasket/shared`: `billing/charges` (`blogAllowance`, `chargeAmountCents`), `money.formatMoney`, `validation/text` (`cleanLine`, `cleanMultiline`), `uploads/limits`, `server/read-limited-body`, `uploads/file-name`.
- `@brandbasket/email`: `escapeHtml` (blog-html).

### Behaviours a rebuild must keep
1. Allowance = plan `includedBlogPosts` (default 100) + `blogPostBlockSize` (default 100) x paid blocks; a block is sold at the plan's `extraBlogPostsAmountCents` (pricing defaults US$5 or INR 475 per block, the plan row is the source of truth) and shown with tax via `formatMoney(chargeAmountCents(...))` (packages/shared/src/lib/billing/charges.ts:14-17; packages/db/src/schema/billing.ts:120-121; packages/shared/src/lib/pricing.ts:64-66,80; lib/server/blog-allowance.ts:37-42).
2. Every post counts, drafts included; deleting frees the slot (lib/server/blog-allowance.ts:18-26).
3. The limit is enforced in `createBlogPostAction` and `duplicateBlogPostAction`, not only by hiding the button; two simultaneous creates can pass the limit by one (no cross-DB lock) (blog/actions.ts:101-110,397-403).
4. Over the limit, create says "You've used all N of your blog posts. Unlock M more from your blog page."; the list shows "X of Y posts used" and an Unlock button with price instead of New post (blog/actions.ts:106-109; blog/page.tsx:51-67).
5. `unlockBlogPostsAction` only works when at the limit; otherwise back to the list; it opens (or reuses) ONE open `blog_posts` charge (partial unique index: a double click reuses it), then goes to payment; posts unlock when payment is recorded, never before (blog/actions.ts:140-148; packages/db/src/queries/charges.ts:142-157,286-292; lib/server/charges.ts:240-266).
6. No plan = `getBlogUsage` null = no limit applied (create allowed) (lib/server/blog-allowance.ts:31; blog/actions.ts:105).
7. STALE COPY to fix: the changelog says posts can be written "with no limit on how often" (lib/changelog.ts:27).
8. Create: title cleaned to one line, max 200; empty title "Give the post a title."; slug from title via `slugify`; empty slug "That title doesn't make a usable web address"; slug made unique per business with `-2`, `-3`... after `RESERVED_SLUGS`; new post is a draft with an empty Lexical body (blog/actions.ts:39,52-61,112-131; lib/blog-slug.ts:29).
9. Uniqueness is NOT enforced in the database; two posts in the same instant can collide (blog/actions.ts:67-71; packages/cms/src/collections/BlogPosts.ts:18).
10. Save limits: title 200, excerpt 400, meta title 200, meta description 160, cover alt 250, body JSON 200,000 chars; body must parse and contain `root` (blog/actions.ts:39-47,260-282).
11. Address box: `prefix/slug`, `slug` (root) or blank (`blog/<from title>`); at most one `/`; prefix max 40, `[a-z0-9]+(-[a-z0-9]+)*`; reserved prefixes `api, category, preview, sitemap, robots`; reserved root names `blog, api, sitemap, robots, about, contact, services, gallery, pricing, privacy, terms`; slug cut at a word at 100 chars (lib/post-path.ts:13-72; lib/blog-slug.ts:32-52).
12. Changing an address keeps the old one: `previousSlugs` is appended so client sites redirect; another post's current OR previous slug blocks reuse (blog/actions.ts:289-291,329; lib/blog-slug.ts:55-66). Categories have NO previous slugs: the old address stops working (categories/actions.ts:73-77).
13. Publish: `intent` publish/unpublish happens in the SAME write as save so the live version equals the screen; published date = typed date, else existing, else now; a future date means scheduled; clearing the date on a published post keeps it; drafts keep whatever is typed (blog/actions.ts:238-250,305-309).
14. Scheduled = status published with future `publishedAt`; the public API leaves it out until then; the date must be a real instant else "That publish date isn't a real date" (lib/blog-publish-state.ts:7-14; blog/actions.ts:218-223,268-269; lib/server/site-api.ts:77-90).
15. `publishBlogPostAction` (button-less path) keeps an existing date (blog/actions.ts:437-451). Unpublish sets draft only and keeps the date.
16. Category and author ids sent by the client are verified to belong to the business; mismatch gives "That category or author no longer exists. Reload the page." (blog/actions.ts:202-213,293-303).
17. Cover image: the media row must carry the same `businessId` else "That upload could not be found. Try again."; remove clears image AND alt; the file remains in uploads (blog/actions.ts:343-386). Cover alt is NOT required, only an SEO health check "Cover image has alt text" (lib/blog-seo-health.ts:59-60).
18. Upload route checks: Host must be the app surface (else 404), Origin must be the app (else 403), `Content-Length` required (400) and at most 4 MB (413), session (401), `hasAccess && hasWebsite` (402), type JPEG/PNG/WEBP (415), streamed body capped again, empty file 422, create failure 422; returns 201 `{media:{id}}` (app/api/content-media-uploads/route.ts:46-116; packages/shared/src/lib/uploads/limits.ts:6-12). No hourly rate limit here (unlike `/api/uploads`).
19. Browser resizes before upload (`prepareImageForUpload(file,"photo")`) and rejects if still over 4 MB (lib/uploads/content-media-upload-client.ts:39-41).
20. Duplicate: copies content and settings, title gets " (copy)", fresh unique slug, always a DRAFT, drops meta title, previous slugs, status and date; counts toward the allowance (blog/actions.ts:388-431).
21. SEO health = share of 9 checks passed: search title 30 to 70, description 70 to 160, at least 300 words, has subheadings, cover image, cover alt, slug at most 60, has category, not "Hide from Google"; grade good >= 80, fair >= 50 (lib/blog-seo-health.ts:9-13,43-77).
22. `resolveSeo` defaults: title = meta title or post title; description = meta description, else excerpt, else body text cut at a word to 160 (lib/blog-seo.ts:40-49).
23. Preview-on-my-site: the GET route requires `requireCustomerAccess` only (not website access), redirects to the list for a foreign post, back to the editor when no website URL; token TTL 30 min; HMAC with timing-safe compare; the machine check needs the site bearer token AND a matching business, one generic 404 message, headers `no-store` and `noindex` (route.ts:14-27; lib/server/blog-preview-token.ts:13,58-75; blog-preview-request.ts:51,60-72).
24. A draft's cover and author photo carry the preview token as `?preview=` so they load before publish (blog-preview-request.ts:5-19).
25. Editor shows "Shows your last saved version. Save first" on the preview button when dirty; `beforeunload` warns on unsaved changes (blog-post-editor.tsx:384,138-140).
26. The posts list reads at most 200 posts, newest edited first (lib/server/blog.ts:226); author/category counts read all posts (no limit) (lib/server/blog-taxonomy.ts:167-178).
27. `getBlogPost` swallows EVERY read error as "not found" (lib/server/blog.ts:250-252).
28. Categories: name max 60, description 300, unique case-insensitively; auto address follows the name with numbering; a TYPED address that clashes is refused, not renumbered; inline "New category" returns the existing one for a same name (categories/actions.ts:30-32,89-98,106; taxonomy-actions.ts:70-73).
29. Authors: may share names; name 60, role 80, bio 160; five optional links normalised to http(s); deleting an author or category keeps posts (set null) (lib/blog-author-fields.ts:8-10,40-47; authors/actions.ts:112).
30. Media access: `/content-media/:id` needs a customer or staff session, a customer sees only their own businessId, 404 otherwise; `Cache-Control: private, no-cache`; site API variants public (5 min) or preview (`no-store`) (app/app-host/content-media/[mediaId]/route.ts:22-28; lib/server/payload-media-serving.ts:84-100).
31. Payload collections deny all REST access; everything uses the Local API with `overrideAccess` (packages/cms/src/collections/Media.ts:58-61).
32. `refresh()` is called after writes; there is no `revalidatePath` (blog/actions.ts:333).

### quietly() and hidden errors in this area
No `quietly` calls. Silent catches that hide errors: `getBlogPost` (lib/server/blog.ts:250), `getBlogCategory`/`getBlogAuthor` (lib/server/blog-taxonomy.ts:260,290), `setCoverImageAction` media lookup (blog/actions.ts:354), `setAuthorPhotoAction` (authors/actions.ts:85), `categories/[categoryId]/page.tsx:17`.

### Old paths and query params that need a redirect
- `/content` to `/website/blog`; `/content/blog` to `/website/blog`; `/content/blog/new`; `/content/blog/:postId`; `/content/blog/:postId/preview` (target=_blank link from the editor); `/content/blog/settings` (already redirects to `/content/categories`); `/content/authors`, `/new`, `/:id`; `/content/categories`, `/new`, `/:id` (plan 61 section 3 lines 104-105 and "Dead and dropped").
- In-app links: components/panel/next-step-card.tsx:140 (`/content/blog`), blog tables and editors (blog-posts-table.tsx:122, authors-table.tsx:75, categories-table.tsx:69, author-editor.tsx:190, category-editor.tsx:115, blog-post-editor.tsx:350), lib/website/change-yourself.ts:12 via `BLOG_PATH`.
- `/content-media/:id` and `/api/content-media-uploads` are asset/API paths; keep or re-point.

---

## business profile

### Old routes
| File | URL | Reads |
|---|---|---|
| (protected)/details/page.tsx | `/details` | none; sections by id `contact`, `announcement`, holidays (own panel), `hours`, `assets` (page.tsx:78-118) |
| app/api/uploads/route.ts | `POST /api/uploads?purpose=logo\|photo` | onboarding uploads (needs onboarding open) |
| app/api/brand-assets/route.ts | `POST /api/brand-assets?purpose=logo\|photo` | Business page uploads (route.ts:16-25) |
| app/api/product-photos/route.ts | `POST /api/product-photos?product=<uuid>` | DORMANT (owner-added directory listings) |
| app/api/content-media-uploads/route.ts | blog cover images | see blog |
| app/app-host/media/[mediaId]/route.ts | `GET /media/:id` | customer image, bare 401 without session; billing not read (route.ts:12-20) |
| app/app-host/product-photos/[photoId]/route.ts | `GET /product-photos/:id` | DORMANT |
| app/app-host/listing-pictures/[pictureId]/route.ts | `GET /listing-pictures/:id` | DORMANT |
| app/app-host/deliverable-images/[deliverableId]/route.ts | `GET /deliverable-images/:id` | social post pictures (see social) |

### Server actions
| File | Action | Guards, limits |
|---|---|---|
| (protected)/details/actions.ts | `saveContactAction` | `requireCustomerAccess`, `billing.hasAccess` (any plan) (actions.ts:41-43) |
| same | `saveHoursAction`, `saveAnnouncementAction`, `clearAnnouncementAction` | `paidCustomerOrNull` (needs the website) |
| same | `addClosureAction`, `deleteClosureAction` | `holidayAccessOrNull` (listing accounts allowed, others need paid website) (lib/server/holiday-access.ts:11-17) |
| (protected)/details/brand-actions.ts | `removeBrandAssetAction(mediaId)` | `requireCustomerAccess` only, no billing check (brand-actions.ts:11) |

No idempotency keys. Uploads: hourly cap below. All catch blocks log, call `reportUnexpectedPanelError`, and return an unexpected-error state.

### Lib modules
| path | what it decides or does | Test |
|---|---|---|
| lib/onboarding/business-form.ts | `parseContactForm`, `parseHoursForm`, `parseBusinessForm` (all field limits) | yes |
| lib/onboarding/brand-form.ts | `parseBrandForm`: every saved photo needs an alt description 1 to 250 chars; at least a logo or one photo | yes |
| packages/shared/src/lib/business-facts/forms.ts | `parseAnnouncementForm`, `parseClosureForm` | yes |
| packages/shared/src/lib/business-facts/announcement.ts, closures.ts | `ANNOUNCEMENT_MAX_LENGTH` 100, `CLOSURE_NOTE_MAX_LENGTH` 80, `upcomingClosures`, `closureOn` | yes |
| packages/shared/src/lib/onboarding/hours.ts, business-fields.ts | day modes unset/open/closed/all-day, `toStoredHours` | hours yes |
| lib/server/brand-assets.ts | `loadBrandAssets`: logo = newest logo, photos list; throws on failure | no |
| lib/server/onboarding-media.ts | `storeBrandImage`/`storeOnboardingImage`, `removeBrandImage`, `consumeUploadAllowance` 60 per hour | yes |
| lib/server/upload-request.ts | ordered request checks for every image upload route | yes |
| lib/server/holiday-access.ts | who may edit holidays | yes |
| lib/appointments/closure-clashes.ts, leave-added-state.ts | clinic-only: bookings that fall on a new closure | clashes yes, state no |
| lib/details/form-snapshot.ts | dirty detection for the SaveBar | yes |
| lib/business-profile-fields.ts | vocabulary for the DORMANT directory profile (contact buttons, payment methods, catalog limits) | no |
| lib/photos-view.ts, lib/server/listing-pictures.ts, product-photos.ts, product-photo-request.ts | DORMANT listing pictures and product photos (no page renders them) | listing-pictures, product-photo-request, product-photos yes; photos-view no |
| lib/uploads/upload-client.ts | browser upload helper, routes `/api/uploads`, `/api/brand-assets`, `/api/listing-pictures` | yes |
| packages/shared/src/lib/uploads/limits.ts, prepare-image.ts, send-image.ts, resize-plan.ts, file-name.ts | type and size rules, browser shrink | resize-plan, file-name yes |
| packages/shared/src/server/media-upload.ts, media-storage.ts, media-serving.ts, media-keys.ts | server re-encode, storage, serving headers | yes |
| packages/db/src/queries/media.ts | `recordBrandAsset`, `removeBrandAsset`, `listMediaAssets`, `updateMediaAltText` | integration (not read) |
| packages/db/src/queries/business-facts.ts | closures, announcement, hours queries | integration (not read) |
| lib/server/live-preview.ts + lib/preview-link.ts, preview-origins.ts, preview-draft.ts + components/panel/live-preview/live-preview-layout.tsx | live preview of the directory page, only if the business has a directory listing | see website |

### Components with logic
| path | logic worth porting |
|---|---|
| components/panel/details/brand-assets-panel.tsx | up to MAX_PHOTOS=20 (slots = 20 minus stored), extra files get a per-file message, logo one at a time, uploads sequential then `router.refresh()`; remove then refresh; NO alt text field (brand-assets-panel.tsx:50-75,98-118) |
| components/panel/details/closures-panel.tsx | holiday form with `kind=closed|hours` and focus after removal (not read in detail) |
| components/panel/details/hours-panel.tsx | week editor with modes; field names `hours.{day}.mode|opens|closes` (lib/onboarding/business-form.ts:93-102) |
| components/panel/details/contact-panel.tsx, announcement-panel.tsx, save-button.tsx, use-form-changed.ts | save-bar dirty logic (form-snapshot) |
| components/panel/media-thumbnail.tsx | image display with alt |

### Package functions used
- `@brandbasket/db`: `getBusinessProfile`, `getOwnerContact`, `saveBusinessContact`, `findBusinessTimeZone`, `getBusinessHours`, `replaceOpeningHours`, `listClosures`, `addClosure`, `deleteClosure`, `findAnnouncement`, `saveAnnouncement`, `clearAnnouncement`, `findOwnListing`, `listEnabledModules`, `listAppointmentsForDates`, `listMediaAssets`, `recordBrandAsset`, `removeBrandAsset`, `consumeRateLimit`, `findOpenProject`, `PhotoLimitReachedError`, `OnboardingLockedError`.
- `@brandbasket/shared`: `calendar/local-date`, `business-facts/*`, `onboarding/hours`, `phone-countries`, `phone-defaults`, `validation/phone|contact|text`, `uploads/*`, `server/media-*`, `server/read-limited-body`.

### Behaviours a rebuild must keep
1. Contact details (name, phone, email, address lines, city, region, postal code, country, areas served) are saveable by ANY paying customer on any plan; hours, holidays and announcement need Managed Website (details/page.tsx:82; actions.ts:41-43,64-65,84-85).
2. Contact limits: name 1 to 120, address lines 120, city/region 80, postal code 20, country 80, areas served 300; blank becomes null; every contact field is written so a blank clears it; phone and email use shared validators (lib/onboarding/business-form.ts:131-153; packages/db/src/queries/onboarding-data.ts:214-241).
3. Tagline, description and Google link are NOT editable here, only in onboarding (business-form.ts:199-210).
4. First paint with no saved profile offers the owner's sign-up phone/email; phone shows in its own country layout, else the visitor's country guess (details/page.tsx:46-47,60-62).
5. Opening hours: each day one of unset, open, closed, all-day; "open" needs HH:MM times, opens must differ from closes ("choose Open 24 hours"); closes before opens means after midnight; unset days are not stored; save is delete-all-then-insert under an advisory lock keyed `business_hours:<id>` (business-form.ts:41,50-77; packages/db/src/queries/business-facts.ts:151-168).
6. Announcement: one line, 1 to 100 chars, line breaks refused on the RAW value, start and end dates required, end not before start; one row per business, upsert; defaults today to today + 2 days (packages/shared/src/lib/business-facts/forms.ts:14-43; announcement.ts:2; details/page.tsx:29,89-90).
7. Clear announcement reads nothing from the form (actions.ts:102-117).
8. Closures ("Holidays"): start/end required, end not before start, note at most 80 chars and single line, optional `kind=hours` with opens and closes (differing); stored `opensAt/closesAt` both or neither (forms.ts:56-85; closures.ts:2).
9. A closure whose last day is already past (in the BUSINESS time zone, read in the same transaction as the write) is refused: "Choose dates from today onwards." (actions.ts:134-137; errors.ts:10).
10. Delete closure validates a UUID, deletes only that tenant's row, and a row already gone still revalidates the page and says "That closure could not be found. Reload the page." (actions.ts:155-173).
11. The page only lists closures that have not ended (`upcomingClosures`) (details/page.tsx:98; closures.ts:16-18).
12. Clinic-only: adding a closure over booked appointments still saves and returns the clashing bookings; only for businesses with the `appointments` module; only status `booked` counts (actions.ts:139-142; lib/appointments/closure-clashes.ts:22-30). Dormant per plan, but do not regress.
13. After every save `revalidatePath("/details")`; the lede says hours/holidays/announcement "update your website in about a minute" (actions.ts:56; details/page.tsx:123).
14. Image upload checks, IN ORDER: Host is the app and Origin is the app (403), `Content-Length` present (411), numeric (400), at most 4 MB (413), `purpose` logo|photo (400), session (401), onboarding open (409, onboarding route only), decode capacity (503 + Retry-After 10 s) BEFORE spending the budget, hourly budget (429 + Retry-After), body read with a byte counter (413), then process (lib/server/upload-request.ts:19-42,96-161; packages/shared/src/server/media-upload.ts:24-25).
15. Hourly upload budget is 60 per business per hour, spent by every attempt that gets that far; message "Try again in N minute(s)" (lib/server/onboarding-media.ts:26,97-105).
16. The server accepts by file SIGNATURE (JPEG, PNG, WebP), not declared type; max 100 million input pixels; resized to fit 2400 px; re-encoded WebP quality 82 (EXIF orientation applied, all metadata incl. GPS dropped); at most 2 decodes at once and 8 waiting (packages/shared/src/server/media-upload.ts:10-22,99-108,128-137,149-169; limits.ts:6-12).
17. Browser shrinks first; iPhone HEIC is converted by the browser only when not listed in accept; SVG and other files go to the team via `/requests/new?intent=send_info` (brand-assets-panel.tsx:21-22,112-116; packages/shared/src/lib/uploads/prepare-image.ts:40).
18. Maximum 20 photos per business, whoever adds them; enforced under a per-business advisory lock `brand-assets:<id>` so two uploads cannot both take slot 20; message "You can add up to 20 photos. Remove one to add another." (packages/shared/src/lib/uploads/limits.ts:16; packages/db/src/queries/media.ts:224-239; onboarding-media.ts:28,170-172).
19. A new logo replaces the old one in the same transaction and the old file is deleted after commit; if the insert fails the new file is deleted so no row points at a missing file and no file is orphaned (onboarding-media.ts:107-111,142-176).
20. Remove: the row is soft-deleted then the file is deleted after commit; unknown id says "That image has already been removed. Reload the page to see the latest." (onboarding-media.ts:180-203).
21. ALT TEXT: required ONLY in onboarding step 03 (1 to 250 chars per saved photo, message "Describe this photo for people who can't see it.") (lib/onboarding/brand-form.ts:6,28-36). On the Business page a new photo is stored with `altText: null`, there is no field to add it, and the panel says the team adds one; display falls back to "Photo N" (onboarding-media.ts:159; brand-assets-panel.tsx:44-45,102). Plan 61 section 5 says "alt text required on photos": that is NOT true of today's Business page, so decide and build it.
22. The logo/photo list throws if unreadable so the page errors instead of showing an empty library (lib/server/brand-assets.ts:22).
23. Images are served by id with `Cache-Control: private, no-cache`, ETag = sha256, 304 support, `nosniff`, `Content-Disposition: inline`; no billing check, only a business session (packages/shared/src/server/media-serving.ts:22-34,70-94; app/app-host/media/[mediaId]/route.ts:7-11).
24. The brand upload route does not check billing: any signed-in business member can upload (app/api/brand-assets/route.ts:16-25), and `removeBrandAssetAction` needs only `requireCustomerAccess` (brand-actions.ts:11).
25. Free "listing" accounts: `holidayAccessOrNull` lets them edit holidays; `/details` calls `requireCustomerAccess()` without `listingAccount: "allow"` while `LISTING_ACCOUNT_HOME` is `/details` (looks like a redirect loop for `kind=listing`, unverified at runtime; dormant) (lib/server/holiday-access.ts:11-17; (protected)/details/page.tsx:38; lib/server/customer-access.ts:58-64,94-99).
26. Live preview beside the form appears only for Managed Website customers who have a directory listing with a place id AND a `LEADS_API_TOKEN` of minimum length; the link lasts 4 hours (HMAC); frame origins include the `www` twin (details/page.tsx:124-130; lib/server/live-preview.ts:21-26; lib/preview-link.ts:12-23; lib/preview-origins.ts:9-17).
27. Product photos and listing pictures: each upload is cut to an exact slot size and gets smaller copies; routes need a listing or return 409 "Pictures can't be added to this business" (dormant, not rebuilt) (lib/server/product-photos.ts:36-81; lib/server/product-photo-request.ts:63; lib/photos-view.ts:11).

### quietly() in this area
None on `/details`. Reads are strict (`withTenantScope`), errors reach the error boundary; `loading.tsx` exists.

### Old paths and query params that need a redirect
- `/details` to `/business`; brand section to `/business/brand`; anchors used inside the page: `#contact`, `#announcement`, `#hours`, `#assets` (and the holidays panel's own id) (details/page.tsx:78-118).
- In-app links: lib/rail.ts:55 (`BUSINESS_HREF`), lib/website/change-yourself.ts:11, lib/server/customer-access.ts:58 (`LISTING_PAGE_PATH`).
- Image/asset URLs embedded in pages: `/media/:id`, `/deliverable-images/:id`, `/product-photos/:id`, `/listing-pictures/:id`, `/content-media/:id`; upload endpoints `/api/uploads`, `/api/brand-assets`, `/api/product-photos`, `/api/content-media-uploads` (browser code posts to them, keep stable or change together).
- Outgoing: `/requests/new?intent=send_info` (brand-assets-panel.tsx:113).

---

## social

### Old routes
| File | URL | Reads |
|---|---|---|
| (protected)/social/page.tsx | `/social` | `?notice=` one of `approved`, `changed`, `failed` (lib/social/notices.ts:10-13; page.tsx:14-23) |
| app/app-host/deliverable-images/[deliverableId]/route.ts | `GET /deliverable-images/:id` | UUID or 404; bare 401 without business; billing not read (route.ts:18-25) |

### Server actions
| File | Action | Guards, limits, idempotency |
|---|---|---|
| (protected)/social/actions.ts | `approvePostsAction(formData)` | `requireBillingAccess` (NOT "bought social"); ids = unique set of `ids`, UUIDs, 1 to 50; no rate limit; no key; idempotent because the DB function approves only posts still awaiting approval (actions.ts:11-12,19-27; packages/db/src/queries/deliverables.ts:92-103) |

### Lib modules
| path | what it decides or does | Test |
|---|---|---|
| lib/server/social.ts | `loadSocial` (null if not bought), `loadWaitingPostCount` for Home | no |
| lib/social/week.ts | `postWindow`, `weekBounds`, `splitPosts`, `waitingHeadline`, `approveAllLabel`, `monthLine`, `needsOkBy` | yes |
| lib/social/ads.ts | `adsPanel`: spent / budget, percent clamp 0 to 100, enquiries, ad money; null when every figure is unknown | yes |
| lib/social/notices.ts | three notice lines | yes |
| lib/overview.ts (`monthKey`, `monthName`, `SnapshotView`) | India month math | yes |
| lib/setup-asks.ts, lib/server/todo.ts | "what we need from you" card, shared with the setup agent | n/a |
| lib/requests/links.ts | `requestChangeHref` = `/requests/new?kind=social&about=<postId>` | n/a |

### Components with logic
| path | logic worth porting |
|---|---|
| components/social/approve-bar.tsx | one hidden `ids` input per shown post, so exactly the posts on screen are approved; sticky above the tab bar on phones; "Nothing goes out until you approve it." |
| components/social/post-card.tsx | square image from `/deliverable-images/:id` or title card, due label, "x of n" on phones, Change link |
| components/social/social-view.tsx | monthly report button only if URL starts `https://`; waiting posts as scroll-snap cards; ads section from `adsPanel`; empty state with "Ask for a change" |
| components/social/week-list.tsx | this week's posts (markup) |

### Package functions used
- `@brandbasket/db`: `listBoughtSetupServices`, `listDeliverablesForBusiness`, `listWaitingPosts`, `listMonthlySnapshots`, `latestMonthlyReport`, `approveDeliverables`, `findDeliverableForBusiness`, `DeliverableError`.
- `@brandbasket/shared`: `calendar/local-date` (`addDays`, `localDateIn`, `mondayOf`), `money.formatMoney`, `server/media-serving.storedMediaResponse`, `server/media-storage`, `billing/add-ons.ADD_ONS_PATH` (= `/services`).

### Behaviours a rebuild must keep
1. Page needs `hasAccess` else Home; "not bought" (`social` not in `listBoughtSetupServices`) redirects to `/services` (social/page.tsx:20-25; packages/shared/src/lib/billing/add-ons.ts:14).
2. Window loaded: this India month, stretched to the end of the week when that week runs into next month; any post awaiting approval is loaded whatever its date (lib/social/week.ts:49-55; packages/db/src/queries/deliverables.ts:41-57).
3. A row without `dueOn` or not `kind=post` is dropped from the page (lib/server/social.ts:24-30).
4. "Waiting" = all posts with status `awaiting_approval`, earliest due first (ties by id); "This week" = posts due Mon to Sun India week, any status (lib/social/week.ts:57-66).
5. Headline: "1 post needs your OK by Tue 1 Dec" / "N posts need your OK by..." / "No posts are waiting for you."; button "Approve" for one, "Approve all N" otherwise (lib/social/week.ts:32-40).
6. Approve sends only the shown ids; the DB function approves those that are posts of this business awaiting approval and returns the count; fewer than shown = notice `changed` ("Some posts changed while you were looking"), equal = `approved`, error = `failed` (actions.ts:26-27,31-33; lib/social/notices.ts:4-6).
7. Limits: 1 to 50 ids (DB check 23514 "Approve between 1 and 50 posts at a time"); 42501 maps to `notFound()` (deliverables.ts:98-100; actions.ts:30).
8. Approve revalidates `/social` and `/`, then redirects `/social?notice=...` (actions.ts:34-36).
9. Approve needs only billing access; it does NOT check the Social service was bought, the DB scope is the only guard (actions.ts:20).
10. Ads panel: spent as "X of Y" when a budget exists, else just spent; percent = round(spend/budget) clamped 0..100; budget 0 hides percent; ad money (subscription `adCreditCents`) shown when > 0; the whole panel is omitted, never zeros, when nothing is known (lib/social/ads.ts:13-25).
11. Month line "November: 12 of 14 posts out." from posts due in the month with status `published`; null when none (lib/social/week.ts:87-93).
12. Dates are noon India (+05:30) so no zone shifts the day; `shortDay` labels (lib/social/week.ts:16-24).
13. The monthly report button comes from `monthly_reports.url` (staff paste, `https://` only, max 500) (packages/db/migrations/0193_social_search.sql:48; components/social/social-view.tsx:63).
14. The picture route returns 404 for another business, missing image, bad UUID, and a bare 401 without a session; the response is the stored image with ETag/304 (deliverable-images route.ts:20-25).
15. Home "Needs you" uses `loadWaitingPostCount`, to be called through quietly (lib/server/social.ts:59-64).
16. Posts cannot be edited by the customer; only "Change" opens a request with `about=<postId>` (components/social/post-card.tsx:38; lib/requests/links.ts:26-28).
17. The sticky approve bar offset equals the phone tab bar (3.75rem + safe area) (approve-bar.tsx:28).

### quietly() in this area (what it hides)
| Where | Label | Fallback | Effect |
|---|---|---|---|
| lib/server/social.ts:43 | the posts | [] | posts vanish: page shows "No posts are waiting for you" while some may wait |
| lib/server/social.ts:46 | the ads numbers | [] | ads section disappears |
| lib/server/social.ts:47 | the monthly report | null | report button disappears |

`loadTodo` (setup asks) is NOT wrapped, so its failure breaks the page (social/page.tsx:23).

### Old paths and query params that need a redirect
- `/social?notice=approved|changed|failed` to the new Social route (the approve action redirects here) (actions.ts:22,36).
- Not-bought redirect target `/services` (existing `/add-ons` to `/services` permanent redirect in next.config.ts:64).
- `/requests/new?kind=social&about=<postId>` and `?kind=social` (lib/requests/links.ts:26-28; components/social/social-view.tsx:91).
- `/deliverable-images/:id` image URLs.
- Rail/Home links `/social` (lib/rail.ts:58).

---

## search

### Old routes
| File | URL | Reads |
|---|---|---|
| (protected)/search/page.tsx | `/search` | no query parameters |

### Server actions
None. (The report link is a staff-pasted URL; "Ask for a change" links to `/requests/new?kind=search`.)

### Lib modules
| path | what it decides or does | Test |
|---|---|---|
| lib/server/search.ts | `loadSearch` (null if not bought), pages and listings from `deliverables`, numbers from `monthly_snapshots`, link from `monthly_reports` | no (page test mocks it) |
| lib/search/summary.ts | `searchSummary`: pages/listings finished this month, `pageOne` figure and "Up from N" / "Down from N" / "Same as last month" | yes |
| lib/social/week.ts (`postWindow`), lib/overview.ts (`monthKey`, `monthName`) | shared window and month | yes |

### Components with logic
| path | logic worth porting |
|---|---|
| components/search/search-view.tsx | `httpsUrl` (https only, else plain text); empty state only when no figure, no pages, no listings; lede singular/plural; aside "No count yet" (search-view.tsx:16-23,29,34-38,108-110) |

### Package functions used
- `@brandbasket/db`: `listBoughtSetupServices`, `listDeliverablesForBusiness` (service `search`), `listMonthlySnapshots`, `latestMonthlyReport`.
- `@brandbasket/shared`: `billing/add-ons.ADD_ONS_PATH`.

### Behaviours a rebuild must keep
1. Title is "Local SEO + AEO", never "Search" (a test pins it because the sidebar search box also says Search) ((protected)/search/page.test.ts:25-27).
2. Page needs `hasAccess` (else Home) and the search service bought (else `/services`) (search/page.tsx:16-19; lib/server/search.ts:27-28).
3. Only items with kind `page` or `listing` are used, and only `published` ones dated INSIDE the current India month count (lib/server/search.ts:38; lib/search/summary.ts:26-29).
4. Items sort newest first by `dueOn` then id (summary.ts:29).
5. "Searches on Google's first page" figure = snapshot `keywordsPageOne`; the change line compares to `keywordsPageOnePrev`; null when unmeasured, never 0 (summary.ts:19-32).
6. Lede: "<Month>: 1 search shows you on Google's first page." vs plural; fallback copy when unknown (search-view.tsx:34-38).
7. Links on pages are https-only; others render as text (search-view.tsx:16-23).
8. The monthly report button comes from `monthly_reports` for `search`, https only (search-view.tsx:28,40-47).
9. There is no rank table, review feed, Google profile data or AI-answers data in the old app; today's page is exactly: setup card, report link, pages we improved, listings we fixed, one first-page count (components/search/search-view.tsx:62-117). The plan 61 tabs (rankings, ai-answers, reviews, google-profile) have no existing data source in `apps/platform`.
10. The month window is `postWindow(now)` (month plus end of current week) but `summary` filters to the month (lib/server/search.ts:29; summary.ts:26).

### quietly() in this area (what it hides)
| Where | Label | Fallback | Effect |
|---|---|---|---|
| lib/server/search.ts:32 | the finished work | [] | looks like "No search work to show yet" (empty state) when the read actually failed |
| lib/server/search.ts:35 | the monthly numbers | [] | first-page figure disappears ("No count yet") |
| lib/server/search.ts:36 | the monthly report | null | report button disappears |

`loadTodo` is unwrapped (search/page.tsx:17).

### Old paths and query params that need a redirect
- `/search` stays as the Overview; plan adds `/search/rankings`, `/ai-answers`, `/reviews`, `/google-profile` (new).
- `/requests/new?kind=search` link (search-view.tsx:56).
- Rail link `/search` with the label rename already in place (lib/rail.ts:59-60).

---

## reports

### What exists to build on
Nothing in `apps/platform` renders a report to the customer except two staff-pasted links. The data layer for real reports is built and tested in `packages/db`, but has no composer, no Search Console or Analytics pull jobs, no PDF generator and no customer reader.

| Piece | Where | State |
|---|---|---|
| `monthly_reports` (old): one https URL per business, service (`social`/`search`), month; staff paste | packages/db/migrations/0193_social_search.sql:37-49,83-86,101; staff action apps/admin/app/(protected)/clients/[businessId]/work-actions.ts:234-258 | LIVE; read by the Social and Search pages via `latestMonthlyReport` (lib/server/social.ts:47; lib/server/search.ts:36). No website service. Newest month only |
| `monthly_snapshots`: staff-typed figures per service and month (ad spend, ad budget, ad enquiries, posts published/planned, keywords on page one now/previous) | packages/db/src/queries/monthly-snapshots.ts:8-39 | LIVE; staff only writes |
| `report_documents` (new): frozen monthly document per business, service (`website`,`social`,`search`), month; states `draft, held, approved, sent`; `content` JSONB at most 262144 bytes, `content_version`, `pdf_key` must equal `reports/<id>.pdf`; unique per business+service+month | packages/db/src/schema/reports.ts:125-161; packages/db/migrations/0202_reports_data_layer.sql:26-49 | SCHEMA + QUERIES ONLY. No code in apps/platform or apps/admin calls `composeReport`, `moveReport` or `listSentReports` (grep: only packages/db and its tests). The schema comment says "apps/platform owns its shape (zod)" but no zod schema exists (schema/reports.ts:138) |
| Customer read rule | `report_documents_tenant_select`: a customer sees only `state='sent'` of own business; bb_app has SELECT only on `report_sources`, `report_documents` (migration 0202:96,121,132) | READY |
| State machine | packages/db/src/report-states.ts:25-37; trigger `report_documents_guard`: starts draft; identity frozen; arrows draft/held/approved/sent; content changes only in draft or held; sent is final; going back to draft/held clears review (migration 0202:139-178); `moveReport` is optimistic (`changed` error) (packages/db/src/queries/reports.ts:166-183) | READY, STAFF connection |
| `composeReport` upsert replaces content only while draft or held; returns null when approved/sent (queries/reports.ts:136-147) | | READY, staff only |
| Daily and monthly numbers: `metric_daily` (metric `own\|gsc\|ga4.<name>`, value >= 0, unique per business+metric+day), `metric_breakdowns` (month, dimension, at most 100 rows, 65536 bytes), `report_source_runs` (a day is zero only when a successful run covers it) | schema/reports.ts:41-118; queries/reports.ts:25-120 | `own` source IS LIVE: nightly roll-up from the site hit pipeline (apps/platform/lib/server/site-analytics-rollup.ts:10-26, route app/api/internal/roll-up-site-analytics). `gsc`/`ga4` pulls are NOT built (no caller of `upsertReportSource` or `setReportSourceStatus` outside packages/db) |
| `report_sources`: customer-readable status of a connected Search Console / Analytics property (`pending`, `connected`, `access_lost`) | schema/reports.ts:14-39; `listReportSources` (queries/reports.ts:99-101) | table READY; no UI |
| Pure helpers in packages/shared/src/lib/reports | `period.ts` (IST month keys, `lastFullMonth`, `monthRange`), `delta.ts` (`compare`, `describeChange`: only when both months measured), `enquiries.ts` (7 channels, unmeasured is never 0, `summariseEnquiries`), `headline.ts` (`websiteHeadline` with 99.5% uptime floor wording) | READY, all have tests |
| Website uptime figure | no uptime table found in `apps/platform`; `headline.ts` takes `uptimePercent` as an input only | NOT SOURCED (unverified) |

### Staff only (not for the customer app)
`upsertDailyMetrics`, `upsertBreakdown`, `upsertReportSource`, `setReportSourceStatus`, `recordSourceRun`, `listSourceRuns`, `composeReport`, `moveReport`, `listReportsInState`, `listDailyMetrics`, `getBreakdown` all say "Staff connection" (packages/db/src/queries/reports.ts:24,37,56,67,76,87,103,113,132,165,185). Only `listSentReports(db, businessId)` and `listReportSources` are written for a customer scope (queries/reports.ts:194-201,98-101).

### Behaviours a rebuild must keep (for the new `/reports` to be consistent with existing data)
1. A customer must see only `sent` reports; drafts, held and approved are staff working copies (migration 0202:131-132).
2. A sent report is never edited; a month with no sent report must not look complete (guard trigger; plan 61 section 4 "Never: months with no sent report shown as if complete") (migration 0202:151-153).
3. Report months are Indian calendar months (IST +05:30, no DST) (packages/shared/src/lib/reports/period.ts:1-9); month key `YYYY-MM` validated by `^(\d{4})-(0[1-9]|1[0-2])$` (period.ts:24).
4. A report is for the last FULL month: `lastFullMonth(now)` (period.ts:56-59).
5. A comparison is stated only when both months were measured; a fall is worded as plainly as a rise (delta.ts:1-4,22-27).
6. Unmeasured sources are left out, never counted as zero; enquiries count contacts, not people; directions requests and page views are not enquiries (enquiries.ts:1-11).
7. One headline sentence is built only from measured figures; uptime below 99.5% adds ", which is lower than we want," (headline.ts:13,42).
8. The existing Social and Search "Monthly report" button (staff-pasted https link, newest month) is the only customer-visible report today and disappears silently if its read fails (quietly) (lib/server/social.ts:47; lib/server/search.ts:36).
9. `report_documents.service` has `website`, but `monthly_reports.service` has only `social`, `search` (migration 0202:41 vs 0193:46).
10. A PDF is referenced by key `reports/<id>.pdf`; no generator, storage upload or download route exists (schema/reports.ts:157).

### Old paths and query params that need a redirect
None (new screen). The existing Social/Search "Monthly report" links are external URLs, not routes.

---

## Cross-area gotchas (for the parity test)
- Plan 61 says "all 8" domain states and "alt text required on photos"; today there are 9 states and no alt field after onboarding.
- `checkDomainAction` and `/website/preview-image` sit outside the new route map.
- `approvePreviewAction` does not revalidate Home; the feedback action does.
- Social approve and Business brand-asset upload/remove do not check which services are bought.
- Blog stale copy: lib/changelog.ts:27.

---

## settings

### Old routes
| File | URL | Query params read |
|---|---|---|
| `app/app-host/(protected)/settings/page.tsx` | `/settings` | none |
| `.../settings/delete/page.tsx` | `/settings/delete` | none |
| `.../settings/privacy/page.tsx` | `/settings/privacy` | none |
| `.../settings/privacy/export/route.ts` | `GET /settings/privacy/export` (JSON download) | none |
| `.../settings/loading.tsx` | skeleton for `/settings` | |
| `app/app-host/restore-account/page.tsx` | `/restore-account` (closing accounts only) | `keep` = `busy` \| `unavailable` \| `changed` (`lib/keep-plan-copy.ts:5-15`) |
| `app/app-host/restore-account/keep-plan/page.tsx` | `/restore-account/keep-plan` | `token` (fake provider only, `keep-plan/page.tsx:61`) |
| `app/app-host/restore-account/keep-plan/callback/route.ts` | `POST /restore-account/keep-plan/callback` (Razorpay return, 303 to `/restore-account`) | none |
| `app/api/privacy-requests/otp/route.ts` | `POST /api/privacy-requests/otp` | JSON body |
| `app/api/privacy-requests/confirm/route.ts` | `POST /api/privacy-requests/confirm` | JSON body |
| `app/api/privacy-requests/contribution/route.ts` | `POST /api/privacy-requests/contribution` (visitor deletes own review/comment; directory is dormant) | JSON body |
| `app/api/privacy-requests/contribution/mine/route.ts` | `POST /api/privacy-requests/contribution/mine` | JSON body |
| `app/api/internal/erase-closed-accounts/route.ts` | `POST` daily job, bearer `ACCOUNT_ERASE_TOKEN` | `dryRun` (0 or 1), `limit` (1 to 100, default 25) (`lib/account-erase-request.ts:2-24`) |
| `app/app-host/login/page.tsx` (other agent owns) | `/login` | `notice` = `password-changed` \| `account-closed` (`lib/login-notice.ts:5-9`) |

No notification-preferences page exists in the old app (only alert emails and webhooks mention notifications). `/settings/notifications` and `/settings/team` in plan 61 are new, with no old behaviour to port. The old Settings page has the sections Your account, Your business, Password, Your privacy, Delete account, Session (`app/app-host/(protected)/settings/page.tsx:77-128`).

### Server actions
| File | Actions | Guard | Rate limit | Idempotency |
|---|---|---|---|---|
| `.../settings/actions.ts` | `changePasswordAction`, `revokeOtherSessionsAction`, `deleteAccountAction` | `requireCustomerAccess({listingAccount:"allow", membershipCheckout:"allow"})` (`actions.ts:19`) | change-password and delete both draw on `change-password:user:<id>` 8/hour (`lib/server/account-security.ts:10,24,63`); revoke on `revoke-other-sessions:user:<id>` 8/hour (`:52`); delete also `account-exit:user:<id>` 20/hour (`lib/server/account-exit.ts:38,96`) | none keyed; a refused close records nothing and can be retried (`account-exit.ts:86-88`) |
| `.../settings/privacy/actions.ts` | `saveNomineeAction`, `clearNomineeAction` | same `ANY_ACCOUNT` (`privacy/actions.ts:11`) | none | upsert on `user_id` (`packages/db/src/queries/user-privacy-settings.ts:27-33`); both `revalidatePath("/settings/privacy")` (`privacy/actions.ts:19,26`) |
| `app/app-host/restore-account/actions.ts` | `restoreAccount`, `keepPlan` | `getCustomerAccess()`; anything other than `kind==="closing"` redirects `/login` (`actions.ts:12,23`) | `keepPlan`: `checkout:business:<id>` (`CHECKOUT_RATE_LIMIT`, `lib/server/keep-plan.ts:106`) | `restoreKeptPlan` idempotent (`keep-plan.ts:230-238`) |
| inline `confirm` in `restore-account/keep-plan/page.tsx:81-89` | fake-provider confirm | closing access re-checked + token re-verified | none | `confirmKeptPlan` no-op unless a kept plan is waiting (`keep-plan.ts:244-250`) |
| `lib/server/sign-out.ts` | `signOut` (form action everywhere) | none | none | `sign-out.ts:10-13`: `api.signOut` then `redirect("/login")` |

### Lib modules
| path | what it decides or does | T |
|---|---|---|
| `lib/account-settings-form.ts` | zod schemas and states for change-password and delete (max password 128, reason enum, comment max, word `DELETE`); `DELETE_ACCOUNT_PATH`, `RESTORE_ACCOUNT_PATH`, `ACCOUNT_CLOSED_NOTICE` | yes |
| `lib/account-exit-rules.ts` | `planClosureFor`, `keepPlanOffered`, `eraseAfterFor`, `hasRunningAddOns`, `packageEndsFor` (pure) | yes |
| `lib/account-closure-grace.ts` | browser copy of grace days (30); a test keeps it equal to the db constant | yes |
| `lib/keep-plan-copy.ts` | `?keep=` mark to sentence, `KEEP_PLAN_NOTE` | yes |
| `lib/login-notice.ts` | fixed sign-in notices for `password-changed` and `account-closed` | yes |
| `lib/privacy-settings-form.ts` | nominee form states, paths `/settings/privacy`, `/settings/privacy/export`, name max 120, phone max 40 | no |
| `lib/server/nominee.ts` | `parseNomineeForm`: name cleaned and collapsed, phone via `parsePhoneEntry` default country IN, not the account's own number | yes |
| `lib/server/account-security.ts` | `changePasswordFor`, `revokeOtherSessionsFor`, `checkPasswordFor` | yes |
| `lib/server/account-exit.ts` | `closeAccountFor`, `restoreAccountFor`, `hasRunningAddOnsFor`, `loadPackageEndsFor` | yes |
| `lib/server/keep-plan.ts` | `loadKeepPlanOffered`, `startKeepPlanFor`, `restoreKeptPlan`, `confirmKeptPlan`, `findKeepCheckoutFor`, `verifyKeepCheckoutFor` | no (only `keep-plan.integration.test.ts`) |
| `lib/server/account-export.ts` | `buildAccountExport`, `accountExportFilename`, `ACCOUNT_EXPORT_NOT_INCLUDED` | yes |
| `lib/server/account-erasure.ts` | `realErasureDeps`: CMS collections + file + Vimeo deletion wiring | no |
| `lib/account-erasure-run.ts` | `runAccountErasure` order of operations (pure, deps injected) | yes |
| `lib/account-erase-request.ts` | parses `dryRun` / `limit` | yes |
| `lib/server/account-erase-auth.ts` | `accountEraseToken()`: null unless `ACCOUNT_ERASE_TOKEN` is at least `LEADS_API_TOKEN_MIN_LENGTH` | no |
| `lib/server/account-consent.ts` | `recordAccountTermsConsent` (purpose `account_terms`, `LEGAL_TEXT_VERSION`, channel web) | yes |
| `lib/consent.ts` | GTM id parse, consent record encode/decode (12 months), Consent Mode v2 signals, untracked secret paths, cookie names | yes |
| `lib/server/account-label.ts` | phone or email label for a user | yes |
| `lib/server/account-panel.ts` | bell and account menu data (see shell) | yes |
| `lib/server/account-recovery.ts` | `requestPasswordReset`, `resetPassword` | yes |
| `lib/account-recovery-form.ts` | forgot/reset forms, `resetPasswordPath`, token max 200 chars (`:74`) | no |
| `lib/server/account-email-code.ts` | sign-up email code request/confirm | yes |
| `lib/server/privacy-requests.ts` | OTP-gated privacy request filing, contribution deletion | yes |
| `lib/server/privacy-request-intake.ts` | HTTP layer for `/api/privacy-requests/*` | yes |
| `lib/server/privacy-request-fields.ts` | field cleaning, `requestAbout` origin check | yes |
| `lib/server/privacy-request-notify.ts` | Teams card + email alert on new request | no |
| `lib/privacy-request-alerts.ts` | alert and day 20 / day 25 reminder emails (script-safe) | yes |
| `lib/privacy-requests-api.ts` | zod contract for the website (name max 200, details max 2000) | no |
| `lib/retention-report.ts`, `lib/security-review.ts` | nightly script output / staff access review (not app UI) | yes / yes |
| `lib/server/security-events.ts` | `noteSecurityEvent` (see shell) | yes |
| `lib/legal-links.ts` | terms / privacy / privacy-request links | no |
| `lib/server/customer-tenant.ts`, `lib/server/customer-access.ts` | `closing` access kind and the redirect to `/restore-account` | yes / yes |
| `lib/account-entry.ts` | sign-up entry `new`, `plan`, `addons` params (other agent's area) | yes |
| `packages/shared/src/lib/account-exit.ts` | exit reasons (7), comment max 1000, word `DELETE` | yes |
| `packages/shared/src/lib/privacy-request-deadlines.ts` | 30 day target, 15 day content grievance, reminder days 20 and 25 | yes |
| `packages/shared/src/lib/privacy/recipients.ts`, `privacy/notice-version.ts` | `DATA_RECIPIENTS` for export, `LEGAL_TEXT_VERSION` | yes / yes |
| `packages/auth/src/password-policy.ts` | min 8, max 128, letter + number + symbol | yes |

### Components with logic
| path | logic worth porting |
|---|---|
| `components/panel/delete-account-flow.tsx` | two steps (reason radio + optional comment, then confirm); hidden carry of reason/comment into step 2 (`:37-45`); focus password field on password error, error paragraph otherwise (`:66-70`); confirmation input pattern `DELETE`, maxLength 6; lists plan end, package loss lines, "services stop at end of paid month", 30 day erasure (`:134-148`) |
| `components/panel/change-password-form.tsx` | show/hide toggle, `changed-revoke-failed` partial state with retry via `revokeAction`, notice dismissed on input |
| `components/panel/sign-out-other-devices.tsx` | `useActionState` with revoked / error text |
| `components/panel/nominee-form.tsx` | form keyed on saved nominee so fields reset after clear (`:43`); notice dismissed on input |
| `components/consent/ConsentBanner.tsx`, `consent-storage.ts`, `tags.ts`, `CookieSettingsButton.tsx` | see behaviours |
| `app/app-host/restore-account/page.tsx` | buttons: Restore my account, Keep my plan (only if offered), Sign out; "email us" sentence when Keep is not offered (`:43-46`) |

### Package functions used
- `@brandbasket/db`: `findNominee`, `saveNominee`, `clearNominee`, `consumeRateLimit`, `findOpenClosureForUser`, `openAccountClosure`, `restoreAccountClosure`, `restoreAccountClosureForBusiness`, `insertExitFeedback`, `markCancelRequested`, `cancelStaleSubscription`, `findWaitingSuccessor`, `findLatestSubscriptionForBusiness`, `lockBusinessForBilling`, `listAddOnSubscriptionsForBusiness`, `findLiveBundledAddOns`, `isPackageOfferForfeited`, `findBusinessCurrency`, `openKeptSubscription`, `confirmKeptSubscription`, `readExportedAccount`, `listExportedSessions`, `readExportedBusiness`, `listConsents`, `recordConsent`, `listSupportTickets`, `getSupportTicket`, `listClosuresDueForErasure`, `findErasureBlock`, `findClosureDueForErasure`, `eraseClosedAccount`, `beginSupportAccountErasure`, `markSupportAttachmentPurged`, `createPrivacyRequestOtp`, `claimPrivacyRequestOtpAttempt`, `receiveVerifiedPrivacyRequest`, `createAccountOtp`, `claimAccountOtpAttempt`, `consumeAccountOtp`, `ACCOUNT_CLOSURE_GRACE_DAYS` (= 30, `packages/db/src/schema/account-closures.ts:27`).
- `@brandbasket/shared`: `lib/account-exit`, `lib/billing/packages` (`packageBasisPointsFor`, `packageLines`), `lib/billing/bundle` (`reactivationBasketOf`, `nextDiscountCents`, `nextBundledNetCents`, `websiteAloneNetCents`), `lib/billing/terms` (`describePlanTerms`), `server/add-on-ends` (`planAddOnClosure`, `stopAddOnsAtProvider`, `recordAddOnClosure`, `AddOnClosureChangedError`), `server/provider-cancellation` (`cancelAtProvider`), `server/billing-log`, `server/media-storage`, `server/vimeo`, `server/support-attachment-maintenance`, `server/phone-display`, `lib/privacy/recipients`, `lib/appointments/otp` (`OTP_TTL_SECONDS` 600, `OTP_MAX_ATTEMPTS` 5, `packages/shared/src/lib/appointments/otp.ts:5-6`).
- `@brandbasket/billing`: `getBillingProvider` (via `lib/server/billing`), `CheckoutVerificationError`, provider `cancelSubscription`, `cancelSubscriptionAtPeriodEnd`, `startCheckout`, `confirmCheckout`.
- `@brandbasket/auth`: `isWrongPasswordError`, `isInvalidTokenError`; Better Auth `api.changePassword`, `verifyPassword`, `revokeOtherSessions`, `revokeSessions`, `signOut`, `resetPassword`.
- `@brandbasket/email`: `signupCodeEmail`, `privacyRequestCodeEmail`, `securityEventAlertEmail`, `createEmailDelivery`, `createOutboxTransport`.

### Behaviours a rebuild must keep
1. Settings is open to every account kind (website client, free listing, awaiting-membership): `ANY_ACCOUNT` on every action and on delete/privacy pages. The new app must not gate it behind "paid" (`settings/actions.ts:19`, `settings/delete/page.tsx:23`, `settings/privacy/page.tsx:26`).
2. The account is never taken from the form: password, nominee and delete all use the session user (`settings/actions.ts:21,25`; `settings/privacy/actions.ts:13,15`).
3. Change password: confirm must match and new must differ from current (`lib/account-settings-form.ts:48-55`); a wrong current password returns "That isn’t your current password." and an exhausted budget "Too many tries" (`settings/actions.ts:27-28`).
4. A successful password change signs out every OTHER device but keeps this session; if the revoke fails the result is `changed-revoke-failed` (password already changed) and the form offers a retry that only revokes (`lib/server/account-security.ts:36,50-55`, `settings/actions.ts:33-39`).
5. One shared password-guess budget: change password, delete account and `checkPasswordFor` all consume `change-password:user:<id>`, 8 per hour (`account-security.ts:10,24,63`). Typos while deleting can lock out changing the password.
6. Delete order is load-bearing: rate limit 20/hour, password, cancel the kept (waiting) successor at the provider, cancel plan at period end (paid) or outright (unpaid checkout), stop add-ons at the provider, and ONLY THEN one transaction under `lockBusinessForBilling`: mark cancel requested, record add-on ends, open closure, save feedback. Any provider failure returns the generic CLOSE_FAILED message and records nothing (`lib/server/account-exit.ts:96-188`, message `:41-42`).
7. Plan closure matrix: `none` (no sub, cancelled, or manual incomplete), `drop-unpaid` (incomplete at a provider), `already-ending`, `end-with-period` (provider), `note-only` (manual provider: team stops collecting) (`lib/account-exit-rules.ts:49-54`). The Delete page shows "Your plan ends on <date>" only for the three paying kinds and only when `paidThroughAt` is in the future (`settings/delete/page.tsx:15-18`).
8. Erasure date = `max(now, paidThroughAt)` + 30 days (`account-exit-rules.ts:77-81`). The 30 lives in three places that must agree: db constant, browser constant, notice copy (`login-notice.ts:8`, `account-closure-grace.ts:6`).
9. Exit feedback is stored with reason, comment, plan code, `offerPercent: null`, outcome `deleted`, and no user or business id in the call (`account-exit.ts:181-187`). The UI says "We keep this without your name" (`delete-account-flow.tsx:117`). Comment max 1000 (`packages/shared/src/lib/account-exit.ts:39`).
10. After close the action ALSO calls `api.revokeSessions` (all devices) and redirects `/login?notice=account-closed`; a Teams card `account_closed` (reason label, plan paid until, erased after, comment) is sent fire-and-forget (`settings/actions.ts:52-53`, `account-exit.ts:197-206`).
11. A closing account is locked: `getCustomerAccess` returns `closing` before anything else, `requireCustomerAccess` redirects to `/restore-account`, and the login page does the same (`lib/server/customer-tenant.ts:17-18`, `lib/server/customer-access.ts:107`, `app/app-host/login/page.tsx:66`).
12. Restore: any closing account, one click, `restoreAccountClosure`, then `/`. A not-closing session is sent to `/login` from the action but to `/` from the page (`restore-account/actions.ts:12-14`, `restore-account/page.tsx:30`).
13. Keep my plan is offered only when: client cancelled (`cancelRequestedAt`), provider is not manual, status active or past_due, `paidThroughAt` in the future, and no ACTIVE successor mandate (`account-exit-rules.ts:62-71`). It opens a new mandate starting on `paidThroughAt`; nothing is charged now. The closure stays until the provider confirms (webhook for Razorpay, confirm page for fake) (`keep-plan.ts:40-48,233-238`).
14. Keep my plan prices the basket as the subscription bills it (`cancelRequestedAt: null`), refuses with `unavailable` if the code discount would zero the charge, and re-checks every precondition in the second transaction; on mismatch it cancels the just-created provider subscription (orphan) and returns `changed` (`keep-plan.ts:118-139,186-219`). Add-ons the closure already stopped stay stopped (`:231`).
15. Keep my plan refusals are `busy` / `unavailable` / `changed`, carried as `?keep=` and rendered from a fixed map with no state kept (`lib/keep-plan-copy.ts:5-15`). The Razorpay callback is UX only, records nothing, always 303 to `/restore-account` (`keep-plan/callback/route.ts:10-12`). The confirm page 404s for any provider other than fake or razorpay (`keep-plan/page.tsx:60`).
16. Data download: `GET /settings/privacy/export`, session only, 6 per hour per user (`account-export:user:<id>`), 429 with `Retry-After`, `Cache-Control: private, no-store`, filename `brandbasket-my-data-YYYY-MM-DD.json`, format `brandbasket-account-export/1`; includes account, sign-ins, business, up to 100 support requests with messages, consents, `sharedWith`, and a `notIncluded` list (`settings/privacy/export/route.ts:7-9,17-30`, `lib/server/account-export.ts:19,27,43-48,76-110`). Unauthenticated gets a bare 401, not a redirect.
17. A CLOSING account cannot download its data: the route needs `kind === "granted"` and a closure makes access `closing` (`export/route.ts:17`, `customer-tenant.ts:18`). Decide deliberately whether the rebuild keeps this.
18. Nominee (DPDP s.14): name cleaned and whitespace-collapsed, max 120 characters by code points; phone must parse (default country IN), max 40 typed characters, stored as E.164, and may not equal the account's own phone; nothing is ever sent to it (`lib/server/nominee.ts:6-36`, `lib/privacy-settings-form.ts:8-9`, `nominee-form.tsx:21`).
19. Cookie/measurement consent is browser-only: `localStorage["bb-app-consent"]` = `{measurement, at}`, expires after 365 days, no server record. The banner mounts only when `NEXT_PUBLIC_GTM_ID` is set and valid (`^GTM-[A-Z0-9]{4,12}$`; a bad id fails the build) (`lib/consent.ts:13-24,34-47`, `app/app-host/layout.tsx:38`). Settings, Privacy hides its "Measuring how you use the dashboard" section when there is no GTM id (`privacy/page.tsx:64`).
20. Consent Mode v2: defaults all denied except `security_storage`; only `analytics_storage` can be granted; the GTM script is injected only after a yes and never on `/reset-password/*`, `/setup/*`, `/billing/confirm*`, `/billing/charges/confirm*`; every choice pushes `bb_consent` to the dataLayer (`components/consent/tags.ts:15-36`, `lib/consent.ts:52-64`). Turning measurement off after it was on deletes `_ga*`, `_clck`, `_clsk` cookies on the host, the parent domain and bare, then reloads the page (`ConsentBanner.tsx:44-52`, `tags.ts:39-45`). Allow and No thanks share one style. The banner re-opens via window event `bb:cookie-settings` (`ConsentBanner.tsx:11`). The only other dataLayer push in the app is the purchase event (`lib/purchase-event.ts:19`, `components/first-look/payment-welcome.tsx:67`).
21. Account Terms and Privacy consent is recorded at account creation with the notice version; a write failure is only logged and never blocks the new account (`lib/server/account-consent.ts:12-22`).
22. Public privacy request API (called by the marketing site, stays in platform): bearer `LEADS_API_TOKEN`; checks in order 405, 503 (no token), 401, 415, 413 (24 KB form, 4 KB others), 400, honeypot `website` field (fake success, nothing stored), `about` must be on the website origin, 422 field errors (`lib/server/privacy-request-intake.ts:37-38,55-63,136-155`). Code budgets: 5/hour per IP, 3 per 10 min and 6 per day per email, 300 per day total; confirm 30/hour per IP; 6 digits, 10 min, 5 tries, the attempt is claimed before comparing; due date counts from confirmation, 15 days for content reports else 30 (`lib/server/privacy-requests.ts:47-51,191-223`). Details required for kinds correction, grievance, content_report (`privacy-request-fields.ts:20,63-67`).
23. The "Make a privacy request" button on Settings, Privacy is effectively a `mailto:` for Brandbasket: `BRAND.siteUrl` is always set, so `legalLinksFor` returns `mailto:support@brandbasket.in` and the website-form branch is dead code, while the page copy still promises "a code emailed ... reply within 30 days" (`lib/legal-links.ts:21-26`, `lib/brand.ts:37`, `settings/privacy/page.tsx:81`).
24. Erase job: 503 if token unset, 401 if wrong; limit 1 to 100 default 25; order is eligibility check, CMS content (blogPosts, blogAuthors, blogCategories, media, tenants), rows in one transaction, then stored files and Vimeo videos; failure at the first two stages leaves the closure open for the next run; file and video failures are reported, not retried (`app/api/internal/erase-closed-accounts/route.ts:17-25`, `lib/account-erasure-run.ts:3-13,65-96`, `lib/server/account-erasure.ts:24-50`). Payload bulk delete returns per-document errors instead of throwing, so the code checks `errors.length` (`account-erasure.ts:45-49`).
25. Password reset request never reveals whether an address or number has an account: 6 per hour per client IP, 3 per hour per email (or per phone and per account email); over the per-address budget still answers "accepted"; unknown identifiers take the same outbox-write path inside a rolled-back transaction; delivery runs in `after()` (`lib/server/account-recovery.ts:23-25,47-99`). Reset link use: 10/hour per client IP (`:27,106`).
26. Sign-up email code: 6 digits, 10 min, 5 tries; limits IP 10/hour, email 3 per 10 min and 8 per day, global 1000/day, confirm 30/hour per IP; a code that could not be emailed is consumed; `EMAIL_CODE_BYPASS` accepts any six digits but still burns an attempt (`lib/server/account-email-code.ts:41-48,133,175`).

### quietly / swallowed errors
- None of the settings, privacy, delete, restore or export code uses `quietly`.
- Swallowed on purpose: `recordAccountTermsConsent` catch (`account-consent.ts:20-22`); `revokeOtherSessions` catch reports via `reportServerError` and returns false (`account-security.ts:43-46`); `notifyNewPrivacyRequest` never throws (`privacy-request-notify.ts:29-31`); `noteSecurityEvent` never throws (`security-events.ts:67-69`); `announceCustomerToTeams` is `void`ed (`account-exit.ts:197`); `purgeExpired*Otps` are `.catch`ed (`account-email-code.ts:99`, `privacy-requests.ts:138`).
- A provider failure inside `closeAccountFor` is NOT hidden from the user: it becomes CLOSE_FAILED with a billing log line (`account-exit.ts:115-122,153-161`).

### Old paths and query params that need a redirect
- Keep exactly (emails, bookmarks, Razorpay): `/settings`, `/settings/privacy`, `/settings/privacy/export`, `/settings/delete`, `/restore-account`, `/restore-account/keep-plan`, and the POST `/restore-account/keep-plan/callback` (missing from the plan 61 route map; Razorpay is given it as `callbackUrl`, `keep-plan/page.tsx:53`). Also `/restore-account?keep=...` and `/login?notice=password-changed|account-closed`.
- `/api/privacy-requests/*` and `/api/internal/erase-closed-accounts` stay in `apps/platform` (server to server callers).
- In-app links into this area: account menu "Settings" (`href: "/settings"`, `components/v2/app-shell.tsx:46`), rail Settings (`lib/rail.ts:62`), delete flow "Keep my account" to `/settings` (`delete-account-flow.tsx:120,192`), privacy page "Settings" link (`privacy/page.tsx:78`), Settings to `/settings/delete` and `/settings/privacy` (`account-settings-form.ts:11`, `privacy-settings-form.ts:6`).

---

## affiliate

### Old routes
| File | URL | Query params |
|---|---|---|
| `app/app-host/affiliate/(portal)/layout.tsx` | wraps `/affiliate` | none |
| `app/app-host/affiliate/(portal)/page.tsx` | `/affiliate` (title "My coupon", `force-dynamic`) | none |
| `app/app-host/affiliate/setup/[token]/page.tsx` | `/affiliate/setup/<token>` (`force-dynamic`, `referrer: no-referrer`) | none |
| `app/app-host/affiliate/setup/[token]/actions.ts` | server action | none |
| `app/app-host/login/page.tsx:67-69`, `login/actions.ts:25` | send an affiliate with no business to `/affiliate` | |

The console builds the login link with `affiliateSetupPath(token)` (`packages/shared/src/lib/affiliate-links.ts:11-13`, used by `apps/admin/lib/server/affiliate-admin.ts`). The path `/affiliate/setup/<encoded token>` is a contract with the console and with emails already sent.

### Server actions
| File | Action | Guards | Rate limits | Idempotency |
|---|---|---|---|---|
| `affiliate/setup/[token]/actions.ts` | `completeAffiliateSetup` | token present; `checkHuman(formData,"affiliate_setup")` (Turnstile; skipped when not configured, `packages/shared/src/server/turnstile-request.ts:19-21`); `parseSetupForm` | `setup:client:<ip>` 10/hour consumed BEFORE the invite lookup (`lib/server/setup.ts:24,109-115`, `lib/server/affiliate-setup.ts:61`) | one-use token claimed inside a transaction with a row lock (`findAffiliateLoginInvite(... "update")`, `affiliate-setup.ts:66`) |

No other affiliate actions: the dashboard is read-only.

### Lib modules
| path | what it decides | T |
|---|---|---|
| `lib/server/affiliate-access.ts` | `getAffiliateAccess` (staff DB, by session user id only), `requireAffiliateAccess` (redirect `/login`), `isAlsoCustomer`, `landingForSignedInUser` | no |
| `lib/server/affiliate-dashboard.ts` | `loadAffiliateDashboard` with list caps | no |
| `lib/affiliate-dashboard.ts` | `codeStatus`, `moneyFigure`, `cashOutFigure`, `primaryCashOut`, `cashOutShares`, `monthRows`, `monthsWindowStart`, `monthLabel`, `payingLine` | yes |
| `lib/server/affiliate-setup.ts` | `findAffiliateInviteForToken`, `inviteEmailHasAccount`, `redeemAffiliateLogin`, `AffiliateAccountTakenError` | yes |
| `lib/server/setup.ts` | shared setup budgets, `InviteNotUsableError`, `TooManySetupAttemptsError`, `TermsNotAgreedError`, `verifyExistingAccount` | yes |
| `lib/setup-form.ts` | `parseSetupForm`, `newPasswordSchema`, agree field `agree`=`yes` | yes |
| `packages/shared/src/lib/affiliate-links.ts` | `AFFILIATE_PATH`, `AFFILIATE_LOGIN_LINK_DAYS` = 7, `affiliateSetupPath` | no |
| `packages/shared/src/lib/billing/referral-value.ts` | `describeAffiliateReward`, `describeRewardCycles`, `describeReferralDiscount`, `describeDiscountMonths`, `formatPercent` | yes |
| `lib/author-links.ts` | NOT affiliate (blog author links); ignore | yes |

### Components with logic
| path | logic worth porting |
|---|---|
| `components/panel/affiliate/affiliate-shell.tsx` | affiliate-only shell: one nav item "My coupon", NO Settings in the account menu, no bell panel (`panel={null}`) (`:18-31`) |
| `components/panel/affiliate/copy-code-button.tsx` | clipboard copy; "Copied" for 2000 ms, a failed state with sr-only guidance when the browser refuses (`:10,24-34,47`) |
| `components/panel/affiliate/status-dot.tsx` | tone + label (colour never alone) |
| `components/panel/setup-form.tsx` (shared with customer setup) | modes: ask name, link existing (password only), new password only; Turnstile scope |
| `app/app-host/affiliate/(portal)/page.tsx` | inline sections: code rows, figures, cash-out bar, by month, earnings, payouts |

### Package functions used
`@brandbasket/db`: `findAffiliateByUserId`, `listReferralCodes`, `listAffiliateCodeUsage`, `listAffiliateMembers`, `listAffiliateEarnings`, `listAffiliatePayouts`, `findAffiliateCashOut`, `listAffiliateMonthlyActivity`, `findAffiliateLoginInvite`, `claimAffiliateLoginLink`, `resetAffiliateCredentialPassword`, `findUserByEmail`, `listMembershipsForUser`. `@brandbasket/auth`: `createAccountWithGrant`, `AccountAlreadyExistsError`, `passwordPolicyProblem`. `@brandbasket/shared`: `lib/billing/referral-value`, `lib/money` (`formatMoney`), `lib/affiliate-links`, `server/turnstile-request` (`checkHuman`), `ui/turnstile-scope`, `lib/sign-in-limits` (`retryMessage`), `lib/client-ip`.

### Behaviours a rebuild must keep
1. Affiliate identity comes from the session user only; no page, form or URL ever names an affiliate (`lib/server/affiliate-access.ts:11-12`). Read on the STAFF connection because the affiliate tables are staff-only (`:14`).
2. A non-affiliate hitting `/affiliate` is redirected to `/login`, not 404 (`affiliate-access.ts:31`).
3. Landing rules for someone who is both: after sign-in a user with any business membership lands on `/`; an affiliate with no business lands on `/affiliate` (`affiliate-access.ts:45-48`). The login page also sends a signed-in "no-business" affiliate to `/affiliate` (`login/page.tsx:67-69`).
4. A customer who is also an affiliate sees `/affiliate` INSIDE their normal customer shell with an "Affiliate" rail link in the Account section; an affiliate-only user gets the stripped `AffiliateShell` (`affiliate/(portal)/layout.tsx:15-26`, `lib/rail.ts:119`, `(protected)/layout.tsx:32`).
5. The affiliate layout calls only `requireAffiliateAccess`, but the customer shell inside it calls `requireCustomerAccess({listingAccount:"allow"})`, so a both-roles user whose account is closing is redirected to `/restore-account` (`components/v2/app-shell.tsx:28`).
6. Affiliate-only users have no Settings page: password changes come only from a staff-sent link (`affiliate-shell.tsx:30`); a reset link is a setup link for an invite whose `userId` is set.
7. A setup link is valid for 7 days and works once (`affiliate-links.ts:8`, `setup/[token]/page.tsx:34`). A dead link shows "This link no longer works".
8. Lookup budget `setup-view:client:<ip>` 60/hour per network, shared with customer setup links; over budget renders "Try this link again soon" with minutes (ceil, min 1) and never turns the link dead (`lib/server/setup.ts:26,81-87`, `affiliate-setup.ts:34-38`, `setup/[token]/page.tsx:43-51`).
9. Three setup modes: (a) invite has `userId`: choose a NEW password only (hashes it itself, enforces `passwordPolicyProblem`, claims the link, deletes sessions, does NOT sign in, redirects `/login?notice=password-changed`); (b) invite email already has an account: "link existing", asks that account's password, signs in; (c) brand new: name + password + Terms tick, `createAccountWithGrant`, records account terms consent (`affiliate-setup.ts:71-101`, `actions.ts:49`).
10. The Terms tick is required only for a brand-new account (`affiliate-setup.ts:89-91`).
11. `AccountAlreadyExistsError` switches the form to `verify-existing` mode with "This email already has a Brandbasket account..."; `AffiliateAccountTakenError` when the target user already belongs to another affiliate (`actions.ts:36-45`, `affiliate-setup.ts:96`).
12. `verify-existing` mode on an invite that already has a `userId` is rejected as unusable (`affiliate-setup.ts:72`).
13. Turnstile action name `affiliate_setup` must match the widget (`actions.ts:19`, `setup/[token]/page.tsx:81`); the robot check runs before form parsing.
14. Dashboard list caps: codes 50, members 500, earnings 100, payouts 50, months 6. The "Members" total is `members.length`, so it silently stops at 500 (`lib/server/affiliate-dashboard.ts:21-26,62`).
15. Members are shown as counts only (total, paying = status `active`), never names (`server/affiliate-dashboard.ts:46-47,62`).
16. Code status precedence: Paused (affiliate off or code off), then Expired, then Fully used, then Live (`lib/affiliate-dashboard.ts:14-23`). Paused-affiliate banner: "new members can’t use them. Members who already joined keep earning" (`affiliate/(portal)/page.tsx:126-130`).
17. Money figures sum per currency as "₹4,200 + $12", and "₹0" when there is none (`affiliate-dashboard.ts:25-30`). The cash-out bar and monthly strip use the currency with the most earned (`:42-45,120-126`).
18. Cash-out bar shares: whole percentages summing to 100, each non-zero part at least 2%, the largest absorbs the rounding; all zero when nothing is earned (`:54-74`). The "Withheld" key is hidden when no row has withheld money; "cancelled after a refund" shows only if any (`page.tsx:172,177`).
19. Monthly rows use India time (UTC+5:30), newest first, empty months kept as zero rows, but the whole section is `null` when the 6 month window has no activity; bar width at least 4% when cents > 0 (`affiliate-dashboard.ts:77-141`, `page.tsx:198`).
20. A payout row shows amount minus withheld, with "of X" and the withheld reason beneath (`page.tsx:250-258`). Earning label "Month n" or "Month n of m" when the affiliate has a month limit (`affiliate-dashboard.ts:33-35`).
21. Reward text: percent "x% of each payment", flat "₹x a month" in `rewardCurrency ?? INR`, "Nothing" for a 0 flat reward; cycles "every paid month" / "first paid month only" / "first N paid months" (`referral-value.ts:47-58`). Code row text: "Members get X off every month / a month for N months", or "No discount for members" (`page.tsx:66-69`).
22. Greeting uses the first whitespace-separated token of the name (`page.tsx:31-33`). Empty states: "Your code is being set up. It will appear here." and "Nothing yet. It adds up here each time a member pays." (`page.tsx:134,216`).
23. Both pages are `force-dynamic` (money, token in URL); the setup page also sets `referrer: "no-referrer"` (`setup/[token]/page.tsx:11-14`).

### quietly / swallowed errors
None used. A failed DB read in `loadAffiliateDashboard` (one `Promise.all`, `lib/server/affiliate-dashboard.ts:50-58`) throws to the error boundary.

### Old paths and query params that need a redirect
Keep `/affiliate` and `/affiliate/setup/[token]` as they are (console links, sent emails). Referral value formatting is shared with checkout referral code and `/billing/refer`, so keep `referral-value.ts` in `packages/shared`. In-app links: rail Affiliate, `AFFILIATE_PATH` redirects after setup and sign-in.

---

## changelog

### Old routes
| File | URL | Query |
|---|---|---|
| `app/app-host/(protected)/changelog/page.tsx` | `/changelog` (title "What’s new") | none |
| `.../changelog/loading.tsx` | skeleton (2 sections) | |
Linked only from the account menu: `packages/shared/src/ui/panel/account-bar.tsx:263-271` (item "What’s new", shown only when `panel !== null`, i.e. customer surfaces).

### Server actions
None.

### Lib modules
| path | what it does | T |
|---|---|---|
| `lib/changelog.ts` | hand-kept `CHANGELOG_ENTRIES` (2 entries, both 2026-09-21: "Your account, in one place", "The blog is yours"), each `{date, label, title, body}` | yes |
| `packages/shared/src/ui/changelog-art.tsx` | copy of marketing art; no importer found anywhere (dead) | no |

### Components with logic
`page.tsx` only: renders newest first, a `Latest` pill on index 0 only, `<time dateTime={date}>` showing `label` (`page.tsx:13-17`).

### Package functions used
None.

### Behaviours a rebuild must keep
1. Heading and menu label are "What’s new", never "Changelog" (`changelog/page.test.ts:8-11`; `lib/account-menu.test.ts` asserts the menu no longer offers "Changelog").
2. Entries newest first; `label` must equal "D Month YYYY" of `date`; no em or en dash in any entry; no entry mentions "feedback" (`lib/changelog.test.ts:7-25`).
3. Only the newest row gets the `Latest` pill; rows are split by hairlines; no cards, no timeline marks, no pictures (`changelog/page.test.ts:13-25`).
4. The list key is `${date}-${title}`; both entries share a date, so the title keeps keys unique (`page.tsx:14`).
5. The content is stale against the new IA and needs owner copy review: the blog entry says "no limit on how often" (plan 61 section 5 says to fix the stale "no limit" copy) and the account entry describes the old sidebar name and bell (`lib/changelog.ts:21,27`). Locked-copy rule: new copy goes to the owner first.
6. The page needs a signed-in customer: it sits under `(protected)`, whose layout calls `requireCustomerAccess({listingAccount:"allow", membershipCheckout:"allow"})` (`(protected)/layout.tsx:22`); an awaiting-membership account sees it inside `MembershipGateShell`. The page itself calls no guard of its own.

### quietly / swallowed errors
None.

### Old paths that need a redirect
`/changelog` stays (plan route map). The account menu item `href="/changelog"` is hard-coded in the shared `AccountBar` (`account-bar.tsx:265`), so the new shell must provide its own menu or keep that component.

---

## shell

### Old routes
| File | URL / role | Notes |
|---|---|---|
| `app/app-host/layout.tsx` | root layout of the dashboard | `requireSurfaceHost("app")` (404 on a wrong host, `lib/server/surface-host.ts:13-16`); metadata `robots: {index:false, follow:false}` and title template `%s · Brandbasket` (`layout.tsx:16-23`); viewport themeColor `#f6f5f2`; mounts `ConsentBanner` only if `GTM_ID` (`:38`) |
| `app/app-host/(protected)/layout.tsx` | signed-in chrome | access, geo catalog, membership gate, banner, `AppShell` |
| `app/app-host/(protected)/loading.tsx` | skeleton `SkeletonPage stats sections=1` | |
| `app/app-host/error.tsx` | error boundary for the whole host (no per-group boundary exists) | |
| `app/app-host/not-found.tsx`, `app/app-host/[...missing]/page.tsx` | branded 404 for unmatched paths (the catch-all renders 200, see below) | |
| `app/global-error.tsx` | last-resort error with its own `<html>` | |
| `app/global-not-found.tsx` | 404 for paths that bypass the proxy matcher (`globalNotFound` flag) | |
| `app/robots.ts` | `User-agent: *` / `Disallow: /` | |
| `app/.well-known/security.txt/route.ts` | `GET /.well-known/security.txt`, `Cache-Control: public, max-age=86400` | the proxy skips `.txt`, so every host reaches it |
| `app/api/error-reports/route.ts` | `POST /api/error-reports` | |
| `app/app-host/(support)/support/page.tsx` | `/support` redirects to `/requests` (also `[ticketId]`) | requests area; listed as a legacy entry |
| `proxy.ts` | host routing and noindex | |
| `next.config.ts` | security headers, deployment id, `/add-ons` redirect, Sentry wrapper | |

Query params read in the shell: none (it reads `usePathname` only). `?kind=other` is written in the Help link, not read.

### Server actions
No `actions.ts` in the shell. `signOut` (`lib/server/sign-out.ts`) is the only action passed through it, bound by `AccountBar`, `SignOutButton` and the settings Session section.

### Lib modules
| path | what it decides | T |
|---|---|---|
| `lib/rail.ts` | rail sections, which links exist per state, counts, active matching, phone tabs, search targets | yes |
| `lib/section-tabs.ts` | `currentSectionTab`, `sectionTabPaths` (`exact`, `alsoOwns`) | yes |
| `lib/surfaces.ts` | host to surface resolution, local-dev hosts, `/admin` refusal, origin env parsing | yes |
| `proxy.ts` | rewrite into `/app-host`, `X-Robots-Tag: noindex, nofollow`, 404 for unknown host, `/admin` | yes (`proxy.test.ts`) |
| `lib/server/surface-host.ts` | `requireSurfaceHost` backup for static paths | no |
| `lib/server/request-brand.ts` | `requestBrand`/`currentBrand` return the one constant; `appOriginForHostHeader`, `requestAppOrigin`, `currentAppOrigin` | no |
| `lib/brand.ts` | single `BRAND`, `logoOf`, `supportEmailOf`, default choice `managed` | yes |
| `lib/legal-links.ts` | terms/privacy/request links | no |
| `lib/server/account-panel.ts` | bell notices + menu data | yes |
| `packages/shared/src/lib/account-panel.ts` | `noticesFrom`, `actionableCount`, `siteStatusLine` | yes |
| `lib/server/billing-banner.ts` | banner model per request | no |
| `packages/shared/src/lib/billing/payment-step.ts` | `billingBanner`, `PAYMENT_STEP_HREF`, `REACTIVATE_HREF`, copy | yes |
| `lib/server/active-services.ts` | which services appear in the rail | no |
| `lib/server/customer-access.ts`, `customer-tenant.ts`, `session.ts` | access kinds, redirects | yes / yes / no |
| `lib/deployment-id.ts` + `packages/shared/src/lib/deployment-id.ts` | release id from `/releases/<sha>[+n]` dir or `NEXT_DEPLOYMENT_ID` | yes |
| `packages/shared/src/lib/stale-deploy.ts` | `isStaleDeployError`, `reloadForDeploymentUpdate` | yes |
| `packages/shared/src/ui/panel/deployment-update.tsx` | the "was updated, reload" panel (inline styles) | no |
| `lib/report-boundary-error.ts` | once-only reporting from boundaries | yes |
| `lib/request-error.ts` | route type to operation map, Sentry + native, skips self-loop | yes |
| `lib/server/error-report.ts` | native reporter + `sendSystemErrorAlert` | no |
| `packages/shared/src/lib/error-report.ts` | report schema, route allowlist, browser capture | yes |
| `packages/shared/src/server/error-report.ts` | server reporter and the `/api/error-reports` collector | not checked |
| `lib/sentry-options.ts`, `lib/sentry-scrub.ts` | privacy options, trace rate, scrubbing | yes / yes |
| `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | boot checks, Sentry init | no |
| `packages/shared/src/lib/security-headers.ts` | CSP and other headers | yes |
| `lib/currency-words.ts` | `pricesNote`, `CURRENCY_NAMES` | yes |
| `packages/shared/src/lib/search-shortcut.ts` | `isSearchShortcut` (Cmd or Ctrl + K) | yes |
| `packages/shared/src/ui/v2/dialog-hooks.tsx` | `useDialogOpen`, `useSearchShortcut` | not checked |
| `lib/count-pill.test.ts` (tests `components/v2/count-pill.tsx`) | pill visibility rule | yes |

### Components with logic
| path | logic worth porting |
|---|---|
| `components/v2/app-shell.tsx` | builds rail sections from billing + services + badge; menu data (Help to `/requests/new?kind=other`, Docs = brand site or `<site>/faq`, account href `/settings`) |
| `components/v2/rail.tsx` | active link via `linkIsCurrent`; Cmd/Ctrl+K only opens search when the viewport is at least 1024 px (the rail is `display:none` below `lg`) (`:40-43`); business initials chip |
| `components/v2/phone-bars.tsx` | bottom tab bar = `phoneTabs` + "More"; menu sheet closes on any `a[href]` click (`:79-81`); its own search button with no shortcut (`:43,124`) |
| `components/v2/command-search.tsx` | search over `railTargets`; arrows wrap; Home/End only with an empty query; Enter opens the highlighted result; backdrop click closes; "Nothing matches that." |
| `components/v2/count-pill.tsx` | hidden when `count` undefined or the link is current; sr-only ", N waiting" |
| `packages/shared/src/ui/panel/account-bar.tsx` | menu items order (Settings, Home page, What’s new, Help, Docs, Sign out), popover focus/Escape/arrow handling, bell dot only for actionable notices, site status line |
| `components/panel/billing-banner.tsx` | four kinds, eyebrow text, price block only for `pay`, button for `pay`/`retrying`/`reactivate` |
| `components/panel/hidden-on-paths.tsx` | exact-path match to hide the banner on `/` |
| `components/panel/branded-not-found.tsx`, `packages/shared/src/ui/panel/panel-not-found.tsx` | branded 404 |
| `components/panel/brand-provider.tsx` | brand context for client components |
| `components/panel/membership-gate-shell.tsx` | dormant (awaiting free-listing membership); footer legal links and `pricesNote` |
| `app/app-host/error.tsx`, `app/global-error.tsx` | stale-deploy branch vs generic error, `reportBoundaryError`, digest shown as "Reference:" |

### Package functions used
`@brandbasket/db`: `consumeRateLimit`, `recordErrorReport`, `findOpenClosureForUser`, `listMembershipsForUser`, `findBillingState`, `findBusinessEntry`, `withTenantScope`. `@brandbasket/billing`: `deriveSiteStatus`, `SiteStatus`. `@brandbasket/shared`: `lib/access` (`decideCustomerAccess`), `lib/billing/status` (`summariseBilling`), `lib/billing/payment-step`, `lib/onboarding/steps` (`firstIncompleteStep`, `onboardingStepHref`), `lib/next-step`, `lib/project-customer-line`, `lib/account-panel`, `lib/stale-deploy`, `lib/error-report`, `lib/security-headers`, `lib/production-requirements`, `server/runtime-environment`, `server/turnstile-request` (`warnIfTurnstileUnconfigured`), `lib/site-config`, `ui/panel/dashboard-root`, `ui/panel/dashboard-frame`, `ui/logo`. `@brandbasket/email`: `securityEventAlertEmail`. `@sentry/nextjs`.

### Behaviours a rebuild must keep
1. Every response must carry `X-Robots-Tag: noindex, nofollow` (plan 61 section 5). Today that holds only for REWRITTEN pages: `proxy.ts:15` sets it, but its matcher skips `/_next/`, `/api/`, icons and any path ending in a static extension including `.txt` (`proxy.ts:52-54`). So API routes, `robots.txt` and `security.txt` carry no header today (only the blog preview route sets its own, `lib/server/blog-preview-request.ts:40`). The other layers are `robots.ts` Disallow all and the page metadata `robots` (`app/app-host/layout.tsx:21`). A single-app rebuild needs one header rule (for example `next.config` headers) to truly cover "every response".
2. An unknown Host gets a bare 404 from the proxy; `/admin` and `/admin/*` get 404 (Payload UI); with `APP_ORIGIN` unset everything 404s; only dev (`NODE_ENV=development`) answers on any local host (`proxy.ts:25-37`, `lib/surfaces.ts:56-58,60-69`).
3. `requireSurfaceHost` in the root layout is a backup for paths the proxy skips, not an access check (`surface-host.ts:8-16`). Every page and action still checks access itself (repo rule).
4. The branded 404 returns HTTP 200 for unmatched paths because the catch-all page renders it; the file explains why (`notFound()` rendered inside Next's generic shell with the multi-root-layout setup) (`app/app-host/[...missing]/page.tsx:4-19`). Plan 61 requires a real 404 status; a single root layout may make `notFound()` safe.
5. Security headers on every path (`next.config.ts:38-54`): CSP with no nonces, HSTS 2 years when https, Razorpay origins on, GTM/Clarity origins only when `GTM_ID` is set, Sentry ingest origin only when a DSN is set, framed origins for the live preview of the marketing site (only needed if a live preview survives in Business). `/t/*` gets `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` (`:57`). `poweredByHeader:false`.
6. `/add-ons` permanently redirects to `/services` (`next.config.ts:64`); in the new app that chain should end at `/billing`.
7. Version skew: `deploymentId` is derived from `/releases/<7-40 hex>[+n]` in the cwd, `NEXT_DEPLOYMENT_ID` wins, undefined elsewhere (protection off) (`packages/shared/src/lib/deployment-id.ts:7-15`, `next.config.ts:37`). An error whose name is `UnrecognizedActionError`, or whose message matches `Server Action .* was not found on the server`, is a stale deploy: show "<Brand> was updated. Reload to continue." with "This submission was not saved. Enter your details again after reloading." and a Reload button; it is NOT reported (`packages/shared/src/lib/stale-deploy.ts:2-9`, `deployment-update.tsx:17-22`, `app/app-host/error.tsx:21,30`, `app/global-error.tsx:10,18`). The panel focuses its heading, uses `role="alert"`, and styles inline so it works when the stylesheet is gone.
8. Boundary error reporting: once per error object (WeakSet); an error with a `digest` is NOT sent to Sentry from the browser (the server hook already did) and `reportBrowserError` also returns early for a digest (`lib/report-boundary-error.ts:4-22`, `packages/shared/src/lib/error-report.ts` `reportBrowserError`). `global-error` reports severity `fatal`; `error.tsx` reports `error`.
9. The server error hook reports to Sentry and then to the native inbox; the native copy is skipped off the Node runtime and for `/api/error-reports` itself to avoid loops; each is isolated in try/catch (`lib/request-error.ts:32-48`, `instrumentation.ts:30-38`).
10. Native report privacy: only the error class (allowlist), a fixed operation, a normalized route (static segments allowlisted, everything else `[id]`), release hash, browser family, up to 8 frames of file basename + line + column (`error-report.ts` `normalizeErrorRoute`, `safeSourceFrames`). Trap: the allowlist is hard-coded with old segment names (`app-host`, `billing`, `settings`, `onboarding`, `support`, `affiliates` but not `affiliate`; none of `checklist`, `enquiries`, `reports`, `checkout`), so new route names would all be reported as `[id]` unless the list is updated. `ErrorApp` is only `"platform" | "admin"` and the collector rejects a report whose `app` differs (`error-report.ts:5`, `packages/shared/src/server/error-report.ts:111`).
11. Collector `/api/error-reports` limits: 4 in flight, body at most 8192 bytes, Origin must equal the app origin AND Host must match, JSON only, 120/min global, 20/min per IP, 20/min per signed-in user, only client operations (`browser_uncaught`, `browser_rejection`, `error_boundary`); any internal failure or 2 s timeout answers 204 (`packages/shared/src/server/error-report.ts:57-58,91-119`). Browser side: 10 reports/min, 2 in flight, 2 s abort (`error-report.ts` `reportBrowserError`). Server side: 30/min per process, 4 in flight, 120/min global in the DB (`server/error-report.ts:23-24,43`).
12. Sentry: DSN from `SENTRY_DSN` (server/edge) and `NEXT_PUBLIC_SENTRY_DSN` (browser); trace rate 1.0 in development else 0.1; `sendDefaultPii:false`; replay off (both sample rates 0); `includeLocalVariables:false`; every event scrubbed (no messages, bodies, queries, cookies, headers, user, extra, console/input breadcrumbs, exception values) (`lib/sentry-options.ts:9-19`, `lib/sentry-scrub.ts:36-111`, `sentry.server.config.ts:7-11`, `instrumentation-client.ts:8-14`). `withSentryConfig` is bound to org `fynix-digital`, project `brandbasket-platform` (`next.config.ts:91-92`): the customer app needs its own project or a decision to share.
13. Boot checks in `register()` (Node): `assertRuntimeEnvironment(runtimeRequirements("platform"))` (an https server refuses to start without Brevo or with `EMAIL_CODE_BYPASS`), a Turnstile-unconfigured log, `startBillingErrorAlerts()` (`instrumentation.ts:6-16`). A Vercel production build fails on missing `vercelProductionRequirements()` (`next.config.ts:12-23`).
14. Security events: `sign_in_blocked` (20 per hour) and `webhook_signature_invalid` (3 per hour) are counted in the shared rate-limit table (limit minus one), emailed at most once per hour per kind to `SECURITY_ALERT_EMAIL`, then `SUPPORT_ALERT_EMAIL`, then `BRANDBASKET_TEAM_EMAIL`, then the default; never throws (`lib/server/security-events.ts:26-69`, `lib/security-review.ts:57-59`). Callers: `lib/server/sign-in.ts:42` and the razorpay, calcom and oyechats webhook routes.
15. Access kinds drive the shell: no session or no membership, `closing` (redirect `/restore-account`), `granted`. A free-listing account is let in with `listingAccount:"allow"`; an owner awaiting a membership sees `MembershipGateShell` with no rail (dormant but still in code) (`lib/server/customer-access.ts:94-115`, `(protected)/layout.tsx:26-30`).
16. `(protected)/layout.tsx:23` calls `ensureGeoCatalog()` on every signed-in page; it only does work when `GEO_CATALOG_SOURCE=db` and exists for the dormant directory (`lib/server/geo-catalog.ts:3-13`). Likely droppable.
17. Billing banner: shown on every signed-in page EXCEPT exact path `/` (home places its own) (`(protected)/layout.tsx:18,37`, `components/panel/hidden-on-paths.tsx:15`). It cannot be dismissed. Model: `paid` + `renewalFailingUntil` is "retrying" ("We couldn’t take your last payment", website online until the date in IST); `lapsed` is "reactivate" ("Your plan has ended", button to `/billing`); `unpaid` + `paymentUnderReview` is notice "Payment received"; `unpaid` is "pay" with price (website alone, referral discount applied) and button "Pay now" (or "Check and send" with no plan, or "Finish setup" to the next onboarding step while setup is incomplete) (`packages/shared/src/lib/billing/payment-step.ts:172-212`, `lib/server/billing-banner.ts:15-48`). Only an unpaid customer reads project and referral discount (`billing-banner.ts:23-33`).
18. Bell (`getAccountPanel`) notices are current-state, never stored, never dismissible: payment due, last payment failed, plan ended, payment received (non-actionable), preview ready (actionable), preparing / building / revisions / on hold (non-actionable), finish setup (when the next step is start or continue onboarding), plus per-request lines `Quote waiting` / `Payment waiting` / `Ready to check` / `New reply` with the subject cut at 60 characters plus "..."; reply is the only non-actionable request kind (`packages/shared/src/lib/account-panel.ts:47,66-128`). The dot counts actionable ones only; the button label carries the count for screen readers; empty state "Nothing needs you right now." (`account-bar.tsx:203-204,335-352`).
19. Notice hrefs are hard-coded to old routes: `/onboarding`, `/onboarding/review` (`PAYMENT_STEP_HREF`), `/billing`, `/website`, `/requests?open=<ticketId>` (`account-panel.ts:72-122`, `payment-step.ts:14`). They are shared with the console, so redirects, not edits, are the safe fix.
20. Account menu: "Home page" link only when a live site exists (new tab, `rel="noreferrer noopener"`); the site status line is hidden when `not_launched`, "All systems normal" when online, "Your website is offline" as a warning (`account-bar.tsx:253-262,206,298-314`, `account-panel.ts:135-143`). "What’s new" appears only when `panel !== null`. Help goes to the New request form `?kind=other` as a link, never a window; a `mailto:` Help opens externally (`lib/account-menu.test.ts`).
21. Rail rules (`lib/rail.ts:112-121`): sections Home; Services (only if non-empty) = Website + Blog when the plan has the website, Social & Ads when bought, Local SEO + AEO when bought; Manage = Requests (count pill when above 0, "Calls" child only for a paid account) + Business; Account = Plan & billing, Affiliate (if affiliate), Settings. Website sub-pages are listed (for search and phone) only once the site is live (`rail.ts:80-89`). An unpaid client keeps the Website link, while a paid plan without the website loses it (`components/v2/app-shell.tsx:37`). Home is "current" on `/` exactly; others on their path and sub-paths plus `alsoCurrent` and children paths (`rail.ts:124-131`).
22. Requests count = needs + waiting-on-you, counting a conversation once (`lib/server/requests.ts:67-71`).
23. Phone: bottom bar is Home, the first service (if any), Requests, Business, then "More"; the menu sheet lists every section with children. Search matches `label` as a lowercase substring; targets start with "New request" then each link and "Group: Page" children (`rail.ts:139-163`). The search popup is a native `<dialog>`; Escape and backdrop click close it and focus returns.
24. `pricesNote(currency, taxed)`: "Prices are in rupees and include GST." / "...dollars."; GST is named only for a taxed plan; a plan-less business is shown rupees with GST (`lib/currency-words.ts:10-12`, `(protected)/layout.tsx:28`). Also used by `lib/checkout-plans.ts:71` and `lib/service-setup.ts`.
25. Brand is a constant: `requestBrand()` returns `BRAND` and reads nothing; title template, 404 title `Not found · Brandbasket`, logo, support email `support@brandbasket.in`, site `https://brandbasket.in` come from `lib/brand.ts:31-41`. Dev only: `X-Forwarded-Host` is trusted only when `NODE_ENV=development` (`lib/server/request-brand.ts:14-17`).
26. `security.txt` is generated per request from `siteConfig.email` and the current date, cached 1 day (`app/.well-known/security.txt/route.ts:5-11`).

### quietly / swallowed errors (shell and everything feeding it)
| Where | Scope / label | Fallback | What it hides |
|---|---|---|---|
| `components/v2/app-shell.tsx:33` | `rail` / "the live website" | `true` | a failed `getLiveWebsite()` shows Website sub-tabs as if the site were live; only runs for paid + website customers |
| `lib/server/requests.ts:57` `loadRequestNeeds` | `requests` / "the requests waiting on you" | `[]` | rail count, bell notices and Overview lose quotes and changes to check |
| `lib/server/requests.ts:63` `loadWaitingOnYou` | `requests` / "the conversations waiting on you" | `[]` | questions from the team vanish from the count |
| `lib/server/requests.ts:76` `loadUnreadReplies` | `requests` / "the unread replies" | `[]` | "New reply" bell lines vanish |
| `lib/server/first-look.ts:27-30` (not `quietly`) | `[first-look] could not read the services` | `null`, then `[]` in `active-services.ts:13` | Social and Search rail links and phone tabs disappear |
| `lib/server/account-panel.ts:26-33` | none | throws | `getBillingBanner`, `getProjectOverview`, `getLiveWebsite`, `getLatestProjectStatus` are NOT guarded, so one failure breaks every signed-in page |
| `lib/server/security-events.ts:67-69`, `lib/server/error-report.ts:25`, `lib/request-error.ts:38-47`, `reportBrowserError` | monitoring | swallowed | monitoring failures never affect the user |

Other `quietly` callers (other agents own them): `website/page.tsx:83`, `requests/new/page.tsx:34,37`, `lib/server/calls.ts:41,63`, `todo.ts:32`, `site-contacts.ts:12`, `search.ts:32-36`, `website.ts:65-77`, `overview.ts:76-91`, `social.ts:43-47`.

### Old paths and query params that need a redirect
- Hard-coded targets in shell data that must still resolve or be redirected: `/settings`, `/changelog`, `/affiliate`, `/billing`, `/services` (Plan & billing first tab, `lib/plan/tabs.ts:8`), `/website`, `/onboarding`, `/onboarding/review`, `/requests?open=<id>`, `/requests/new?kind=other`, `/requests/calls` (`CALLS_PATH`), `/details` (rail Business, `BUSINESS_HREF`), `/social`, `/search`, `/content/blog`, `/content/authors`, `/content/categories` (`lib/blog/tabs.ts:3-5`).
- `/support` and `/support/[ticketId]` to `/requests` (`app/app-host/(support)/support/page.tsx:6`).
- `/billing?payment=received|failed` after a reactivation payment (`payment-step.ts:26-28`), and `/onboarding/review?payment=received` (`payment-step.ts` `PAYMENT_RECEIVED_HREF`).
- `/add-ons` to `/services` is already permanent in `next.config.ts:64`.
- Dormant paths (Listing, Leads, Reviews, Deals, Advertise, Appointments, Patients, clinic) fall into `[...missing]` today (`proxy.test.ts:87`); decide whether they 404 or redirect.

---

## Appendix: silent failures (`quietly()` and bare catches)

The plan bans `quietly()`. Each row is a read that today degrades to a wrong-looking screen, not an error. A loader must return a typed failure per panel instead.

### Home, checklist, kickoff, requests, enquiries

`quietly(scope, label, fallback, work)` logs `[scope] could not read <label>` and returns the fallback; Next redirect or notFound is re-thrown (lib/server/quietly.ts:9-16).

| Where | Fallback | What the customer silently loses |
|---|---|---|
| lib/server/overview.ts:76 chatbot leads | 0 | chatbot-only result line vanishes |
| lib/server/overview.ts:78 monthly numbers | [] | Social and Search result lines vanish |
| lib/server/overview.ts:79 updates | [] | "What we did" loses staff events |
| lib/server/overview.ts:80 the project | NO_PROJECT | "preview sent" activity row missing |
| lib/server/overview.ts:81 live website | null | "went live" row missing |
| lib/server/overview.ts:85 included edits | null | "x of 2 included edits" line hidden |
| lib/server/overview.ts:88 posts waiting | count 0 | the "Approve n posts" Needs you row disappears (an ask is lost, not just a figure) |
| lib/server/overview.ts:91 website enquiries | null | falls back to chatbot-only figure |
| lib/server/todo.ts:32 the project | NO_PROJECT | website checklist items all read as not done |
| lib/server/todo.ts:33-37 (.catch, not quietly) saved answers | [] | every Social and Search item shows open |
| lib/server/requests.ts:57 needs | [] | quotes to accept, changes to check vanish from Home, rail badge and bell |
| lib/server/requests.ts:63 waiting on you | [] | "Reply to:" asks vanish |
| lib/server/requests.ts:76 unread replies | [] | bell loses unread replies |
| lib/server/calls.ts:41 next call | null | "next call" line hidden |
| lib/server/calls.ts:63 Book a call options | null | every "Book a call" button disappears (looks like the feature is off) |
| app/app-host/(protected)/requests/new/page.tsx:34 included edits | null | included-edits line hidden, form still works |
| app/app-host/(protected)/requests/new/page.tsx:37 post to ask about | null | `?about=` prefill dropped |
| lib/server/site-contacts.ts:12 contacts | null | the three Calls/WhatsApp/Forms figures hidden |

Hand-rolled swallowers with the same effect (log and fall back):
- lib/server/setup-call.ts:56-59: a failed booking read returns `booking: null`, so Home can show "Book your kickoff" to a customer who already booked.
- lib/server/setup-call.ts:81-84: slot list failure becomes `unavailable` (booking-page link shown instead).
- lib/server/setup-call-link.ts:17-21: unreadable link setting becomes no link (no booking card, no Book a call).
- lib/server/missed-kickoff.ts:17-20: failed outcome read becomes no "we missed each other" line.
- lib/server/first-look.ts:12-15 and :27-30: failed service read becomes none (`loadServicesBought`) or null (`loadSetupServices`, treated as none by pages); `loadActiveServices` turns null into [] (lib/server/active-services.ts:13). Consequence: a DB blip makes Home think the plan has no services (state goes to `ongoing` at lib/home/state.ts:77) and hides intent options.
- lib/server/first-payment-event.ts:20-23: failed first-payment read means no GA4 purchase push.
- lib/server/call-alert.ts:41-43 and lib/server/onboarding-alert.ts:24-26: staff alert failures are logged only, by design.

---

### Settings, affiliate, changelog, shell

Paths are relative to `apps/platform` unless they start with `packages/` or `apps/` (then relative to the repo root). "T" = a `.test.ts(x)` sits beside the file. `quietly` = `lib/server/quietly.ts` (logs `[scope] could not read <label>` and returns the fallback; passes Next redirect/notFound through, `lib/server/quietly.ts:9-16`).

Silent-failure spots in these four areas (details under each heading):
1. `components/v2/app-shell.tsx:33` quietly("rail","the live website", true): a failed read shows Website tabs as if the site were live.
2. `lib/server/requests.ts:57,63,76` quietly for `loadRequestNeeds`, `loadWaitingOnYou`, `loadUnreadReplies`: a failed read makes the rail count, the bell and Overview show nothing waiting.
3. `lib/server/first-look.ts:27-30` (a bare `.catch` returning null, not `quietly`) feeds `lib/server/active-services.ts:13`: a failed read hides the Social and Search rail links.
4. Settings, affiliate and changelog pages use no `quietly`: a failed read throws to the error boundary.

---

---

# Part 2. Redirect table

New paths are from plan 61 section 3. "NO HOME" means the plan's route map has no destination. Every redirect must be permanent (301/308) except Razorpay POST callbacks, which return 303 and must keep their POST handler (the provider posts to them; a redirect would drop the body). Redirects that depend on a query value (`?open=`) cannot live in a plain path rule: use `has` conditions in `next.config` or the proxy.

## 2.1 Every route under `app/app-host/`

| Old path | Variants and query | New path | Notes |
|---|---|---|---|
| `/login` | none | `/login` | sign in only |
| `/login` | `?new=1`, `?plan=`, `?addons=`, `?start=` | `/signup` (carry `plan`, `addons`, `start`) | `claim` is not read today (see entry) |
| `/login` | `?notice=password-changed\|account-closed` | `/login?notice=` | keep |
| `/join` | `?plan=` (only param copied) | `/signup?plan=` | already a redirect (`join/page.tsx:14`) |
| `/forgot-password` | | `/forgot-password` | |
| `/reset-password/[token]` | | `/reset-password/[token]` | links in sent emails (`lib/server/auth.ts:60`) |
| `/setup/[token]` | | `/setup/[token]` | links in sent emails (`apps/admin/lib/server/invites.ts:43`) |
| `/restore-account` | `?keep=` | `/restore-account` | |
| `/restore-account/keep-plan` | | `/restore-account/keep-plan` | also the Razorpay pay path and fake confirm path (`razorpay-provider.ts:114`, `fake-provider.ts:34`) |
| POST `/restore-account/keep-plan/callback` | | NO HOME | route handler given to Razorpay as `callbackUrl`; must be kept (303) |
| `/personalize` | `?services=`, `?q=` | `/start` | produced by `login/actions.ts:83` |
| `/plan` | `?services=`, `?payment=received\|failed` | `/checkout` | |
| `/onboarding/review` | `?payment=received\|failed` | `/checkout` (keep param meaning) | LIVE Razorpay return URL (`payment-step.ts:14,221`); also Home banner, bell, billing page |
| `/billing/pay` | | `/checkout/pay` | this is the `checkoutUrl` Razorpay subscriptions already created point to (`razorpay-provider.ts:111`); in-flight checkouts hit the old path |
| POST `/billing/pay/callback` | `?membership=`, `?return=billing` | NO HOME | Razorpay `callbackUrl` baked into open checkouts |
| `/billing/confirm` | `?token=` | NO HOME (dev only) | fake provider (`fake-provider.ts:31`) |
| `/billing/charges/[chargeId]/pay` | | `/checkout/charges/[id]` | |
| POST `/billing/charges/callback` | `?for=`, `?ticket=` | NO HOME | Razorpay `callbackUrl` |
| `/billing/charges/confirm` | | NO HOME (dev only) | fake provider (`fake-provider.ts:37`) |
| `/add-ons/confirm` | | NO HOME | constant `FAKE_ADD_ON_CONFIRM_PATH` with no page; dead |
| `/billing` | none, `?payment=`, `?charge=`, `?services=` | `/billing` (meaning CHANGES: old `/billing` is the payments list, new `/billing` is the plan overview; old `/services` is the plan) | map `?charge=` and `?payment=` to the screen that shows the notice |
| `/billing/receipts` | `?ids=a,b` | `/billing/receipts/*` | route handler; emailed links `/billing/receipts?ids=<paymentId>` (`receipt-download.ts:4`, `payment-emails.ts:72`) must still download |
| `/services` | `?charge=` | `/billing` | |
| `/add-ons` | `?charge=` | `/billing` (chain via `/services`) | already a permanent redirect in `next.config.ts:64` |
| `/` | `?welcome=1` | `/` | `welcome` used by confirm and membership redirects |
| `/todo` | | `/` | already redirects |
| `/monitoring` | | `/` | already redirects |
| `/onboarding` | | `/checklist` | index redirects to first incomplete step or review |
| `/onboarding/business`, `/brand`, `/content`, `/domain` | | `/checklist` | item open if supported |
| `/requests` | `?filter=`, `?open=<id>`, `?notice=changed\|window\|failed`, `?charge=` | `/requests`; `?open=<id>` to `/requests/<id>` | `?open=` is in sent emails (`apps/admin/lib/server/request-notify.ts:25`), the bell and charge returns |
| `/requests/new` | `?kind=website\|social\|search\|other`, `?page=`, `?about=<postId>`, `?intent=send_info`, `?from=preview` | `/requests?new=1` (preserve all) | dialog |
| `/requests/calls` | | `/help` | |
| `/support` | | `/requests` | already redirects |
| `/support/[ticketId]` | | `/requests/[id]` (404 for non-uuid) | in sent email (`apps/admin/lib/server/staff-opened-request.ts:77`) |
| `/support-attachments/[attachmentId]` | | NO HOME | file route used by messages |
| `/website` | `?response=approved\|changes-sent\|not-ready` and other notices | `/website` | `websiteNoticeHref` |
| `/project` | `?response=` | `/website` (+ notice) | already redirects |
| `/website/pages` | | `/website/pages` (plan makes it a real List; today it redirects to `/website`) | |
| `/website/preview-image` | | NO HOME | image route for the preview card |
| `/website/enquiries` | `?page=N` | `/enquiries` | page param has no equivalent (`?open=id` only) |
| `/website/enquiries/leads` | `?page=N` | `/enquiries` | already redirects |
| `/website/enquiries/name` | | `/enquiries` | already redirects |
| `/oyechats` | `?page=N` | `/enquiries` | already redirects |
| `/domain` | | `/website/domain` | in sent email "domain ready" (`apps/admin/lib/server/domain-ready.ts:37`) |
| `/content` | | `/website/blog` | already redirects |
| `/content/blog` | | `/website/blog` | |
| `/content/blog/new` | | `/website/blog/new` | |
| `/content/blog/[postId]` | | `/website/blog/[id]` | |
| `/content/blog/[postId]/preview` | | NO HOME | route handler opened in a new tab by the editor |
| `/content/blog/settings` | | `/website/blog/categories` | already redirects to `/content/categories` |
| `/content/authors`, `/new`, `/[authorId]` | | `/website/blog/authors[/new\|/id]` | plan lists only `/authors` (no new or id path given) |
| `/content/categories`, `/new`, `/[categoryId]` | | `/website/blog/categories[/new\|/id]` | same |
| `/details` | `#contact`, `#announcement`, `#hours`, `#assets` | `/business`, brand part `/business/brand` | |
| `/social` | `?notice=approved\|changed\|failed` | `/social` | |
| `/search` | | `/search` | |
| `/changelog` | | `/changelog` | |
| `/settings` | | `/settings` | |
| `/settings/privacy` | | `/settings/privacy` | |
| `/settings/privacy/export` | | NO HOME | JSON download route handler |
| `/settings/delete` | | `/settings/delete` | |
| `/affiliate` | | `/affiliate` | |
| `/affiliate/setup/[token]` | | `/affiliate/setup/[token]` | in sent email (`apps/admin/lib/server/affiliate-admin.ts:317`) |
| `/media/[mediaId]` | | NO HOME | image route |
| `/content-media/[mediaId]` | | NO HOME | blog media; customer sites embed these URLs (blog images in posts) |
| `/deliverable-images/[deliverableId]` | | NO HOME | social post images |
| `/product-photos/[photoId]` | | NO HOME | photo route |
| `/listing-pictures/[pictureId]` | | NO HOME | photo route (listing era) |
| `/advertise` | `?notice=` | NO HOME | referenced by `chargeReturnHref` for `directory_ad`; dormant |
| any other path | | `not-found` returning a real 404 | `app/app-host/[...missing]/page.tsx`, `global-not-found.tsx`; dormant directory and clinic paths (Listing, Leads, Reviews, Deals, Appointments, Patients) fall here today (`proxy.test.ts:87`) |

## 2.2 Non-page routes in `apps/platform` customers or their browsers call

Plan section 3 A3 keeps webhooks, `/api/site/*`, `/api/t`, `/api/leads`, `/api/pricing` and internal jobs in `apps/platform`. These customer-facing endpoints are NOT in A3 and have no owner in the plan:

| Route | Used by |
|---|---|
| `/api/uploads`, `/api/brand-assets`, `/api/product-photos`, `/api/content-media-uploads`, `/api/support-uploads` | browser upload clients on checklist, business profile, blog editor, requests (4 MB cap, own byte counting, origin check against `APP_ORIGIN`) |
| `/api/error-reports` | browser Sentry fallback (uses request host for origin) |
| `/api/privacy-requests/{otp,confirm,contribution,contribution/mine}` | privacy request flow (called from the website) |
| `/robots.txt` (`app/robots.ts`), `/.well-known/security.txt`, `/icon`, `/apple-icon`, `/favicon.ico` | root files |
| `/api/webhooks/{razorpay,calcom,oyechats}`, `/api/internal/*`, `/api/site/*`, `/api/t`, `/t/v1.js`, `/api/leads`, `/api/pricing` | stay (A3) |

If `apps/customer` becomes the app host, nginx must send the first group to `apps/platform` or they must be rebuilt; the same for the static files.

## 2.3 Customer links in `packages/email` templates (and who builds the URL)

Templates take a ready URL; the links below are built by callers. Templates with no customer-app link are listed last.

| Template | Link text | Built at | Path | New path |
|---|---|---|---|---|
| `password-reset.ts` | reset link | `apps/platform/lib/server/auth.ts:60` via `resetPasswordPath(token)` | `/reset-password/<token>` | same |
| `setup-link.ts` | setup link | `apps/admin/lib/server/invites.ts:43` | `/setup/<token>` | same |
| `affiliate-link.ts` | setup link | `apps/admin/lib/server/affiliate-admin.ts:317` via `affiliateSetupPath` (`packages/shared/src/lib/affiliate-links.ts:11`) | `/affiliate/setup/<token>` | same |
| `payment-received.ts` | Download your receipt | `packages/shared/src/server/payment-emails.ts:72` via `receiptDownloadHref` | `/billing/receipts?ids=<paymentId>` | `/billing/receipts` (keep query) |
| `payment-failed.ts` | Pay now | `packages/shared/src/server/payment-emails.ts:151` (`BILLING_PATH="/billing"`) | `/billing` | `/billing` (meaning changed: must land where the customer can pay) |
| `change-request-update.ts` | Open your request | `apps/admin/lib/server/request-notify.ts:25` | `/requests?open=<ticketId>` | `/requests/<id>` |
| `support-request-opened.ts` | request link | `apps/admin/lib/server/staff-opened-request.ts:77` | `/support/<ticketId>` | `/requests/<id>` |
| `domain-ready.ts` | project link | `apps/admin/lib/server/domain-ready.ts:37` | `/domain` | `/website/domain` |
| `preview-ready.ts` | preview link | `apps/admin/lib/server/project-preview.ts:52` (`previewUrl` from the project, a client-site preview address) | external preview URL | not a customer-app path; check what it points at |
| `website-live.ts`, `domain-moved.ts` | Visit site | `apps/admin/lib/server/project-launch.ts:68`, `domain-switch.ts:27` | the customer's own website | not a customer-app path |
| `signup-code.ts`, `privacy-request-code.ts`, `booking-code.ts` | a code, no link | | | none (`booking-code.ts` has no caller: dormant) |
| `listing-enquiry.ts` (`dashboardUrl`) | See all your enquiries | no caller found | | dormant |
| `lead-received.ts`, `onboarding-sent.ts`, `preview-approved.ts`, `preview-revisions-requested.ts`, `preview-changes-received.ts`, `domain-connected.ts`, `domain-requested.ts`, `privacy-request-alert.ts`, `security-alert.ts`, `support-*-alert.ts`, `staff-invite.ts`, `system-error-alert.ts` | staff-facing | console URLs (`/clients/<id>` on `ADMIN_ORIGIN`) | | out of scope |

Also sent already: Razorpay mandate and checkout URLs (`/billing/pay`, `/restore-account/keep-plan`) and the OyeChats and Cal.com booking return addresses (see kickoff and calls). Old `/onboarding/review?payment=` and `/billing?payment=` are stored in open provider sessions.

# Part 3. Guard functions and where each is called

Paths relative to `apps/platform`. `PROT` = `app/app-host/(protected)`.

| Guard | Defined | What it enforces |
|---|---|---|
| `requireSurfaceHost("app")` | `lib/server/surface-host.ts:13` | 404 unless the request host is the app host (backup for `proxy.ts`; not an access check) |
| `getSessionUser()` | `lib/server/session.ts` | session user or null |
| `getCustomerAccess()` | `lib/server/customer-tenant.ts:13` | `none`, `no-business`, `closing` (open closure found on staff db), or `granted` + tenant; React-cached |
| `requireCustomerAccess(opts)` | `lib/server/customer-access.ts:105` | closing to `/restore-account`; not granted to `/login`; unpaid owner (kind `listing`, signup choice managed) to `/plan` unless `membershipCheckout: "allow"`; listing kind to `/details` unless `listingAccount: "allow"`; then reads billing |
| `requireWebsiteClient()` | `customer-access.ts:122` | above, then paid client WITHOUT the website service goes to `/`; unpaid and lapsed pass |
| `requireBillingAccess()` | `lib/server/billing.ts:68` | throws `BillingRequiredError` unless paid |
| `requireWebsiteAccess()` | `billing.ts:75` | billing access AND website service, else `WebsiteRequiredError`. Only caller: `paidCustomerOrNull` (`blog-access.ts:14`), so blog, authors, categories and the Business contact, hours and announcement actions need the website service; the holiday actions use `holidayAccessOrNull` (no billing check) |
| `paidCustomerOrNull()` | `lib/server/blog-access.ts:13` | `requireWebsiteAccess()` with `BillingRequiredError` and `WebsiteRequiredError` turned into null so an action can answer "pay first" (message `PAID_PLAN_REQUIRED_MESSAGE`) |
| `holidayAccessOrNull()` | `lib/server/holiday-access.ts:11` | tenant via `getCustomerTenant` for closures actions |
| `getCustomerTenant()` | `customer-tenant.ts:30` | tenant or null, no billing; used by image and upload routes that answer a bare status |
| `getCustomerBilling()` / `getCustomerBusinessEntry()` | `customer-access.ts:28,46` | cached billing and business kind reads |
| `isAwaitingMembership(entry)` | `customer-access.ts:75` | the unpaid hold predicate |
| `getSupportAccess()` | `lib/server/support-access.ts:5` | support requester (user) from customer access; null otherwise |
| `getAffiliateAccess()` / `requireAffiliateAccess()` | `lib/server/affiliate-access.ts:21,29` | affiliate row by session user on the STAFF db; not affiliate to `/login` |
| `getStaffAccess()` | `lib/server/staff-access.ts:9` | staff session for a blog media route |
| `requireOwnedBlogPost` / `requireOwnedTaxonomyDoc` | `lib/server/blog.ts:119`, `blog-taxonomy.ts:85` | the CMS doc belongs to the session's business |
| `checkHuman(formData, action)` | `packages/shared/src/server/turnstile-request.ts` | Turnstile; actions `sign_in`, `join`, `forgot_password`, `reset_password`, `setup`, `affiliate_setup` |
| `assertWithinSetupRateLimit` | `lib/server/setup.ts:109` | 10 per hour per ip on invite redemption |
| `hasValidWebsiteToken(request, token)` | `lib/server/website-api-auth.ts:22` | shared secret for internal jobs and website calls |
| `requireAdminHost(handler)` | `lib/server/require-admin-host.ts:24` | Payload routes only (staff host) |

Call sites (page = P, action = A, route handler = R):

| Guard | Calls |
|---|---|
| `requireSurfaceHost("app")` | `app/app-host/layout.tsx:33` |
| `requireCustomerAccess()` plain | P: `PROT/page.tsx:38`, `requests/page.tsx:28`, `requests/new/page.tsx:26`, `requests/calls/page.tsx:16`, `search/page.tsx:14`, `social/page.tsx:19`, `details/page.tsx:38`. A: `setup-call-actions.ts:13,20,26`, `setup-actions.ts:16`, `website/actions.ts:26,50`, `details/actions.ts:42`, `details/brand-actions.ts:11`, `requests/actions.ts:35`, `requests/calls/actions.ts:42,62`, `requests/move-actions.ts:15`, `project/actions.ts:19`, `domain/actions.ts:21`, `billing/actions.ts:44`, `onboarding/{brand,business,content,domain}/actions.ts`, `onboarding/review/actions.ts:23,55,66`. R: `content/blog/[postId]/preview/route.ts:18` |
| `requireCustomerAccess({ listingAccount: "allow" })` | P: `billing/page.tsx:130`, `services/page.tsx:31`, `settings/page.tsx:49`, `billing/charges/[chargeId]/pay/page.tsx:44`, `billing/charges/confirm/page.tsx:48,79`. A: `services/actions.ts:24,44`, `billing/actions.ts:33` |
| `requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" })` | P: `PROT/layout.tsx:22`, `personalize/page.tsx:33`, `settings/privacy/page.tsx:26`, `settings/delete/page.tsx:23`, `billing/pay/page.tsx:33`, `billing/confirm/page.tsx:52,87` (const `PAYING`). A: `personalize/actions.ts:32,49,59`, `plan/actions.ts:38,76,86,100` (const `MEMBERSHIP_PAGE`), `billing/actions.ts:59,103` |
| `requireCustomerAccess(ANY_ACCOUNT)` | A: `settings/actions.ts:25,34,48`, `settings/privacy/actions.ts:15,25` |
| `requireWebsiteClient()` | layouts: `website/layout.tsx:7`, `content/layout.tsx:7`, `onboarding/layout.tsx:15`, `content/authors/new/layout.tsx:9`, `content/blog/new/layout.tsx:10`, `content/categories/new/layout.tsx:9`. P: `website/page.tsx:37`, `website/enquiries/page.tsx:26`, `domain/page.tsx:84`, `onboarding/page.tsx:8`, `onboarding/{business:18,brand:27,content:15,domain:19,review:240}/page.tsx`, `content/blog/page.tsx:28`, `content/blog/[postId]/page.tsx:31`, `content/authors/page.tsx:15`, `content/authors/[authorId]/page.tsx:17`, `content/categories/page.tsx:15`, `content/categories/[categoryId]/page.tsx:29`. A: `website/enquiries/actions.ts:25,42` |
| `requireBillingAccess()` | A: `social/actions.ts:20`, `requests/pay-actions.ts:21`, `onboarding/review/actions.ts:35` (inside a catch). `content/blog/actions.ts:94` only mentions it in a comment |
| `paidCustomerOrNull()` | A: `details/actions.ts:64,84,104`, `content/authors/actions.ts:37,57,77,103,114`, `content/blog/actions.ts:97,141,256,344,373,393,438,...`, `content/categories/actions.ts`, `content/blog/taxonomy-actions.ts` |
| `holidayAccessOrNull()` | A: `details/actions.ts:126,162` |
| `getCustomerAccess()` | P: `login/page.tsx:58`, `forgot-password/page.tsx:15`, `restore-account/page.tsx:29`, `restore-account/keep-plan/page.tsx:37,83`. A: `restore-account/actions.ts:11,22`. R: `billing/receipts/route.ts:100`, `settings/privacy/export/route.ts:16` |
| `getCustomerTenant()` | R: `media/[mediaId]/route.ts:13`, `product-photos/[photoId]/route.ts:16`, `listing-pictures/[pictureId]/route.ts:16`, `deliverable-images/[deliverableId]/route.ts:19`, `content-media/[mediaId]/route.ts:22`, `PROT/website/preview-image/route.ts:13`, `app/api/content-media-uploads/route.ts:72` (plus `getCustomerBilling` `:77`) |
| `getSupportAccess()` | A: `(support)/support/actions.ts:30,44`. R: `support-attachments/[attachmentId]/route.ts:14`, `app/api/support-uploads/route.ts:34,66` |
| `requireAffiliateAccess()` / `getAffiliateAccess()` | `affiliate/(portal)/layout.tsx:13`, `affiliate/(portal)/page.tsx:108`; `login/page.tsx:69`; `PROT/layout.tsx:32` (rail link) |
| `getStaffAccess()` | `content-media/[mediaId]/route.ts:22` |
| `requireOwnedBlogPost` | `content/blog/actions.ts:230,442,458,474` |
| `requireOwnedTaxonomyDoc` | `content/blog/actions.ts:211`, `content/authors/actions.ts:27`, `content/categories/actions.ts:37` |
| `checkHuman` | `login/actions.ts:21,40`, `forgot-password/actions.ts:17`, `reset-password/[token]/actions.ts:9`, `setup/[token]/actions.ts:18`, `affiliate/setup/[token]/actions.ts:19` |
| `hasValidWebsiteToken` | `app/api/internal/{roll-up-site-analytics,erase-closed-accounts,start-builds-after-kickoff,sync-site-hosting,retry-conversions}/route.ts`, `lib/server/lead-intake.ts:48`, `lib/server/privacy-request-intake.ts:61` |

Pages and actions with NO session guard of their own (public by design, or guarded by something else):

| Place | Why |
|---|---|
| `login`, `forgot-password`, `reset-password/[token]`, `setup/[token]`, `affiliate/setup/[token]` pages and actions | public; Turnstile and rate limits; `forgot-password` and `login` read access only to redirect |
| `PROT/project/page.tsx`, `todo`, `monitoring`, `oyechats`, `content/page.tsx`, `content/blog/settings`, `website/pages`, `website/enquiries/{leads,name}` | pure redirects; no data |
| `PROT/plan/page.tsx` | the guard is `requireCustomerAccess(membership allow)` inside `components/panel/membership/membership-page.tsx:45`, not in the page file |
| `PROT/changelog/page.tsx` | public data from `lib/changelog.ts`; reachable only inside the protected layout (layout guard only) |
| `(support)/support/page.tsx`, `[ticketId]/page.tsx` | redirects only |
| `app/app-host/error.tsx`, `not-found.tsx`, `[...missing]` | no data |
| `PROT/layout.tsx` | guards, but a layout is never the only guard (`surface-host.ts:7-10`); the page checks themselves |

Notes a rebuild must act on:
- `requireCustomerAccess` options are the only thing keeping an unpaid owner on `/plan` and a free listing off client pages. Plan rule 3 ("every page and action calls a guard itself") needs a single `requireUnpaid` / `requirePaid` pair that maps to these options.
- Website-service checks are inconsistent: blog, authors, categories and Business contact, hours, announcement actions require the website service (via `paidCustomerOrNull`); Social approve (`requireBillingAccess`), Business brand-asset remove (`requireCustomerAccess`, `details/brand-actions.ts:11`), ask-for-change and domain actions do not check which services are bought.
- `requireBillingAccess` is the only payment guard for mutating actions and it THROWS; callers either catch (`onboarding/review/actions.ts:35`) or use `paidCustomerOrNull`.
