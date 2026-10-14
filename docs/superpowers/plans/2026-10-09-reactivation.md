# Reactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer whose plan has lapsed presses Reactivate and pays again (or staff record a bank transfer), on the
same tier at today's price, with no coupon; the website returns when the payment is recorded.

**Architecture:** Reactivating opens a new subscription through the existing checkout path. `decideCheckout` replaces a
lapsed live subscription the way it replaces a stale unpaid one, and `cancelStaleSubscription` is widened to end a live
row that grants no access. A first charge on a new subscription for a business that has paid before is recorded by a
new `activateReactivationPayment` (kind `reactivation`, recurring price, no lead, membership or affiliate side effects).
The Razorpay webhook also stops activating a `cancelled` subscription: that charge is recorded as `checkout_replaced`.

**Tech Stack:** TypeScript, Next.js 16 server actions, Drizzle on PostgreSQL, Vitest, Razorpay.

**Spec:** `docs/superpowers/specs/2026-10-09-reactivation-design.md`

**Commands:** unit tests `pnpm --filter <pkg> exec vitest run <file>`; integration `pnpm test:integration` (migrates
`fynix_platform_test`); all checks `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

## File map

| File | Change |
|---|---|
| `packages/billing/src/checkout.ts` | `needs-reactivation` removed; a lapsed live row is `replace`d |
| `packages/db/src/queries/billing.ts` | `cancelStaleSubscription` ends lapsed live rows; `hasEverPaid` exported |
| `packages/db/src/index.ts` | export `hasEverPaid` |
| `packages/shared/src/server/billing-activation.ts` | `activateReactivationPayment` |
| `apps/platform/lib/server/razorpay-webhook-handler.ts` | cancelled subscription → `checkout_replaced`; reactivation path |
| `apps/platform/lib/server/payment-confirmation.ts` | fake provider: reactivation path and `reactivated` outcome |
| `apps/platform/app/app-host/billing/confirm/page.tsx` | `reactivated` → Billing |
| `apps/platform/lib/server/checkout.ts` | no coupon when paid before; `startReactivationFor` |
| `apps/platform/app/app-host/(protected)/billing/actions.ts` | `reactivateAction` |
| `apps/platform/components/panel/billing/reactivate-plan.tsx` | new: the lapsed customer's plan card |
| `apps/platform/app/app-host/(protected)/billing/page.tsx` | lapsed → `ReactivatePlan`; `?payment=` notice |
| `apps/platform/components/panel/billing/plan-summary.tsx` | `lapsed` prop removed |
| `apps/platform/app/app-host/billing/pay/page.tsx`, `pay/callback/route.ts` | returning clients come back to Billing |
| `packages/shared/src/lib/billing/payment-step.ts` | lapsed banner → Reactivate; `contact` kind removed; message rewritten |
| `apps/platform/components/panel/billing-banner.tsx` | `contact` branch removed |
| `apps/admin/lib/server/billing-admin.ts` | bank transfer reactivates |
| `packages/shared/src/lib/billing/manual-payment-notices.ts` | `needs-reactivation` removed |

---

### Task 1: decideCheckout replaces a lapsed subscription

**Files:** Modify `packages/billing/src/checkout.ts`; Test `packages/billing/src/checkout.test.ts`

- [ ] **Step 1: Replace the reactivation tests** (lines 112 to 129) with:

```ts
  it.each([
    ["an active subscription past its paid period", "active", -60_000],
    ["a past-due subscription past its paid period", "past_due", -60_000],
    ["an inactive subscription, even inside its paid period", "inactive", 60_000],
  ] as const)("replaces %s, so a returning customer can pay again", (_label, status, offsetMs) => {
    const lapsed = incomplete(0, { status, paidThroughAt: new Date(NOW.getTime() + offsetMs) });
    expect(decideCheckout(lapsed, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "replace", staleSubscriptionId: "sub-1" });
  });

  it("opens a fresh subscription beside a cancelled one whose paid period ran out", () => {
    const ended = incomplete(0, { status: "cancelled", paidThroughAt: new Date(NOW.getTime() - 60_000) });
    expect(decideCheckout(ended, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "create" });
  });

  it("reuses a returning customer's own unpaid checkout, as for anyone", () => {
    expect(decideCheckout(incomplete(0), TARGET, NOW, PAID_BEFORE)).toEqual({
      kind: "reuse",
      subscriptionId: "sub-1",
      providerSubscriptionId: "fake_sub_1",
    });
  });

  it("replaces a subscription marked active whose first charge never came", () => {
    expect(decideCheckout(incomplete(0, { status: "active" }), TARGET, NOW, NEVER_PAID)).toEqual({
      kind: "replace",
      staleSubscriptionId: "sub-1",
    });
  });

  it("opens a subscription for a business with history but no subscription row", () => {
    expect(decideCheckout(null, TARGET, NOW, PAID_BEFORE)).toEqual({ kind: "create" });
  });
