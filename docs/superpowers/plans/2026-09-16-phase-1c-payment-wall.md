# Phase 1C: Payment Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new customer who sets their password lands in their dashboard and can look around everything they are about to get, with a banner and a locked marker on each part explaining that the first payment brings it to life. Nothing that writes anything can run until the payment clears. A fake payment provider stands in for Razorpay so the whole flow runs locally.

**Architecture:** Billing lives in its own workspace package (`@fynix/billing`) holding the provider interface, the Razorpay status mapping and the pure access rule, so none of that logic is tangled into Next.js. The database gains `plans`, `subscriptions` and `payments`. Website and dashboard visibility is *derived* from the subscription row at read time and never stored, so reactivation later writes one row and nothing else. The fake provider implements the same interface Razorpay will, and swapping it is one environment variable.

**Tech Stack:** pnpm workspace, Next.js 16 App Router (server actions, `proxy.ts`), drizzle-orm + PostgreSQL 14 with RLS, Better Auth, zod 4, Vitest.


> **Status (2026-09-16): resumed and built** after the customer dashboard (Phase 2).
> - **Done:** Tasks 1–4; the stale-checkout cancel (`openCheckoutSubscription`); `markLeadPaidForBusiness` inside
>   `recordPaymentAndActivate` (found through `leads.business_id` or `setup_invites.business_id`); `BILLING_PROVIDER`
>   in `.env.example` and the verify configs; a one-hour expiry signed into the fake confirm token; Tasks 5–8 as
>   reshaped by "Payment happens at the end of setup" below; Task 9 trimmed (payment state on Clients and the client
>   page, "Paying customers" on the Overview, and an admin-only "Record a manual payment" with provider `manual`,
>   migration 0017).
> - **How confirmation stays atomic:** one staff transaction records the payment, opens the subscription, marks the
>   lead paid and then switches to `fynix_app` with `SET LOCAL ROLE` (`withCustomerRole`, migration 0018) to send
>   onboarding through the same guarded transition and checklist as the Send button. A checklist failure rolls back
>   only that savepoint.
> - **Not done:** Task 10's browser walk-through, and everything under "Deliberately not in this phase".
> - **Security review fixes (2026-09-16), migration 0020:**
>   - A correctly signed confirmation for a checkout we replaced or cancelled, for a business that already has
>     access, or for an amount that is not the plan's is now **recorded** (`captured`, with
>     `payments.attention_reason`), activates nothing, is logged (`[fynix:billing] confirmation-refused`), and the
>     customer is told *"We've received your payment. Our team will be in touch shortly to sort out your account."*
>     Staff see it under "Payments needing attention" (Overview and the client page) and an admin marks it sorted.
>     While one is open the customer is not offered another payment. A failed submission after a recorded payment is
>     flagged the same way (`submission_failed`) and logged as `submission-failed-after-payment`.
>   - `BillingProvider.cancelSubscription` exists; replacing a checkout (stale, other plan, or an admin's manual
>     payment) cancels the old one at the provider after the database commit, logging failures. Starting a checkout
>     now decides under a `FOR NO KEY UPDATE` lock, commits, calls the provider with no transaction open, then records
>     the new subscription in a second short transaction; an orphan (state changed meanwhile, or the record failed) is
>     cancelled at the provider and logged.
>   - Billing state reads the newest subscription whatever its status, so a cancelled subscription keeps access until
>     `paidThroughAt`; a business that has ever paid is "needs reactivation", never a new first payment.
>   - The fake provider is refused on a real deployment unless `FYNIX_ALLOW_FAKE_BILLING=1`. Manual payments store
>     who recorded them, a bank or payment reference, and the date the money arrived. Staff can no longer choose
>     `paid` or `account_created` for a lead, or move a lead out of either.
>   - **For the Razorpay adapter:** the webhook path (Razorpay notifying us directly, not the customer returning from
>     checkout) must reach the same outcomes as `confirmFirstPayment`: record every captured payment it is told about,
>     idempotently, flag and log one that cannot be applied instead of dropping it, and never activate from it. It
>     must also implement `cancelSubscription` for real (Razorpay's cancel endpoint), which the replace paths already
>     call.

---

## Payment happens at the end of setup (decided 2026-09-16, supersedes Tasks 6–8 below where they differ)

The user asked for payment to be tied to "any changes" and for the banner to say payment is what gets the website
live. The recommended flow, written from the customer's side:

- **Check and send** is where payment happens. It shows every section with an Edit link and asks *"Everything look
  right? You can still change anything — once you pay, we start building and your answers lock."* The single button is
  **Pay {amount} and send**.
- Starting checkout requires the onboarding checklist to pass on the server; a customer can't pay for a build we can't
  start.
- **Confirming the payment** does, in one transaction: record the payment, activate the subscription, submit the
  project (the same guarded `onboarding → submitted` transition), and mark the lead paid. If the checklist no longer
  passes at that moment (answers edited in another tab), the payment is still recorded and the project stays open; the
  page says *"Payment received — one thing is missing before we can start"* and links to it, and **Send it to us**
  then works without paying again.
- If payment fails or is abandoned, nothing locks.
- **The banner**, on every dashboard page until the first payment: *"Make your payment to continue — once it's done,
  we start building your website and get it live."* Its button is **Finish setup →** (to the next unfinished step)
  while setup is incomplete, and **Pay {amount} →** (to Check and send) once it's complete. It never points at a
  payment the customer can't make yet.
- `/billing` is for receipts once paid. Unpaid, it explains that payment happens at the end of setup and links there.
- Drafts stay free before payment; the lock comes only with a confirmed payment and submission.
- **Refunds (confirmed by the user, 2026-09-16):** because payment and sending now happen together, the old rule
  "refund only before onboarding is sent" could never apply. The rule is now: full refund of the first payment within
  7 days of paying, as long as the project hasn't moved to `building`. Refunds themselves are not in this phase.

---

## Ground rules for the engineer

- **Read before writing.** `docs/superpowers/specs/2026-09-15-fynix-platform-design.md` §4.2 (billing tables), §5.2 (subscription lifecycle), §5.4 (visibility) is the source of truth. Where this plan and the spec disagree, this plan wins — it carries decisions made after the spec was written.
- **No grace period.** The customer's decision, overriding the spec's softer wording: the moment a subscription is not paid for, access ends. There is no "one failed payment is fine" window. Razorpay `pending` (still retrying) keeps access; `halted` does not.
- **The wall is on the actions, not the door** (decided 2026-09-16, overriding the spec's "sees only the payment screen"). An unpaid customer can open the dashboard and read every screen, so they can see what they are buying. They cannot submit onboarding, request anything, publish anything, or cause any write. Locked parts say so plainly and point at the payment.
- **Enforce locking on the server, every time.** A disabled button is a courtesy, not a control. Every mutating action re-checks billing access itself and refuses. Assume the customer can call any server action directly, because they can.
- **The first payment is not a build fee.** It is the first month of the subscription ($75 or ₹2,500 since 2026-09-16; originally $225 for three months). Never call it anything else in code comments, copy or admin.
- **Money is integer cents (or paise), always.** No floats anywhere. The existing `formatPrice` in `apps/web/lib/pricing.ts` is for marketing copy only; dashboard amounts are formatted from the plan row.
- **Do not commit.** The user keeps this repo uncommitted for now.
- **Do not start a dev server.** The user runs their own on port 3000. A verification server exists on 3100 (`.claude/launch.json`, config `fynix-verify`), which needs `pnpm build` first.
- Checkpoint after every task: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Database tasks also run `pnpm --filter @fynix/db test:integration`.

---

### Task 1: Currency on the lead and the business

Staff set the currency when they send the setup link; it is never guessed from an IP at charge time. India is billed in INR, everywhere else in USD.

**Files:**
- Modify: `packages/db/src/schema/leads.ts`, `packages/db/src/schema/businesses.ts`
- Create: `packages/db/migrations/0008_billing_currency.sql`
- Modify: `packages/db/src/queries/leads.ts`, `packages/db/src/queries/onboarding.ts`
- Modify: `apps/web/app/admin-host/(protected)/leads/[leadId]/page.tsx`, `.../actions.ts`
- Test: `packages/db/src/funnel.integration.test.ts`

- [ ] **Step 1: Add the enum and columns to the schema**

In `packages/db/src/schema/leads.ts`, beside `leadStatus`:

```ts
/** What the customer is charged in. India is billed in INR; every other country in USD. */
export const billingCurrency = pgEnum("billing_currency", ["USD", "INR"]);
export type BillingCurrency = (typeof billingCurrency.enumValues)[number];
```

Add to the `leads` table, after `businessType`:

```ts
    /** Set by staff on the call, never inferred from an IP address. */
    currency: billingCurrency("currency").notNull().default("USD"),
```

Add the same column to `businesses` in `packages/db/src/schema/businesses.ts` (import `billingCurrency` from `./leads`).

- [ ] **Step 2: Generate and annotate the migration**

```bash
pnpm --filter @fynix/db exec drizzle-kit generate --name billing_currency
```

Open the generated `packages/db/migrations/0008_billing_currency.sql` and add a comment at the top explaining that existing rows default to USD because every customer so far is outside India.

- [ ] **Step 3: Carry the currency through the queries**

`packages/db/src/queries/leads.ts`: add `currency` to `NewLead`, `Lead` and `LEAD_COLUMNS`. `NewLead.currency` is optional (`BillingCurrency | undefined`) — the public form never sets it.

`updateLead`'s input type gains `currency?: BillingCurrency` so staff can change it.

`packages/db/src/queries/onboarding.ts`: `insertBusiness` takes the currency and writes it, and `redeemInviteIntoBusiness` reads it from the lead so the business inherits what staff chose.

- [ ] **Step 4: Let staff set it**

In the admin lead detail page's "Update this lead" form, add a `<select name="currency">` beside Status with the two options, defaulted to the lead's current value. Labels: `USD ($)` and `INR (₹)`. Parse it in `updateLeadDetails` with `z.enum(["USD", "INR"])` and pass it through.

Also show the currency in the read-only `<dl>` at the top of the page.

- [ ] **Step 5: Integration test**

In `packages/db/src/funnel.integration.test.ts`, extend the redemption test to assert the business inherits the lead's currency, and add a case where the lead is INR.

Run: `pnpm --filter @fynix/db test:integration`
Expected: all pass.

---

### Task 2: Billing tables

**Files:**
- Create: `packages/db/src/schema/billing.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0009_billing.sql` (generated), `packages/db/migrations/0010_billing_grants.sql` (hand-written)

- [ ] **Step 1: Write the schema**

Create `packages/db/src/schema/billing.ts`:

```ts
import { index, pgEnum, pgTable, text, timestamp, integer, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { billingCurrency } from "./leads";
import { createdAt, updatedAt } from "./columns";

export const billingProvider = pgEnum("billing_provider", ["fake", "razorpay"]);
export type BillingProviderName = (typeof billingProvider.enumValues)[number];

/** Our own status, mapped from whatever the provider calls it. See packages/billing. */
export const subscriptionStatus = pgEnum("subscription_status", [
  "incomplete",
  "active",
  "past_due",
  "inactive",
  "cancelled",
]);
export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];

export const paymentKind = pgEnum("payment_kind", ["initial", "renewal", "reactivation", "extra_publish"]);
export const paymentStatus = pgEnum("payment_status", ["captured", "failed", "refunded"]);

/** One row per currency. The price the customer sees and is charged comes from here, never from copy. */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    currency: billingCurrency("currency").notNull(),
    /** Paid up front, covering the first `initialTermMonths` months of subscription. */
    initialAmountCents: integer("initial_amount_cents").notNull(),
    initialTermMonths: integer("initial_term_months").notNull(),
    /** Charged every month once the initial term ends. */
    recurringAmountCents: integer("recurring_amount_cents").notNull(),
    includedPublishesPerMonth: integer("included_publishes_per_month").notNull(),
    extraPublishAmountCents: integer("extra_publish_amount_cents").notNull(),
    /** Null until the provider's own plan exists; the fake provider never needs one. */
    providerPlanId: text("provider_plan_id"),
    active: text("active").notNull().default("yes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("plans_currency_active_idx").on(table.currency).where(sql`${table.active} = 'yes'`)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    planId: uuid("plan_id").notNull().references(() => plans.id),
    provider: billingProvider("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    /** Exactly as the provider reported it, for support and for reconciliation. */
    providerStatus: text("provider_status"),
    status: subscriptionStatus("status").notNull().default("incomplete"),
    /** When the first payment was confirmed. Null until then. */
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    /** End of the paid-up-front term. */
    commitmentEndsAt: timestamp("commitment_ends_at", { withTimezone: true }),
    /**
     * The end of the period the customer has paid for. The single input to the access rule:
     * past it, with a status that is not active, the dashboard and the website are closed.
     */
    paidThroughAt: timestamp("paid_through_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subscriptions_provider_id_idx").on(table.provider, table.providerSubscriptionId),
    // A business may have many cancelled subscriptions over time, but only ever one live one.
    uniqueIndex("subscriptions_one_live_per_business_idx")
      .on(table.businessId)
      .where(sql`${table.status} <> 'cancelled'`),
    index("subscriptions_business_id_idx").on(table.businessId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    provider: billingProvider("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    kind: paymentKind("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: billingCurrency("currency").notNull(),
    status: paymentStatus("status").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payments_provider_id_idx").on(table.provider, table.providerPaymentId),
    index("payments_business_id_idx").on(table.businessId, table.createdAt),
  ],
);
```

Export everything from `packages/db/src/schema/index.ts`.

- [ ] **Step 2: Generate the migration**

```bash
pnpm --filter @fynix/db exec drizzle-kit generate --name billing
```

- [ ] **Step 3: Seed the two plans in the same migration**

Append to the generated `0009_billing.sql`:

```sql
-- The live plans. Prices are decided in docs/superpowers/specs/2026-09-15-fynix-platform-design.md §1.
INSERT INTO plans (id, code, name, currency, initial_amount_cents, initial_term_months,
                   recurring_amount_cents, included_publishes_per_month, extra_publish_amount_cents)
VALUES
  (gen_random_uuid(), 'care-usd', 'Fynix care plan', 'USD', 22500, 3, 7500, 3, 300),
  (gen_random_uuid(), 'care-inr', 'Fynix care plan', 'INR', 750000, 3, 250000, 3, 30000)  -- corrected by a later migration: see below
ON CONFLICT (code) DO NOTHING;
```

INR is in paise: ₹2,500 = 250000.

**Correction (2026-09-16):** the user confirmed that the Indian plan has no three-month start. Its first payment is ₹2,500 covering one month, then ₹2,500 a month. The seed above had already run, so the fix ships as a later migration: `care-inr` becomes `250000` initial over `1` month. Every screen must therefore take the term from `plan.initialTermMonths` and handle the singular ("your first month").

**Price change (2026-09-16):** the user dropped the USD three-month start too. Every plan is now monthly from the first payment: $75 a month, or ₹2,500 a month. Migration `0021_usd_monthly_plan.sql` sets `care-usd` to `7500` initial over `1` month, and `seedPlansFromMigrations` replays it in tests. `describePlanTerms` reads "$75 a month. Your first payment covers your first month, then it renews monthly." when the first payment equals the monthly price. The marketing copy no longer mentions three months; `carePlan.firstTermCents` is gone.

- [ ] **Step 4: Grants and RLS**

Create `packages/db/migrations/0010_billing_grants.sql` by hand, following `0004_funnel_grants.sql` exactly:

```sql
-- Customers read their own billing rows and never write them: every write is a consequence of a
-- provider event, applied by the app's own code paths under the staff role.
GRANT SELECT ON plans TO fynix_app, fynix_staff;
GRANT SELECT ON subscriptions, payments TO fynix_app;
GRANT SELECT, INSERT, UPDATE ON subscriptions, payments TO fynix_staff;

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_readable ON plans FOR SELECT TO fynix_app, fynix_staff USING (true);

CREATE POLICY subscriptions_tenant_read ON subscriptions
  FOR SELECT TO fynix_app
  USING (business_id = current_business_id());

CREATE POLICY payments_tenant_read ON payments
  FOR SELECT TO fynix_app
  USING (business_id = current_business_id());

CREATE POLICY subscriptions_staff_all ON subscriptions FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
CREATE POLICY payments_staff_all ON payments FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

Check `current_business_id()`'s exact name in `0001_rls_and_grants.sql` before writing this and match it.

- [ ] **Step 5: Apply and verify**

```bash
pnpm db:migrate && pnpm db:migrate:test
```
Expected: "Migrations applied" twice, no errors.

---

### Task 3: Billing queries

**Files:**
- Create: `packages/db/src/queries/billing.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/billing.integration.test.ts`

- [ ] **Step 1: Write the queries**

`findActivePlan(db, currency)` → the active plan row for that currency, or null.
`findSubscriptionForBusiness(db, businessId)` → the one non-cancelled subscription, or null.
`insertSubscription(db, input)` → creates an `incomplete` subscription.
`recordPaymentAndActivate(db, input)` → **one transaction**: insert the payment, then update the subscription to `active` with `activatedAt`, `commitmentEndsAt`, `paidThroughAt` and `currentPeriodEnd`. Both rows or neither; a half-applied payment is the one outcome that must be impossible.
`listPaymentsForBusiness(db, businessId, limit)` → newest first, for the receipts list.

Use the explicit column projections the other query modules use (`SUBSCRIPTION_COLUMNS`, `PAYMENT_COLUMNS`), and widen the `db` parameter to `Runner = Database | ScopedTransaction` where a caller may pass a transaction, as `queries/invites.ts` does.

`recordPaymentAndActivate` must be idempotent on `(provider, providerPaymentId)`: use `onConflictDoNothing` and, when nothing was inserted, return the existing payment without touching the subscription. The provider will deliver the same event twice sooner or later.

- [ ] **Step 2: Integration tests**

New file `packages/db/src/billing.integration.test.ts`, modelled on `funnel.integration.test.ts` (same `openTestDatabases` / `resetTestDatabase` setup):

- the seeded plans exist, one per currency, and `findActivePlan` picks the right one
- a business may not have two non-cancelled subscriptions (the partial unique index rejects the second)
- `recordPaymentAndActivate` sets status, `activatedAt`, `commitmentEndsAt` (3 months on) and `paidThroughAt` in one go
- calling it twice with the same provider payment id records one payment and does not move the dates
- the app role can read its own subscription but **cannot** insert or update one (`captureErrorText` + `/permission denied/`)
- the app role cannot read another tenant's subscription (set the tenant GUC to a different business and expect no rows)

Run: `pnpm --filter @fynix/db test:integration`

---

### Task 4: The `@fynix/billing` package

**Files:**
- Create: `packages/billing/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/status.ts`, `src/access.ts`, `src/provider.ts`, `src/fake-provider.ts`
- Test: `packages/billing/src/status.test.ts`, `src/access.test.ts`, `src/fake-provider.test.ts`
- Modify: `apps/web/package.json`, `apps/web/next.config.ts` (`transpilePackages`)

Copy `packages/email/package.json` and its tsconfig/vitest config as the template — same shape, same scripts.

- [ ] **Step 1: The status mapping (pure)**

`src/status.ts`:

```ts
import type { SubscriptionStatus } from "@fynix/db";

/**
 * Razorpay's vocabulary, mapped to ours. `pending` means Razorpay is still retrying a failed charge and
 * the customer keeps access; `halted` means it has given up, and access ends immediately.
 */
const RAZORPAY_STATUS: Record<string, SubscriptionStatus> = {
  created: "incomplete",
  authenticated: "active",
  active: "active",
  pending: "past_due",
  halted: "inactive",
  paused: "inactive",
  cancelled: "cancelled",
  completed: "cancelled",
  expired: "cancelled",
};

export function mapRazorpayStatus(providerStatus: string): SubscriptionStatus {
  return RAZORPAY_STATUS[providerStatus] ?? "incomplete";
}
```

Test every key, plus an unknown string falling back to `incomplete`.

- [ ] **Step 2: The access rule (pure)**

`src/access.ts`:

```ts
export interface BillingAccessInput {
  readonly status: SubscriptionStatus;
  readonly paidThroughAt: Date | null;
}

/**
 * The single rule behind both the dashboard wall and website visibility.
 *
 * There is no grace period: the customer's decision is that access ends the moment the subscription is not
 * paid for. `past_due` keeps access because the provider is still retrying and the period is still paid;
 * `inactive` (retries exhausted) does not. A cancelled subscription keeps access until the period the
 * customer already paid for runs out.
 */
export function hasBillingAccess(subscription: BillingAccessInput | null, now: Date): boolean {
  if (subscription === null) return false;
  if (subscription.status === "incomplete") return false;
  // Retries exhausted: access ends now, whatever period was paid. This is the "no grace period" rule.
  if (subscription.status === "inactive") return false;
  if (subscription.paidThroughAt === null) return false;
  return subscription.paidThroughAt.getTime() > now.getTime();
}
```

Tests: null subscription → false; `incomplete` → false even with a future `paidThroughAt`; `active` with a future date → true; `active` with a past date → false; `past_due` with a future date → true; **`inactive` → false even with a future `paidThroughAt`** (corrected after review: the first draft of this rule let a halted subscription through until its paid period ran out, which is exactly the grace period the customer ruled out); `cancelled` with a future date → true (they paid for it); exactly `now` → false.

- [ ] **Step 3: The provider interface**

`src/provider.ts`:

```ts
export interface StartCheckoutInput {
  readonly businessId: string;
  readonly businessName: string;
  readonly email: string;
  readonly plan: Plan;
}

export interface StartedCheckout {
  readonly providerSubscriptionId: string;
  /** Where the customer completes payment. The fake provider returns a local URL. */
  readonly checkoutUrl: string;
}

export interface ConfirmedPayment {
  readonly providerSubscriptionId: string;
  readonly providerPaymentId: string;
  readonly amountCents: number;
  readonly currency: BillingCurrency;
  readonly paidAt: Date;
}

export interface BillingProvider {
  readonly name: BillingProviderName;
  startCheckout(input: StartCheckoutInput): Promise<StartedCheckout>;
  /** Verifies whatever the provider handed back and returns the payment to record. Throws if it doesn't check out. */
  confirmCheckout(payload: unknown): Promise<ConfirmedPayment>;
}
```

- [ ] **Step 4: The fake provider**

`src/fake-provider.ts`: `createFakeBillingProvider()` returns a `BillingProvider` whose `startCheckout` mints `fake_sub_<random>` and returns `/billing/confirm?token=<signed>`, and whose `confirmCheckout` verifies that token and returns a payment of the plan's initial amount, `paidAt: new Date()`.

Sign the token with HMAC-SHA256 over `providerSubscriptionId|amountCents|currency` using `BETTER_AUTH_SECRET`, so a customer cannot mint their own confirmation by editing the URL. Compare with `timingSafeEqual`. This is the one piece of the fake provider that must be written as if it were real, because it is the thing standing between a URL and an unlocked dashboard.

Tests: a token round-trips; a tampered amount is rejected; a token signed with a different secret is rejected; a malformed token is rejected.

---

### Task 5: Billing state, and locking the actions rather than the door

**Files:**
- Modify: `apps/web/lib/server/customer-access.ts`
- Create: `apps/web/lib/server/billing.ts`
- Test: `apps/web/lib/server/billing.test.ts`

- [ ] **Step 1: Load the subscription with the tenant**

`getCustomerAccess` already resolves the user and their business. Extend its `granted` result with
`billing: { hasAccess: boolean; subscription: Subscription | null; plan: Plan | null }`, read through the app
(RLS-scoped) connection, using `hasBillingAccess` from `@fynix/billing`. The plan comes from the business's
currency, so every screen can name the real price without a second query.

One query per request: the layout, the banner and the billing page all read the same result.

- [ ] **Step 2: `requireBillingAccess`**

In `apps/web/lib/server/billing.ts`:

```ts
/**
 * The guard every mutating customer action runs first. The dashboard is readable before payment so people can
 * see what they are buying; nothing that writes may run until the first payment has cleared. A disabled button
 * in the browser is a courtesy, not a control: a server action can be called directly.
 */
export async function requireBillingAccess(): Promise<CustomerAccessGranted> {
  const access = await requireCustomerAccess();
  if (!access.billing.hasAccess) throw new BillingRequiredError(access.tenant.businessId);
  return access;
}
```

`BillingRequiredError` carries no customer-facing copy; each caller decides what to show.

There are no customer write actions yet, so nothing calls it in this phase beyond its own test. Onboarding is
its first caller, and it must be wired in the same commit that introduces onboarding.

- [ ] **Step 3: No redirect in the protected layout**

Leave the layout's routing alone. `/billing` sits outside `(protected)` so the payment screen stays reachable
in every state, but there is no bounce in either direction: an unpaid customer opening `/` sees the dashboard
in preview, and a paid customer opening `/billing` sees their receipts.

- [ ] **Step 4: Unit tests**

Mock `@fynix/db` and `./auth` the way `apps/web/lib/server/sign-in.test.ts` does, and assert: no subscription
→ no access; `incomplete` → no access; active with a future `paidThroughAt` → access; and that
`requireBillingAccess` throws for the first two and returns for the third.

### Task 6: The payment screen

**Files:**
- Create: `apps/web/app/app-host/billing/page.tsx`, `apps/web/app/app-host/billing/actions.ts`, `apps/web/components/panel/payment-wall.tsx`
- Create: `apps/web/lib/money.ts` + test

- [ ] **Step 1: Money formatting**

`apps/web/lib/money.ts`: `formatMoney(cents, currency)` using `Intl.NumberFormat` with `USD` → `en-US` and `INR` → `en-IN`, no decimals when the amount is whole. Tests: `22500, "USD"` → `$225`; `750000, "INR"` → `₹7,500`; `7500, "USD"` → `$75`; `250000, "INR"` → `₹2,500`.

- [ ] **Step 2: The screen**

Heading: `One more step, {firstName}.` Then, in a card:

- What they are paying for: `{formatMoney(plan.initialAmountCents)} covers your first {plan.initialTermMonths} months.` and `After that it's {formatMoney(plan.recurringAmountCents)} a month, and you can stop any time.`
- A short list of what starts once it clears: we begin your onboarding, your website is designed and built, and it stays looked after every month. No invented timelines.
- The primary button: `Pay {formatMoney(plan.initialAmountCents)}` → the `startCheckout` action.
- Underneath, quietly: `Changed your mind? You can ask for a full refund within 7 days, as long as we haven't started your onboarding.` (Refund handling itself is Task 10 of a later phase — the sentence is true as a policy statement and the button comes later.)

When the provider is the fake one, the button's label stays the same but the destination is the local confirm page. **Never** render a "simulate payment" control that would exist in production; the fake provider's confirm page is itself the simulator, and it is only reachable because `BILLING_PROVIDER=fake`.

- [ ] **Step 3: The action**

`startCheckout` (server action):
1. `requireCustomerAccess()`, and return early if they already have access.
2. Load the plan for `business.currency`; throw a clear error if no active plan exists for it.
3. Reuse an `incomplete` subscription created in the last 24 hours; otherwise create one.
4. `provider.startCheckout(...)`, store `providerSubscriptionId`, `redirect(checkoutUrl)`.

Rate-limit it per business (10/hour) with `consumeRateLimit`, so a stuck button cannot spray subscriptions at the provider.

---

### Task 7: Confirming the payment

**Files:**
- Create: `apps/web/app/app-host/billing/confirm/page.tsx`, `.../actions.ts`
- Modify: `apps/web/lib/server/billing.ts`

- [ ] **Step 1: The confirm page**

Reads `?token=`, hands it to `provider.confirmCheckout`, and on success calls `recordPaymentAndActivate` with `kind: "initial"`, `paidThroughAt = now + plan.initialTermMonths months` and `commitmentEndsAt` the same, then redirects to `/`.

The write needs the staff connection (customers may not write billing rows) — add a comment at the call site saying so, matching the exception already documented in `apps/web/lib/server/db.ts`.

On a bad token: no write, and a plain screen saying the payment could not be confirmed with a link back to `/billing`. Never echo the token.

- [ ] **Step 2: Make it idempotent end to end**

Refreshing the confirm page must not create a second payment. The `onConflictDoNothing` in `recordPaymentAndActivate` covers the row; the page must also cope with the subscription already being active and simply redirect.

- [ ] **Step 3: Update the lead**

When the initial payment lands, set the lead's status to `paid` (the lead is reachable through `setup_invites.business_id`). Do it in the same transaction as the payment.

---

### Task 8: The dashboard before and after payment

**Files:**
- Modify: `apps/web/app/app-host/(protected)/page.tsx`, `apps/web/app/app-host/(protected)/layout.tsx`
- Create: `apps/web/components/panel/billing-banner.tsx`, `apps/web/components/panel/feature-preview.tsx`

- [ ] **Step 1: The banner**

Rendered by the protected layout, above the page, whenever `billing.hasAccess` is false. Not dismissible: it is
the one thing the customer needs to do.

- Line: `Your dashboard is in preview.`
- Then: `Make your first payment and we'll start building your website.`
- Button: `Pay {formatMoney(plan.initialAmountCents, plan.currency)}` → `/billing`.

Use the brand's own colours, not a warning yellow. This is an invitation, not an error.

- [ ] **Step 2: A tour of what they get**

The dashboard home lists what the plan includes, in the order it will happen: tell us about your business, we
design it, we build it, you review it with two rounds of changes included, we put it live, and you edit your
own text, images and blog posts afterwards with three free publishes a month.

Each item is a `FeaturePreview` card: title, one plain sentence, and — while unpaid — a small `Live once you
pay` marker. No dates, no invented timelines, and no links to screens that do not exist yet.

Once paid, the same list simply loses its markers; it never marks a current stage, because the next-step card
above it already says what's next. Write it so the paid and unpaid views are the same component with a `locked`
flag, never two copies of the copy.

- [ ] **Step 3: Receipts**

On `/billing`, when the customer has access, show: the plan, what they paid, when, what happens next
(`Your next payment is {formatMoney(recurring)} on {date}`), and the payment history from
`listPaymentsForBusiness`.

### Task 9: Admin sees the money

**Files:**
- Modify: `apps/web/app/admin-host/(protected)/leads/[leadId]/page.tsx`, `apps/web/app/admin-host/(protected)/page.tsx`
- Create: `apps/web/app/admin-host/(protected)/businesses/page.tsx` and `.../[businessId]/page.tsx`

- [ ] **Step 1: A businesses list**

Staff need somewhere to see who has paid. A table of businesses with: name, currency, subscription status, paid through, and the date of the last payment. Newest first, same visual language as the leads list.

- [ ] **Step 2: A business detail page**

Subscription row, plan, payment history, and — for admins only — a "Record a manual payment" action for the case where money arrived outside the provider (a bank transfer). It writes a payment with `provider: "fake"` and a clear provider id (`manual_<uuid>`), and goes through the same `recordPaymentAndActivate`, so there is one activation path and not two.

- [ ] **Step 3: The overview counts**

Add "Paying customers" to the admin overview stats.

---

### Task 10: End-to-end verification

- [ ] **Step 1: Build and start the verification server**

```bash
pnpm build
```
Then start `fynix-verify` (port 3100) through the preview tooling.

- [ ] **Step 2: Walk the whole funnel**

1. Submit the Get started form.
2. As staff: set the lead's currency, send the setup link.
3. Open the link from the Dev outbox, set a password.
4. **Expect the dashboard in preview**: the banner at the top, the tour readable, every part marked as locked, and no redirect anywhere.
5. Pay with the fake provider. Expect the dashboard, and the lead marked `paid`.
6. Refresh the confirm URL. Expect exactly one payment row.
7. As staff: confirm the business shows as paying with the right currency and paid-through date.
8. In the database, set `paid_through_at` into the past and reload the dashboard. Expect the banner and the locked markers to return, with the content still intact behind them.

- [ ] **Step 3: Clean up**

Delete the trial rows: payments, subscriptions, businesses, business_members, users, setup_invites, email_messages, leads and rate_limit_buckets created during the walk. Leave the seeded plans.

---

## Deliberately not in this phase

- **Razorpay itself.** The adapter implements the same interface; it lands once the account has international, USD and recurring card payments enabled.
- **Webhooks, the `payment_event` inbox, reconciliation and the paid-through sweep.** They matter only with a real provider.
- **Refunds.** The "Request refund" button, the staff resolution flow and `refund_request` come next, together with the 7-day / before-onboarding rule.
- **Website visibility.** `hasBillingAccess` is written here and used by the dashboard; hosting customer websites is a later phase.
- **Onboarding, projects, previews and content editing.** Everything the dashboard will eventually hold.