```

- [ ] **Step 2: Run** `pnpm --filter @fynix/billing exec vitest run src/checkout.test.ts`. Expected: the new cases FAIL
  with `needs-reactivation` received.

- [ ] **Step 3: Implement.** In `checkout.ts` remove the `needs-reactivation` variant and its doc comment from
  `CheckoutDecision`, delete `if (history.hasEverPaid) return { kind: "needs-reactivation" };`, and replace the
  `active / past_due / inactive` case with:

```ts
    case "active":
    case "past_due":
    case "inactive":
      // Live but granting no access (access was checked first): a lapsed plan, or one marked active whose first charge
      // never came. It is ended and a new checkout opened in its place, as an unpaid stale checkout is.
      return { kind: "replace", staleSubscriptionId: latest.id };
```

  Update the function doc: "Access is decided first ... A business that has paid before is sold the plan again at
  today's price: its lapsed subscription is replaced (reactivation)." Remove `hasEverPaid` from the decision; keep it on
  `CheckoutHistory` (callers use it for the coupon rule).

- [ ] **Step 4: Run** the same command. Expected: PASS. Then `pnpm --filter @fynix/billing typecheck`.

### Task 2: cancelStaleSubscription ends a lapsed live row

**Files:** Modify `packages/db/src/queries/billing.ts`, `packages/db/src/index.ts`; Test
`packages/db/src/payment-confirmation.integration.test.ts` (`describe("openCheckoutSubscription")`)

- [ ] **Step 1: Add integration tests** inside `describe("openCheckoutSubscription")`:

```ts
  it("ends a lapsed subscription and opens the new one, leaving its payments and dates alone", async () => {
    const plan = await usdPlan();
    const lapsed = await openCheckout(businessA, "fake_sub_lapsed");
    await recordPaymentAndActivate(dbs.staff.db, await activation(lapsed, "fake_pay_lapsed"));
    const afterPeriod = new Date(THREE_MONTHS_ON.getTime() + 1);

    const fresh = await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_back",
      replacing: lapsed,
      now: afterPeriod,
    });

    expect(fresh).toMatchObject({ status: "incomplete" });
    expect(await findSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_lapsed")).toMatchObject({
      status: "cancelled",
      cancelledAt: afterPeriod,
      paidThroughAt: THREE_MONTHS_ON,
    });
  });

  it("ends a halted subscription even inside its paid period", async () => {
    const plan = await usdPlan();
    const halted = await openCheckout(businessA, "fake_sub_halted");
    await recordPaymentAndActivate(dbs.staff.db, await activation(halted, "fake_pay_halted"));
    await dbs.staff.db.update(subscriptions).set({ status: "inactive" }).where(eq(subscriptions.id, halted));

    await openCheckoutSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_back",
      replacing: halted,
      now: PAID_AT,
    });
    expect(await findSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_halted")).toMatchObject({ status: "cancelled" });
  });
```

  (The existing "never cancels a subscription that was paid for in the meantime" test already covers a row that still
  has access: it must keep passing.)

- [ ] **Step 2: Run** `pnpm test:integration`. Expected: the two new tests FAIL with `StaleSubscriptionChangedError`.

- [ ] **Step 3: Implement** in `cancelStaleSubscription`:

```ts
/**
 * Ends the subscription a new checkout replaces: an unpaid checkout, or a live one that no longer grants access (a
 * lapsed or halted plan, which reactivation replaces). The guard is in the UPDATE itself, so a payment that lands in
 * between, moving paid_through_at into the future, makes it match nothing and throw StaleSubscriptionChangedError.
 * Only the status and cancelledAt change: the old row's dates and payments are history.
 */
export async function cancelStaleSubscription(db: Runner, input: StaleSubscriptionCancellation): Promise<void> {
  const rows = await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: input.now })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.businessId, input.businessId),
        or(
          inArray(subscriptions.status, ["incomplete", "inactive"]),
          and(
            inArray(subscriptions.status, ["active", "past_due"]),
            or(isNull(subscriptions.paidThroughAt), lte(subscriptions.paidThroughAt, input.now)),
          ),
        ),
      ),
    )
    .returning({ id: subscriptions.id });
  if (rows.length === 0) throw new StaleSubscriptionChangedError(input.subscriptionId);
}
```

  Add `inArray`, `isNull`, `lte`, `or` to the `drizzle-orm` import if missing. Export `hasEverPaid`
  (`export async function hasEverPaid`) with the doc "Whether any subscription of the business was ever activated by a
  payment.", and add it to the `./queries/billing` export list in `packages/db/src/index.ts`.

- [ ] **Step 4: Run** `pnpm test:integration`. Expected: PASS.

### Task 3: activateReactivationPayment

**Files:** Modify `packages/shared/src/server/billing-activation.ts`; Test
`packages/shared/src/server/billing-activation.test.ts`

- [ ] **Step 1: Write tests** (same mocks as the file's `activateFirstPayment` block):

```ts
describe("activateReactivationPayment", () => {
  const PLAN = { id: "plan-premium", currency: "INR", initialAmountCents: 699_900, recurringAmountCents: 699_900,
    initialTermMonths: 1, taxRateBasisPoints: 1_800 } as Plan;
  const PAID = new Date("2026-10-09T10:00:00.000Z");
  const THROUGH = new Date("2026-11-09T10:00:00.000Z");

  it("records a reactivation at the plan's monthly price with tax, through the date it is given", async () => {
    await activateReactivationPayment(tx, { businessId: "biz", subscriptionId: "sub", plan: PLAN, provider: "razorpay",
      providerPaymentId: "pay_1", paidAt: PAID, paidThroughAt: THROUGH });
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, expect.objectContaining({
      kind: "reactivation", amountCents: 825_882, currency: "INR", paidThroughAt: THROUGH,
      commitmentEndsAt: THROUGH, currentPeriodEnd: THROUGH }));
  });

  it("opens no membership and accrues no affiliate earning", async () => {
    await activateReactivationPayment(tx, { businessId: "biz", subscriptionId: "sub", plan: PLAN, provider: "razorpay",
      providerPaymentId: "pay_1", paidAt: PAID, paidThroughAt: THROUGH });
    expect(openMembershipForListingBusiness).not.toHaveBeenCalled();
    expect(accrueAffiliateEarning).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @fynix/shared exec vitest run src/server/billing-activation.test.ts`. Expected:
  FAIL, `activateReactivationPayment` is not a function.

- [ ] **Step 3: Implement:**

```ts
export interface ReactivationPayment {
  readonly businessId: string;
  readonly subscriptionId: string;
  /** The plan on sale for the business's tier when it reactivated: today's price, never the one it lapsed on. */
  readonly plan: Plan;
  readonly provider: BillingProviderName;
  readonly providerPaymentId: string;
  readonly paidAt: Date;
  /** The end of the month this payment buys: Razorpay's cycle end, or one calendar month for a manual or test payment. */
  readonly paidThroughAt: Date;
  readonly manual?: ManualPaymentRecord;
  readonly method?: PaymentMethodDetails | null;
}

/**
 * The first payment on a new subscription for a business that had paid before and lapsed. Missed months are not
 * charged: it buys one month from the day it is paid, at the plan's monthly price with tax and no coupon (reactivation
 * takes none). It is not a first payment: no lead is marked paid, no membership opens (the business is already a
 * client) and no affiliate earns on it. Idempotent on the provider payment id.
 */
export async function activateReactivationPayment(tx: ScopedTransaction, payment: ReactivationPayment): Promise<RecordedActivation> {
  return recordPaymentAndActivate(tx, {
    businessId: payment.businessId,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    kind: "reactivation",
    amountCents: chargedAmountCents(payment.plan.recurringAmountCents, 0, payment.plan.taxRateBasisPoints),
    currency: payment.plan.currency,
    paidAt: payment.paidAt,
    paidThroughAt: payment.paidThroughAt,
    commitmentEndsAt: payment.paidThroughAt,
    currentPeriodEnd: payment.paidThroughAt,
    ...(payment.manual === undefined ? {} : { manual: payment.manual }),
    ...(payment.method === undefined ? {} : { method: payment.method }),
  });
}
```

- [ ] **Step 4: Run** the test command. Expected: PASS.

### Task 4: Razorpay webhook: cancelled subscriptions and reactivation

**Files:** Modify `apps/platform/lib/server/razorpay-webhook-handler.ts`; Test
`apps/platform/lib/server/razorpay-webhook-handler.test.ts`

- [ ] **Step 1: Write tests.** Add `hasEverPaid: vi.fn(async () => false)` to the `@fynix/db` mock and
  `activateReactivationPayment: vi.fn(async () => ({ alreadyRecorded: false }))` to the activation mock, then:

```ts
  it("records a charge on a cancelled subscription for staff, and activates nothing", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-old", businessId: "biz-1", planId: "plan_1",
      status: "cancelled", activatedAt: new Date("2026-08-01T00:00:00Z"), commitmentEndsAt: new Date("2026-09-01T00:00:00Z"),
      discountAmountCents: 0, pendingPlanId: null, pendingDiscountAmountCents: 0 } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    await handleRazorpayWebhookEvent(CHARGED_EVENT);
    expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "checkout_replaced" }));
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });

  it("records a returning customer's first charge as a reactivation through Razorpay's cycle end", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-back", businessId: "biz-1", planId: "plan_1",
      status: "incomplete", activatedAt: null, commitmentEndsAt: null, discountAmountCents: 0, pendingPlanId: null,
      pendingDiscountAmountCents: 0 } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    vi.mocked(hasEverPaid).mockResolvedValue(true);
    await handleRazorpayWebhookEvent(CHARGED_EVENT);
    expect(activateReactivationPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      subscriptionId: "sub-back", paidThroughAt: CHARGED_EVENT.currentEnd }));
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });
```

  where `CHARGED_EVENT` is a `kind: "charged"` event for `PLAN` (USD 7,500, `currentEnd` a fixed date).

- [ ] **Step 2: Run** `pnpm --filter @fynix/platform exec vitest run lib/server/razorpay-webhook-handler.test.ts`.
  Expected: both FAIL.

- [ ] **Step 3: Implement.** After the post-lock re-read and before the plan lookup:

```ts
      // A cancelled subscription is final: a checkout we replaced, or a lapsed plan a reactivation ended. Money that lands
      // on one buys nothing (activating it would also collide with the business's live subscription), so it is kept for
      // staff to refund, as the test checkout does.
      if (subscription.status === "cancelled") {
        await recordUnappliedPayment(tx, { businessId: subscription.businessId, subscriptionId: subscription.id,
          provider: "razorpay", providerPaymentId: event.paymentId,
          kind: subscription.activatedAt === null ? "initial" : "renewal", amountCents: event.amountCents,
          currency: event.currency, paidAt: event.paidAt, reason: "checkout_replaced", now: new Date(), method: event.method });
        logBillingEvent("warn", "confirmation-refused", { businessId: subscription.businessId, subscriptionId: subscription.id,
          provider: "razorpay", providerPaymentId: event.paymentId, reason: "checkout_replaced" });
        return null;
      }
      // A first charge for a business that has paid before is a reactivation: today's monthly price, no coupon.
      const reactivating = subscription.activatedAt === null && (await hasEverPaid(tx, subscription.businessId));
```

  Set `basePrice` to `plan?.recurringAmountCents` when `reactivating`. In the `activatedAt === null` branch, before
  `activateFirstPayment`:

```ts
        if (reactivating) {
          await activateReactivationPayment(tx, { businessId: subscription.businessId, subscriptionId: subscription.id,
            plan, provider: "razorpay", providerPaymentId: event.paymentId, paidAt: event.paidAt,
            paidThroughAt: event.currentEnd, method: event.method });
          return null;
        }
```

- [ ] **Step 4: Run** the test command. Expected: PASS (all existing cases too).

### Task 5: Test checkout (fake provider) reactivates

**Files:** Modify `apps/platform/lib/server/payment-confirmation.ts`, `apps/platform/app/app-host/billing/confirm/page.tsx`;
Test `apps/platform/lib/server/payment-confirmation.test.ts`

- [ ] **Step 1: Write a test**: with `findBillingState` returning `hasEverPaid: true`, no access, and an `incomplete`
  subscription, `confirmFirstPayment` returns `{ kind: "reactivated" }`, calls `activateReactivationPayment` with
  `paidThroughAt` one calendar month after `paidAt`, and never calls `activateFirstPayment` or `submitProject`.
- [ ] **Step 2: Run** `pnpm --filter @fynix/platform exec vitest run lib/server/payment-confirmation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `| { readonly kind: "reactivated" }` to `PaymentConfirmation`. `applicability` returns
  `reactivating: state?.hasEverPaid === true` with the plan and judges the amount against
  `chargedAmountCents(plan.recurringAmountCents, subscription.discountAmountCents, plan.taxRateBasisPoints)` when
  reactivating. In `confirmFirstPayment`, when `verdict.reactivating`, call `activateReactivationPayment` with
  `paidThroughAt: addMonthsUtc(confirmed.paidAt, 1)` and return `{ kind: "reactivated" }`. In the confirm page's
  `hrefAfter`, map `reactivated` to `/billing?payment=received`.
- [ ] **Step 4: Run** the test command. Expected: PASS.

### Task 6: Checkout: no coupon on return, and startReactivationFor

**Files:** Modify `apps/platform/lib/server/checkout.ts`; Test `apps/platform/lib/server/checkout.test.ts`

- [ ] **Step 1: Write tests:** `startReactivationFor` (a) refuses a business that has never paid with the existing
  `NOTHING_TO_PAY_FOR` message, (b) sends a paid-up business to `/billing`, (c) for a lapsed business opens a checkout
  with `referralCodeId: null` and `discountAmountCents: 0` even when a code is applied, replacing the lapsed row and
  cancelling it at the provider after the commit.
- [ ] **Step 2: Run** `pnpm --filter @fynix/platform exec vitest run lib/server/checkout.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `openPlanCheckout`, skip the coupon when `state.hasEverPaid`:

```ts
    // Reactivation takes no coupon (docs/superpowers/specs/2026-10-09-reactivation-design.md): a business that has paid
    // before pays today's full price.
    const applied = state.hasEverPaid ? null : await findBusinessReferralCode(tx, tenant.businessId);
```

  Remove the `needs-reactivation` case and the `NEEDS_REACTIVATION` constant. Add:

```ts
/** Where a returning customer pays, and comes back to. */
export const REACTIVATE_HREF = "/billing";

/**
 * Reactivate on Billing: a business that paid before and has lapsed opens a checkout for its own tier at today's price.
 * Checked on the server whatever the page showed: the checkout rate limit, and that the business really has lapsed (a
 * paid-up one is sent to Billing, one that never paid has nothing to restart). No onboarding check: its project is live.
 */
export async function startReactivationFor(customer: GrantedCustomer, now: Date): Promise<CheckoutOutcome> {
  const { tenant, billing } = customer;
  const limit = await consumeRateLimit(getAppDb(), `checkout:business:${tenant.businessId}`, CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);
  if (billing.status === "paid") return { kind: "redirect", url: REACTIVATE_HREF };
  if (billing.status !== "lapsed") return refused(NOTHING_TO_PAY_FOR);
  return openPlanCheckout(customer, now, REACTIVATE_HREF, null);
}
```

- [ ] **Step 4: Run** the test command. Expected: PASS.

### Task 7: Staff bank transfer reactivates

**Files:** Modify `apps/admin/lib/server/billing-admin.ts`, `packages/shared/src/lib/billing/manual-payment-notices.ts`;
Test `apps/admin/lib/server/billing-admin.test.ts`

- [ ] **Step 1: Write a test:** for a lapsed business (`hasEverPaid: true`, newest row `inactive`) with a coupon applied,
  `recordManualFirstPayment` replaces the lapsed row, opens a `manual` subscription with no referral code and no
  discount, calls `activateReactivationPayment` with `paidThroughAt` one month after `now` and the manual audit trail,
  and returns `{ kind: "recorded" }`.
- [ ] **Step 2: Run** `pnpm --filter @fynix/admin exec vitest run lib/server/billing-admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Skip the coupon when `state.hasEverPaid`; drop the `needs-reactivation` case; after opening
  the subscription call `activateReactivationPayment` (with `paidThroughAt: addMonthsUtc(now, 1)`) instead of
  `activateFirstPayment` when `state.hasEverPaid`. Remove `needs-reactivation` from `ManualPaymentOutcome` and
  `MANUAL_PAYMENT_NOTICES`. Change the `recorded` notice to "Payment recorded." (it no longer always concerns setup).
- [ ] **Step 4: Run** the test command and `pnpm --filter @fynix/admin typecheck`. Expected: PASS.

### Task 8: Banner and messages

**Files:** Modify `packages/shared/src/lib/billing/payment-step.ts`, `apps/platform/components/panel/billing-banner.tsx`;
Test `packages/shared/src/lib/billing/payment-step.test.ts`

- [ ] **Step 1: Replace the lapsed banner test** with:

```ts
  it("offers a lapsed customer Reactivate on Billing", () => {
    for (const locked of [true, false]) {
      expect(billingBanner({ ...base, status: "lapsed", locked, setupComplete: true })).toEqual({
        kind: "pay",
        title: "Your plan has ended",
        message: "Your website and content are safe. Restart it from Billing.",
        price: null,
        action: { href: "/billing", label: "Reactivate" },
      });
    }
  });
```

- [ ] **Step 2: Run** `pnpm --filter @fynix/shared exec vitest run src/lib/billing/payment-step.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Return that model for `lapsed`; delete the `contact` variant from `BillingBannerModel` and its
  branch and eyebrow in `billing-banner.tsx`. Set `PLAN_ENDED_MESSAGE` to "Your plan has ended. Your website and content
  are safe, and you can restart it from Billing." Update the `reactivate` doc on `PaymentStep` and `CustomerBillingStatus`
  to say restarting is done from Billing.
- [ ] **Step 4: Run** the test command. Expected: PASS.

### Task 9: Billing page, Reactivate card, pay page return

**Files:** Create `apps/platform/components/panel/billing/reactivate-plan.tsx`; Modify the billing page and actions,
`plan-summary.tsx`, `onboarding/review/page.tsx`, `billing/pay/page.tsx`, `billing/pay/callback/route.ts`,
`lib/server/billing.ts`

- [ ] **Step 1:** `lib/server/billing.ts`: `findReactivationPlan(customer)` returns
  `findActivePlan(getStaffDb(), currency, billing.tier)` where currency is `billing.plan?.currency`, or null.
- [ ] **Step 2:** `billing/actions.ts`: `reactivateAction(): Promise<ReactivateFormState>` calls `startReactivationFor`,
  redirects on `redirect`, returns `{ status: "error", message }` on `refused`.
- [ ] **Step 3:** `reactivate-plan.tsx`: a client component card (Surface styles as `PlanSummary`) showing "Your plan has
  ended", "Your website and content are safe.", the plan name, "{net} a month plus 18% GST" and the taxed monthly figure
  (`renewalCharge(plan, 0)`), and a `useActionState` form whose button reads "Reactivate for {amount}" / "Opening
  payment…", with the error under it (the `UpgradePayForm` pattern).
- [ ] **Step 4:** Billing page: when `billing.status === "lapsed"`, render `ReactivatePlan` (or the existing "We couldn't
  find your plan's details" card when `findReactivationPlan` is null) instead of `PlanSummary`; read `?payment=received`
  ("Payment received. Your website comes back online as soon as it's confirmed, usually within a minute.") and
  `?payment=failed` ("That payment didn't go through, and nothing was taken. You can try again.") into a notice.
  Remove the `lapsed` prop and branch from `PlanSummary`.
- [ ] **Step 5:** Check and send (`onboarding/review/page.tsx`): the `reactivate` step shows `PLAN_ENDED_MESSAGE` with a
  link to Billing instead of the email address.
- [ ] **Step 6:** Pay page: when `billing.status === "lapsed"`, `backHref` is `/billing` and the callback URL carries
  `return=billing`; the callback route sends `return=billing` to `/billing?payment=received|failed`.
- [ ] **Step 7: Run** `pnpm --filter @fynix/platform exec vitest run` and typecheck. Expected: PASS.

### Task 10: Verify and ship

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build`, all passing.
- [ ] Local walk-through on the fake provider: lapse a test business (set its subscription `inactive`), press
  Reactivate, pay on the test checkout, land on Billing with access back and a `reactivation` receipt.
- [ ] Commit, push `development`, PR to `main`.
- [ ] After deploy, one Razorpay test-mode reactivation on production.
