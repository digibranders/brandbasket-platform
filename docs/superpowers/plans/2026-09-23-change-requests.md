# Change Requests After Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer whose website is live can ask for a change in their dashboard, accept a price when it goes past their free hour, review the change on a Vercel preview link, and approve it; staff estimate, send the preview, and mark it shipped once merged, with the hours and any money owed recorded.

**Architecture:** A new `change_requests` table holds one row per request with its own small state machine, separate from `projects` (a live project is closed by `projects_one_open_per_business_idx`, and reopening it would break the live dashboard). Every transition is a single conditional `UPDATE … WHERE status = …` in `packages/db/src/queries/change-requests.ts` ("the condition is the gate", as in `queries/projects.ts`), run on the staff connection even when a customer triggers it, after `requireCustomerAccess()` has proved it is their business. Pricing is a pure function in `packages/shared`. Emails are two templates (one to the customer, one to the team) written to the outbox. Payment for extra hours is recorded by staff by hand; no payment-provider change.

**Tech Stack:** Next.js 16 server actions, Drizzle ORM + hand-written SQL migrations on Postgres 16 with row-level security, Vitest (unit + `*.integration.test.ts` against `fynix_platform_test`), `@fynix/email` outbox.

**Decided with the user (2026-09-23):**
- The customer asks in writing, in the dashboard.
- Past the free hour, the customer accepts the estimate in the dashboard before any work starts.
- Extra hours are recorded and collected manually (bank transfer or a link), then staff record the payment.
- After approval, staff merge the branch in the client's repo themselves (Vercel deploys `main`), then click **Mark shipped**. No automatic merge in this plan.
- Blog "preview before publish" is a separate plan and is not part of this one.

---

## How it works

### States

| Status | Meaning | Who moves it on | To |
|---|---|---|---|
| `requested` | Customer wrote what they want | Staff: estimate | `quoted` (paid) or `in_progress` (within free time) |
| `quoted` | Price shown, waiting for the customer | Customer: accept | `in_progress` |
| `in_progress` | Team is working on a branch | Staff: send preview | `preview` |
| `preview` | Vercel preview link sent | Customer: approve / ask for more | `approved` / `revisions` |
| `revisions` | Customer asked for another round | Staff: send preview | `preview` |
| `approved` | Customer happy; staff to merge | Staff: mark shipped | `shipped` |
| `shipped` | Live on their domain | (end) | |
| `declined` | Staff turned it down (reason kept) | (end) | |
| `withdrawn` | Customer cancelled before approval | (end) | |

The open states are every state except `shipped`, `declined` and `withdrawn`. **One open request per business**, enforced by a partial unique index. That keeps the dashboard to a single "current change" and makes every query and transition simple. The customer can ask for the next change as soon as the current one ends.

### Money

- **Free time.** `plans.included_change_hours` is the free allowance, used **once per customer** (it is 1 hour today). The free minutes remaining are the allowance minus the `estimate_minutes` of every request that went ahead, meaning it reached `in_progress` or later and was not withdrawn before approval. The estimate, not the actual time, uses the allowance, so the customer is never charged more than they accepted.
- **Price of a request:**
  - `billable_minutes = max(0, estimate_minutes − free_minutes_remaining)`
  - `net = round_half_up(extra_hour_amount_cents × billable_minutes / 60)`
  - `due = chargedAmountCents(net, 0, plan.tax_rate_basis_points)`, so an INR customer pays GST on extras exactly as on the plan.
- **What is frozen.** The quote is fixed when staff estimate (`quoted_amount_cents`, `currency`). If the work takes longer, the customer still pays the quote. `actual_minutes` is recorded on shipping, for our own information only.
- **When there is nothing to pay.** If `due` is 0, the request skips `quoted` and goes straight to `in_progress`. The customer sees "This is within your free time".
- **Collecting the money.** A shipped request with `quoted_amount_cents > 0` and `paid_at IS NULL` is "owed". Staff record a payment (date and reference) on the admin client page.

### Emails (outbox)

- **To the customer** (`change-request-update`):
  - `quoted`: the price, and "accept it in your dashboard"
  - `preview`: the link
  - `shipped`: "It's live"
  - `declined`: the reason
- **To the team inbox** (`change-request-team`): `requested`, `accepted`, `approved`, `revisions`, `withdrawn`, each with a link to the admin client page.

---

## File structure

**packages/shared**
- Create `packages/shared/src/lib/billing/change-pricing.ts`: pure pricing (`quoteChange`, `freeMinutesRemaining`).
- Create `packages/shared/src/lib/billing/change-pricing.test.ts`.
- Create `packages/shared/src/lib/change-request-status.ts`: labels and customer-facing stage text per status. Pure, used by both apps.
- Create `packages/shared/src/lib/change-request-status.test.ts`.

**packages/db**
- Create `packages/db/src/schema/change-requests.ts`: enum and table.
- Modify `packages/db/src/schema/index.ts`: export it.
- Create `packages/db/migrations/0040_change_requests.sql`: generated by drizzle-kit.
- Create `packages/db/migrations/0041_change_request_grants.sql`: hand-written grants and RLS.
- Create `packages/db/src/queries/change-requests.ts`: every read and transition.
- Modify `packages/db/src/index.ts`: export the queries and errors.
- Create `packages/db/src/change-requests.integration.test.ts`.

**packages/email**
- Create `packages/email/src/templates/change-request-update.ts`.
- Create `packages/email/src/templates/change-request-team.ts`.
- Modify `packages/email/src/index.ts`: export both.
- Modify `packages/email/src/templates/templates.test.ts`: tests.

**apps/admin**
- Create `apps/admin/lib/server/change-requests.ts`: staff operations (query plus email), one function per action.
- Create `apps/admin/lib/server/change-requests.test.ts`.
- Create `apps/admin/app/(protected)/clients/[businessId]/change-request-actions.ts`: server actions.
- Create `apps/admin/components/change-request-panel.tsx`: the section on the client page.
- Modify `apps/admin/app/(protected)/clients/[businessId]/page.tsx`: render the panel when the project is live.
- Create `packages/shared/src/lib/change-request-notices.ts`: fixed notice copy for both apps (the same pattern as `project-preview-notices.ts`).

**apps/platform**
- Create `apps/platform/lib/server/change-requests.ts`: customer operations (query plus team email).
- Create `apps/platform/lib/server/change-requests.test.ts`.
- Create `apps/platform/app/app-host/(protected)/changes/page.tsx`: the page.
- Create `apps/platform/app/app-host/(protected)/changes/actions.ts`: server actions.
- Create `apps/platform/components/panel/change-request-form.tsx`: the "Request a change" form (client component).
- Modify `apps/platform/app/app-host/(protected)/project/page.tsx`: the live "Something bigger?" card links to `/changes`.
- Modify `apps/platform/components/panel/customer-shell.tsx` (the nav items, next to `{ href: "/content/blog", label: "Blog" }`): add "Changes", shown only when the website is live.

---

### Task 1: Pricing

**Files:**
- Create: `packages/shared/src/lib/billing/change-pricing.ts`
- Test: `packages/shared/src/lib/billing/change-pricing.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { freeMinutesRemaining, quoteChange } from "./change-pricing";

const USD = { currency: "USD" as const, includedChangeHours: 1, extraHourAmountCents: 1_500, taxRateBasisPoints: 0 };
const INR = { currency: "INR" as const, includedChangeHours: 1, extraHourAmountCents: 142_500, taxRateBasisPoints: 1_800 };

describe("freeMinutesRemaining", () => {
  it("is the whole allowance when nothing has used it", () => {
    expect(freeMinutesRemaining(USD, [])).toBe(60);
  });

  it("subtracts every estimate that went ahead, never going below zero", () => {
    expect(freeMinutesRemaining(USD, [20])).toBe(40);
    expect(freeMinutesRemaining(USD, [45, 30])).toBe(0);
  });
});

describe("quoteChange", () => {
  it("is free when the estimate fits in the free time", () => {
    expect(quoteChange(USD, 45, 60)).toEqual({ billableMinutes: 0, amountCents: 0, currency: "USD" });
  });

  it("charges only the minutes past the free time, at the hourly rate", () => {
    // 90 minutes, 60 free: 30 billable minutes of $15/hour.
    expect(quoteChange(USD, 90, 60)).toEqual({ billableMinutes: 30, amountCents: 750, currency: "USD" });
  });

  it("adds the plan's tax, as the plan price does", () => {
    // 2 hours, nothing free: 2 × ₹1,425 = ₹2,850, plus 18% GST = ₹3,363.
    expect(quoteChange(INR, 120, 0)).toEqual({ billableMinutes: 120, amountCents: 336_300, currency: "INR" });
  });

  it("rounds a part-minute charge half up to the nearest minor unit", () => {
    // 1 minute of $15/hour is 25 cents exactly; 7 minutes is 175 cents.
    expect(quoteChange(USD, 7, 0).amountCents).toBe(175);
  });

  it("refuses an estimate that is not a positive whole number of minutes", () => {
    expect(() => quoteChange(USD, 0, 60)).toThrow(RangeError);
    expect(() => quoteChange(USD, 12.5, 60)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/billing/change-pricing.test.ts`
Expected: FAIL, "Cannot find module './change-pricing'".

- [ ] **Step 3: Implement**

```ts
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@fynix/billing/tax";
import type { MoneyCurrency } from "@fynix/shared/lib/money";

/** The parts of a plan that price a change. */
export interface ChangePricingPlan {
  readonly currency: MoneyCurrency;
  /** Free change time, once per customer, in whole hours. */
  readonly includedChangeHours: number;
  /** Net price of an hour past the free time, in minor units. */
  readonly extraHourAmountCents: number;
  readonly taxRateBasisPoints: number;
}

export interface ChangeQuote {
  readonly billableMinutes: number;
  /** What the customer pays, tax included, in minor units. 0 when the change fits in the free time. */
  readonly amountCents: number;
  readonly currency: MoneyCurrency;
}

const MINUTES_PER_HOUR = 60;

/**
 * Free minutes left: the plan's allowance less every estimate that went ahead. The estimate, not the time actually
 * spent, is what uses the allowance, so a customer is never charged more than the quote they accepted.
 */
export function freeMinutesRemaining(plan: ChangePricingPlan, usedEstimateMinutes: readonly number[]): number {
  const used = usedEstimateMinutes.reduce((sum, minutes) => sum + minutes, 0);
  return Math.max(0, plan.includedChangeHours * MINUTES_PER_HOUR - used);
}

/**
 * The price of a change estimated at `estimateMinutes`, given the free minutes left. Only the minutes past the free
 * time are charged, at the hourly rate, rounded half up to a minor unit, with the plan's tax on top.
 */
export function quoteChange(plan: ChangePricingPlan, estimateMinutes: number, freeMinutes: number): ChangeQuote {
  if (!Number.isInteger(estimateMinutes) || estimateMinutes <= 0) {
    throw new RangeError(`An estimate must be a positive whole number of minutes, received ${estimateMinutes}`);
  }
  const billableMinutes = Math.max(0, estimateMinutes - Math.max(0, freeMinutes));
  if (billableMinutes === 0) return { billableMinutes: 0, amountCents: 0, currency: plan.currency };
  const net = Math.floor((plan.extraHourAmountCents * billableMinutes + MINUTES_PER_HOUR / 2) / MINUTES_PER_HOUR);
  return {
    billableMinutes,
    amountCents: chargedAmountCents(net, 0, plan.taxRateBasisPoints),
    currency: plan.currency,
  };
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/billing/change-pricing.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/billing/change-pricing.ts packages/shared/src/lib/billing/change-pricing.test.ts
git commit -m "Price a website change: free time first, then the hourly rate plus tax"
```

---

### Task 2: Schema and migrations

**Files:**
- Create: `packages/db/src/schema/change-requests.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create (generated): `packages/db/migrations/0040_change_requests.sql`, plus `meta/` updates
- Create (custom): `packages/db/migrations/0041_change_request_grants.sql`

- [ ] **Step 1: Write the schema**

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { businesses } from "./businesses";
import { billingCurrency } from "./currency";
import { createdAt, updatedAt } from "./columns";

/** A post-launch change's life. See docs/superpowers/plans/2026-09-23-change-requests.md, "States". */
export const changeRequestStatus = pgEnum("change_request_status", [
  "requested",
  "quoted",
  "in_progress",
  "preview",
  "revisions",
  "approved",
  "shipped",
  "declined",
  "withdrawn",
]);
export type ChangeRequestStatus = (typeof changeRequestStatus.enumValues)[number];

/** Statuses a request is finished in; a business may have any number of these. */
export const CLOSED_CHANGE_REQUEST_STATUSES = ["shipped", "declined", "withdrawn"] as const satisfies readonly ChangeRequestStatus[];

/** Statuses where the next move is the team's. The one list: the admin overview query and the shared copy use it. */
export const CHANGE_REQUEST_STATUSES_WAITING_ON_STAFF = [
  "requested",
  "in_progress",
  "revisions",
  "approved",
] as const satisfies readonly ChangeRequestStatus[];

export const MAX_CHANGE_REQUEST_LENGTH = 2_000;

export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    description: text("description").notNull(),
    status: changeRequestStatus("status").notNull().default("requested"),
    /** Staff's estimate, in whole minutes. Set with the quote. */
    estimateMinutes: integer("estimate_minutes"),
    /** What the customer pays for this change, tax included, frozen at estimate time. 0 = within free time. */
    quotedAmountCents: integer("quoted_amount_cents"),
    currency: billingCurrency("currency"),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    previewUrl: text("preview_url"),
    previewSentAt: timestamp("preview_sent_at", { withTimezone: true }),
    revisionRounds: integer("revision_rounds").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    /** Time actually spent, recorded on shipping. For our own records; the customer pays the quote. */
    actualMinutes: integer("actual_minutes"),
    declinedReason: text("declined_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** When staff recorded the money for a paid change arriving, and its bank or payment reference. */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentReference: text("payment_reference"),
    paymentRecordedByUserId: text("payment_recorded_by_user_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("change_requests_one_open_per_business_idx")
      .on(table.businessId)
      .where(sql`${table.status} not in ('shipped', 'declined', 'withdrawn')`),
    index("change_requests_business_created_idx").on(table.businessId, table.createdAt),
    check("change_requests_description_length", sql`char_length(${table.description}) between 1 and 2000`),
    check("change_requests_estimate_positive", sql`${table.estimateMinutes} is null or ${table.estimateMinutes} > 0`),
    check("change_requests_amount_non_negative", sql`${table.quotedAmountCents} is null or ${table.quotedAmountCents} >= 0`),
    check("change_requests_quote_complete", sql`(${table.quotedAmountCents} is null) = (${table.currency} is null)`),
  ],
);
```

The currency enum is `billingCurrency` in `schema/currency.ts` (checked). The users table is `users` in `schema/auth.ts`, with `id: text`.

- [ ] **Step 2: Export it**

Add to `packages/db/src/schema/index.ts`, keeping the alphabetical order:

```ts
export * from "./change-requests";
```

- [ ] **Step 3: Generate the table migration**

Run: `pnpm --filter @fynix/db exec drizzle-kit generate --name change_requests`
Expected: `packages/db/migrations/0040_change_requests.sql` is created, containing `CREATE TYPE "public"."change_request_status"`, `CREATE TABLE "change_requests"`, the partial unique index and the four checks.

- [ ] **Step 4: Write the grants migration**

Run: `pnpm --filter @fynix/db exec drizzle-kit generate --custom --name change_request_grants`, then put this in the new `0041_change_request_grants.sql`:

```sql
-- Staff do every write, including the ones a customer triggers (the same shape as projects: see
-- approveProjectPreview's doc comment). The customer connection may only read its own business's requests.
GRANT SELECT, INSERT, UPDATE ON change_requests TO fynix_staff;--> statement-breakpoint
GRANT SELECT ON change_requests TO fynix_app;--> statement-breakpoint
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY change_requests_staff_all ON change_requests FOR ALL TO fynix_staff USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY change_requests_tenant_select ON change_requests FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
```

- [ ] **Step 5: Apply to the dev and test databases**

Run: `pnpm db:migrate && pnpm db:migrate:test`
Expected: "Migrations applied to the dev database." and "Migrations applied to the test database."

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/change-requests.ts packages/db/src/schema/index.ts packages/db/migrations
git commit -m "Add change_requests: one open request per business, staff-written, tenant-readable"
```

---

### Task 3: Queries and transitions

**Files:**
- Create: `packages/db/src/queries/change-requests.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/change-requests.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptChangeQuote,
  approveChangePreview,
  ChangeRequestAlreadyOpenError,
  ChangeRequestNotInStateError,
  createChangeRequest,
  declineChangeRequest,
  findOpenChangeRequest,
  listChangeRequests,
  markChangeShipped,
  recordChangePayment,
  recordChangeQuote,
  requestChangeRevisions,
  sendChangePreview,
  usedFreeEstimateMinutes,
  withdrawChangeRequest,
} from "./queries/change-requests";
import { businesses, businessMembers, changeRequests, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const OWNER = "owner-1";
const STAFF = "staff-1";
const PREVIEW = "https://harbour-git-menu-update.vercel.app";

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Riley Owner", email: "riley@example.com" },
    { id: STAFF, name: "Sam Staff", email: "sam@example.com" },
  ]);
  const [business] = await dbs.staff.db
    .insert(businesses)
    .values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" })
    .returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  businessId = business.id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
});

async function newRequest() {
  return createChangeRequest(dbs.staff.db, { businessId, userId: OWNER, description: "Update the menu prices", now: NOW });
}

describe("createChangeRequest", () => {
  it("opens a request in `requested`", async () => {
    const request = await newRequest();
    expect(request).toMatchObject({ businessId, status: "requested", description: "Update the menu prices" });
  });

  it("refuses a second open request for the same business", async () => {
    await newRequest();
    await expect(newRequest()).rejects.toBeInstanceOf(ChangeRequestAlreadyOpenError);
  });

  it("allows a new request once the last one is closed", async () => {
    const first = await newRequest();
    await withdrawChangeRequest(dbs.staff.db, { businessId, requestId: first.id, now: NOW });
    await expect(newRequest()).resolves.toMatchObject({ status: "requested" });
  });
});

describe("the paid path", () => {
  it("quotes, accepts, previews, takes a revision, approves and ships", async () => {
    const request = await newRequest();

    const quoted = await recordChangeQuote(dbs.staff.db, {
      businessId, requestId: request.id, estimateMinutes: 120, amountCents: 336_300, currency: "INR", now: NOW,
    });
    expect(quoted.status).toBe("quoted");

    expect((await acceptChangeQuote(dbs.staff.db, { businessId, requestId: request.id, now: NOW })).status).toBe("in_progress");
    expect((await sendChangePreview(dbs.staff.db, { businessId, requestId: request.id, previewUrl: PREVIEW, now: NOW })).status).toBe("preview");

    const revised = await requestChangeRevisions(dbs.staff.db, { businessId, requestId: request.id, now: NOW });
    expect(revised).toMatchObject({ status: "revisions", revisionRounds: 1 });

    await sendChangePreview(dbs.staff.db, { businessId, requestId: request.id, previewUrl: PREVIEW, now: NOW });
    expect((await approveChangePreview(dbs.staff.db, { businessId, requestId: request.id, now: NOW })).status).toBe("approved");

    const shipped = await markChangeShipped(dbs.staff.db, { businessId, requestId: request.id, actualMinutes: 150, now: NOW });
    expect(shipped).toMatchObject({ status: "shipped", actualMinutes: 150, quotedAmountCents: 336_300 });
    expect(shipped.closedAt).toEqual(NOW);

    const paid = await recordChangePayment(dbs.staff.db, {
      businessId, requestId: request.id, reference: "UTR 1234", staffUserId: STAFF, paidAt: NOW,
    });
    expect(paid).toMatchObject({ paymentReference: "UTR 1234", paymentRecordedByUserId: STAFF });
  });
});

describe("the free path", () => {
  it("goes straight to in_progress when the quote is 0", async () => {
    const request = await newRequest();
    const quoted = await recordChangeQuote(dbs.staff.db, {
      businessId, requestId: request.id, estimateMinutes: 30, amountCents: 0, currency: "INR", now: NOW,
    });
    expect(quoted).toMatchObject({ status: "in_progress", quotedAmountCents: 0 });
    expect(quoted.acceptedAt).toEqual(NOW);
  });
});

describe("the condition is the gate", () => {
  it("refuses a transition from the wrong state, changing nothing", async () => {
    const request = await newRequest();
    await expect(
      approveChangePreview(dbs.staff.db, { businessId, requestId: request.id, now: NOW }),
    ).rejects.toBeInstanceOf(ChangeRequestNotInStateError);
    const [row] = await dbs.staff.db.select().from(changeRequests).where(eq(changeRequests.id, request.id));
    expect(row?.status).toBe("requested");
  });

  it("refuses another business's request id", async () => {
    const request = await newRequest();
    const [other] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "other", name: "Other", currency: "USD" })
      .returning({ id: businesses.id });
    await expect(
      withdrawChangeRequest(dbs.staff.db, { businessId: other!.id, requestId: request.id, now: NOW }),
    ).rejects.toBeInstanceOf(ChangeRequestNotInStateError);
  });

  it("does not let the customer withdraw once approved", async () => {
    const request = await newRequest();
    await recordChangeQuote(dbs.staff.db, { businessId, requestId: request.id, estimateMinutes: 30, amountCents: 0, currency: "INR", now: NOW });
    await sendChangePreview(dbs.staff.db, { businessId, requestId: request.id, previewUrl: PREVIEW, now: NOW });
    await approveChangePreview(dbs.staff.db, { businessId, requestId: request.id, now: NOW });
    await expect(
      withdrawChangeRequest(dbs.staff.db, { businessId, requestId: request.id, now: NOW }),
    ).rejects.toBeInstanceOf(ChangeRequestNotInStateError);
  });

  it("records a decline reason and closes the request", async () => {
    const request = await newRequest();
    const declined = await declineChangeRequest(dbs.staff.db, {
      businessId, requestId: request.id, reason: "This needs a redesign, not a change.", now: NOW,
    });
    expect(declined).toMatchObject({ status: "declined", declinedReason: "This needs a redesign, not a change." });
  });
});

describe("reads", () => {
  it("counts only estimates that went ahead towards the free time", async () => {
    const first = await newRequest();
    await recordChangeQuote(dbs.staff.db, { businessId, requestId: first.id, estimateMinutes: 20, amountCents: 0, currency: "INR", now: NOW });
    await sendChangePreview(dbs.staff.db, { businessId, requestId: first.id, previewUrl: PREVIEW, now: NOW });
    await approveChangePreview(dbs.staff.db, { businessId, requestId: first.id, now: NOW });
    await markChangeShipped(dbs.staff.db, { businessId, requestId: first.id, actualMinutes: 25, now: NOW });

    const second = await newRequest();
    await recordChangeQuote(dbs.staff.db, { businessId, requestId: second.id, estimateMinutes: 90, amountCents: 1_000, currency: "INR", now: NOW });
    await withdrawChangeRequest(dbs.staff.db, { businessId, requestId: second.id, now: NOW }); // never went ahead

    expect(await usedFreeEstimateMinutes(dbs.staff.db, businessId)).toEqual([20]);
  });

  it("lets the customer read their own requests and nobody else's", async () => {
    await newRequest();
    const mine = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listChangeRequests(tx, businessId));
    expect(mine).toHaveLength(1);
    const open = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findOpenChangeRequest(tx, businessId));
    expect(open?.status).toBe("requested");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm db:migrate:test && pnpm --filter @fynix/db exec vitest run --config vitest.integration.config.ts src/change-requests.integration.test.ts`
Expected: FAIL, "Cannot find module './queries/change-requests'".

- [ ] **Step 3: Implement the queries**

```ts
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  changeRequests,
  CLOSED_CHANGE_REQUEST_STATUSES,
  type BillingCurrency,
  type ChangeRequestStatus,
} from "../schema";

/** A staff write across tenants: the plain staff connection, or a transaction opened on it. */
type Runner = Database | ScopedTransaction;

export class ChangeRequestAlreadyOpenError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} already has an open change request.`);
    this.name = "ChangeRequestAlreadyOpenError";
  }
}

export class ChangeRequestNotInStateError extends Error {
  readonly expected: readonly ChangeRequestStatus[];
  constructor(requestId: string, expected: readonly ChangeRequestStatus[]) {
    super(`Change request ${requestId} is not ${expected.join(" or ")} for this business.`);
    this.name = "ChangeRequestNotInStateError";
    this.expected = expected;
  }
}

export type ChangeRequest = typeof changeRequests.$inferSelect;

/** States from which the customer may still withdraw: anything before they approve. */
const WITHDRAWABLE: readonly ChangeRequestStatus[] = ["requested", "quoted", "in_progress", "preview", "revisions"];
/** States a request has "gone ahead" from: its estimate now uses the free time. */
const WENT_AHEAD: readonly ChangeRequestStatus[] = ["in_progress", "preview", "revisions", "approved", "shipped"];

interface Target {
  readonly businessId: string;
  readonly requestId: string;
  readonly now: Date;
}

/**
 * The one transition shape: a single UPDATE whose WHERE is the business, the request and the allowed prior states.
 * No match means the request is someone else's or not in a state that allows this, and nothing changes.
 */
async function transition(
  db: Runner,
  target: Pick<Target, "businessId" | "requestId">,
  from: readonly ChangeRequestStatus[],
  set: Partial<typeof changeRequests.$inferInsert>,
): Promise<ChangeRequest> {
  const rows = await db
    .update(changeRequests)
    .set(set)
    .where(
      and(
        eq(changeRequests.id, target.requestId),
        eq(changeRequests.businessId, target.businessId),
        inArray(changeRequests.status, [...from]),
      ),
    )
    .returning();
  const row = rows[0];
  if (row === undefined) throw new ChangeRequestNotInStateError(target.requestId, from);
  return row;
}

export interface NewChangeRequest {
  readonly businessId: string;
  readonly userId: string;
  readonly description: string;
  readonly now: Date;
}

/** Opens a request. The partial unique index is what refuses a second open one; its violation becomes a typed error. */
export async function createChangeRequest(db: Runner, input: NewChangeRequest): Promise<ChangeRequest> {
  try {
    const rows = await db
      .insert(changeRequests)
      .values({ businessId: input.businessId, requestedByUserId: input.userId, description: input.description, createdAt: input.now })
      .returning();
    const row = rows[0];
    if (row === undefined) throw new Error("Inserting a change request returned no row.");
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "change_requests_one_open_per_business_idx")) {
      throw new ChangeRequestAlreadyOpenError(input.businessId);
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = error instanceof Error && "cause" in error ? (error as { cause?: unknown }).cause : error;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505" &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

export interface ChangeQuoteInput extends Target {
  readonly estimateMinutes: number;
  /** Tax included, from quoteChange. 0 sends the request straight to in_progress. */
  readonly amountCents: number;
  readonly currency: BillingCurrency;
}

export function recordChangeQuote(db: Runner, input: ChangeQuoteInput): Promise<ChangeRequest> {
  const free = input.amountCents === 0;
  return transition(db, input, ["requested"], {
    status: free ? "in_progress" : "quoted",
    estimateMinutes: input.estimateMinutes,
    quotedAmountCents: input.amountCents,
    currency: input.currency,
    quotedAt: input.now,
    acceptedAt: free ? input.now : null,
  });
}

export function acceptChangeQuote(db: Runner, input: Target): Promise<ChangeRequest> {
  return transition(db, input, ["quoted"], { status: "in_progress", acceptedAt: input.now });
}

export function sendChangePreview(db: Runner, input: Target & { readonly previewUrl: string }): Promise<ChangeRequest> {
  return transition(db, input, ["in_progress", "revisions"], {
    status: "preview",
    previewUrl: input.previewUrl,
    previewSentAt: input.now,
  });
}

export function approveChangePreview(db: Runner, input: Target): Promise<ChangeRequest> {
  return transition(db, input, ["preview"], { status: "approved", approvedAt: input.now });
}

export function requestChangeRevisions(db: Runner, input: Target): Promise<ChangeRequest> {
  return transition(db, input, ["preview"], {
    status: "revisions",
    revisionRounds: sql`${changeRequests.revisionRounds} + 1`,
  });
}

export function markChangeShipped(db: Runner, input: Target & { readonly actualMinutes: number }): Promise<ChangeRequest> {
  return transition(db, input, ["approved"], {
    status: "shipped",
    shippedAt: input.now,
    closedAt: input.now,
    actualMinutes: input.actualMinutes,
  });
}

export function declineChangeRequest(db: Runner, input: Target & { readonly reason: string }): Promise<ChangeRequest> {
  return transition(db, input, ["requested", "quoted"], { status: "declined", declinedReason: input.reason, closedAt: input.now });
}

export function withdrawChangeRequest(db: Runner, input: Target): Promise<ChangeRequest> {
  return transition(db, input, WITHDRAWABLE, { status: "withdrawn", closedAt: input.now });
}

export interface ChangePaymentInput {
  readonly businessId: string;
  readonly requestId: string;
  readonly reference: string;
  readonly staffUserId: string;
  readonly paidAt: Date;
}

/** Records money for a shipped, paid change. Only once: a request already marked paid matches no row. */
export async function recordChangePayment(db: Runner, input: ChangePaymentInput): Promise<ChangeRequest> {
  const rows = await db
    .update(changeRequests)
    .set({ paidAt: input.paidAt, paymentReference: input.reference, paymentRecordedByUserId: input.staffUserId })
    .where(
      and(
        eq(changeRequests.id, input.requestId),
        eq(changeRequests.businessId, input.businessId),
        eq(changeRequests.status, "shipped"),
        sql`${changeRequests.quotedAmountCents} > 0`,
        isNull(changeRequests.paidAt),
      ),
    )
    .returning();
  const row = rows[0];
  if (row === undefined) throw new ChangeRequestNotInStateError(input.requestId, ["shipped"]);
  return row;
}

/** The business's open request, or null. Works on the staff connection and inside a tenant scope. */
export async function findOpenChangeRequest(db: Runner, businessId: string): Promise<ChangeRequest | null> {
  const rows = await db
    .select()
    .from(changeRequests)
    .where(and(eq(changeRequests.businessId, businessId), notInArray(changeRequests.status, [...CLOSED_CHANGE_REQUEST_STATUSES])))
    .limit(1);
  return rows[0] ?? null;
}

/** Every request, newest first. */
export function listChangeRequests(db: Runner, businessId: string): Promise<ChangeRequest[]> {
  return db
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.businessId, businessId))
    .orderBy(desc(changeRequests.createdAt));
}

/** The estimates that used free time: every request that went ahead. Feed to freeMinutesRemaining. */
export async function usedFreeEstimateMinutes(db: Runner, businessId: string): Promise<number[]> {
  const rows = await db
    .select({ minutes: changeRequests.estimateMinutes })
    .from(changeRequests)
    .where(and(eq(changeRequests.businessId, businessId), inArray(changeRequests.status, [...WENT_AHEAD])));
  return rows.map((row) => row.minutes).filter((minutes): minutes is number => minutes !== null);
}
```

Then export it from `packages/db/src/index.ts`, next to the `./queries/projects` block:

```ts
export * from "./queries/change-requests";
```

One point to check while implementing: `usedFreeEstimateMinutes` counts a request that is still in progress, which is correct, because accepting it reserved the time. The test "counts only estimates that went ahead" covers the withdrawn case. If the customer withdraws after `in_progress`, the estimate should stop counting, and it does, because `withdrawn` is not in `WENT_AHEAD`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter @fynix/db exec vitest run --config vitest.integration.config.ts src/change-requests.integration.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/change-requests.ts packages/db/src/index.ts packages/db/src/change-requests.integration.test.ts
git commit -m "Change request transitions: one conditional update each, one open request per business"
```

---

### Task 4: Status copy shared by both apps

**Files:**
- Create: `packages/shared/src/lib/change-request-status.ts`
- Test: `packages/shared/src/lib/change-request-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CHANGE_REQUEST_STATUS_COPY, isWaitingOnStaff } from "./change-request-status";

describe("change request status copy", () => {
  it("has a customer line and a staff label for every status", () => {
    for (const copy of Object.values(CHANGE_REQUEST_STATUS_COPY)) {
      expect(copy.customer.length).toBeGreaterThan(0);
      expect(copy.staffLabel.length).toBeGreaterThan(0);
    }
  });

  it("knows which statuses wait on the team", () => {
    expect(isWaitingOnStaff("requested")).toBe(true);
    expect(isWaitingOnStaff("in_progress")).toBe(true);
    expect(isWaitingOnStaff("revisions")).toBe(true);
    expect(isWaitingOnStaff("approved")).toBe(true);
    expect(isWaitingOnStaff("quoted")).toBe(false);
    expect(isWaitingOnStaff("preview")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/change-request-status.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

```ts
import { CHANGE_REQUEST_STATUSES_WAITING_ON_STAFF, type ChangeRequestStatus } from "@fynix/db";

interface StatusCopy {
  /** One line for the customer's dashboard. */
  readonly customer: string;
  /** A short badge for the staff console. */
  readonly staffLabel: string;
}

export const CHANGE_REQUEST_STATUS_COPY: Readonly<Record<ChangeRequestStatus, StatusCopy>> = {
  requested: { customer: "We’ve got your request and will reply with an estimate.", staffLabel: "Needs an estimate" },
  quoted: { customer: "Your estimate is ready. Accept it and we’ll start.", staffLabel: "Waiting for acceptance" },
  in_progress: { customer: "We’re working on it.", staffLabel: "In progress" },
  preview: { customer: "Your preview is ready to look at.", staffLabel: "Preview sent" },
  revisions: { customer: "We’re making the changes you asked for.", staffLabel: "Changes requested" },
  approved: { customer: "Approved. We’re putting it live.", staffLabel: "Approved: merge and ship" },
  shipped: { customer: "Live on your website.", staffLabel: "Shipped" },
  declined: { customer: "We couldn’t take this one on.", staffLabel: "Declined" },
  withdrawn: { customer: "You withdrew this request.", staffLabel: "Withdrawn" },
};

const WAITING_ON_STAFF: ReadonlySet<ChangeRequestStatus> = new Set(CHANGE_REQUEST_STATUSES_WAITING_ON_STAFF);

/** Whether the next move is the team's: used for the admin overview's "Waiting on us". */
export function isWaitingOnStaff(status: ChangeRequestStatus): boolean {
  return WAITING_ON_STAFF.has(status);
}
```

This module reaches client components, so importing a value from the `@fynix/db` index would pull the database driver into the browser bundle. If `@fynix/db` has no client-safe subpath for schema constants, move `CHANGE_REQUEST_STATUSES_WAITING_ON_STAFF` and the status union into a dependency-free file (`packages/db/src/schema/change-request-statuses.ts`, which has no drizzle imports), export it through a `package.json` subpath the way `@fynix/billing/tax` is, and import it from there in both places.

- [ ] **Step 4: Run it and see it pass**, then **commit**

```bash
pnpm --filter @fynix/shared exec vitest run src/lib/change-request-status.test.ts
git add packages/shared/src/lib/change-request-status.ts packages/shared/src/lib/change-request-status.test.ts
git commit -m "Shared wording for each change request status"
```

---

### Task 5: Emails

**Files:**
- Create: `packages/email/src/templates/change-request-update.ts`
- Create: `packages/email/src/templates/change-request-team.ts`
- Modify: `packages/email/src/index.ts`, `packages/email/src/templates/templates.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `templates.test.ts`)

```ts
import { changeRequestTeamEmail, changeRequestUpdateEmail } from "../index";

describe("changeRequestUpdateEmail", () => {
  it("tells the customer the price and where to accept it", () => {
    const email = changeRequestUpdateEmail({
      to: "riley@example.com", businessName: "Harbour Bakery", event: { kind: "quoted", amount: "₹3,363" },
      dashboardUrl: "https://app.fynix.digital/changes",
    });
    expect(email.template).toBe("change-request-update");
    expect(email.bodyText).toContain("₹3,363");
    expect(email.bodyText).toContain("https://app.fynix.digital/changes");
  });

  it("links the preview", () => {
    const email = changeRequestUpdateEmail({
      to: "riley@example.com", businessName: "Harbour Bakery",
      event: { kind: "preview", previewUrl: "https://harbour-git-menu.vercel.app" },
      dashboardUrl: "https://app.fynix.digital/changes",
    });
    expect(email.bodyHtml).toContain('href="https://harbour-git-menu.vercel.app"');
  });

  it("escapes a decline reason", () => {
    const email = changeRequestUpdateEmail({
      to: "riley@example.com", businessName: "Harbour Bakery", event: { kind: "declined", reason: "<b>no</b>" },
      dashboardUrl: "https://app.fynix.digital/changes",
    });
    expect(email.bodyHtml).not.toContain("<b>no</b>");
  });
});

describe("changeRequestTeamEmail", () => {
  it("names the business, the event and the admin link", () => {
    const email = changeRequestTeamEmail({
      to: "team@fynix.digital", businessName: "Harbour Bakery", event: "requested",
      clientUrl: "https://console.fynix.digital/clients/abc",
    });
    expect(email.template).toBe("change-request-team");
    expect(email.subject).toContain("Harbour Bakery");
    expect(email.bodyText).toContain("https://console.fynix.digital/clients/abc");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @fynix/email exec vitest run`
Expected: FAIL, the exports don't exist.

- [ ] **Step 3: Implement the customer email**

```ts
import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

export type ChangeRequestCustomerEvent =
  | { readonly kind: "quoted"; readonly amount: string }
  | { readonly kind: "preview"; readonly previewUrl: string }
  | { readonly kind: "shipped" }
  | { readonly kind: "declined"; readonly reason: string };

export interface ChangeRequestUpdateInput {
  readonly to: string;
  readonly businessName: string;
  readonly event: ChangeRequestCustomerEvent;
  /** The customer's Changes page, where they accept or approve. */
  readonly dashboardUrl: string;
}

/** Every change-request message to the customer: one template, one paragraph set per event. */
export function changeRequestUpdateEmail(input: ChangeRequestUpdateInput): EmailMessage {
  const dashboardUrl = assertWebUrl(input.dashboardUrl, "dashboardUrl");
  const { subject, paragraphs, link } = content(input);
  const text = [...paragraphs, ...(link === null ? [] : [link]), dashboardUrl];
  const html = [
    ...paragraphs.map(escapeHtml),
    ...(link === null ? [] : [`<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`]),
    `<a href="${escapeHtml(dashboardUrl)}">Open your dashboard</a>`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "change-request-update",
    bodyText: text.join("\n\n"),
    bodyHtml: htmlDocument(subject, html),
  };
}

function content(input: ChangeRequestUpdateInput): { subject: string; paragraphs: string[]; link: string | null } {
  const { event, businessName } = input;
  switch (event.kind) {
    case "quoted":
      return {
        subject: "Your change estimate is ready",
        paragraphs: [`Your change for ${businessName} comes to ${event.amount}.`, "Accept it in your dashboard and we’ll start."],
        link: null,
      };
    case "preview":
      return {
        subject: "Your change is ready to look at",
        paragraphs: [`Here’s a preview of your change for ${businessName}:`, "Approve it in your dashboard, or ask for another round."],
        link: assertWebUrl(event.previewUrl, "previewUrl"),
      };
    case "shipped":
      return { subject: "Your change is live", paragraphs: [`Your change for ${businessName} is now live on your website.`], link: null };
    case "declined":
      return {
        subject: "About your change request",
        paragraphs: [`We couldn’t take on your change for ${businessName}:`, event.reason],
        link: null,
      };
  }
}
```

- [ ] **Step 4: Implement the team email**

```ts
import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

export type ChangeRequestTeamEvent = "requested" | "accepted" | "approved" | "revisions" | "withdrawn";

const HEADLINES: Readonly<Record<ChangeRequestTeamEvent, string>> = {
  requested: "asked for a change",
  accepted: "accepted the estimate",
  approved: "approved the preview: merge and ship",
  revisions: "asked for another round",
  withdrawn: "withdrew their change request",
};

export interface ChangeRequestTeamInput {
  readonly to: string;
  readonly businessName: string;
  readonly event: ChangeRequestTeamEvent;
  readonly clientUrl: string;
}

export function changeRequestTeamEmail(input: ChangeRequestTeamInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const subject = sanitizeHeaderValue(`${input.businessName} ${HEADLINES[input.event]}`);
  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "change-request-team",
    bodyText: [subject, clientUrl].join("\n\n"),
    bodyHtml: htmlDocument(subject, [escapeHtml(subject), `<a href="${escapeHtml(clientUrl)}">Open the client</a>`]),
  };
}
```

- [ ] **Step 5: Export both** from `packages/email/src/index.ts`:

```ts
export * from "./templates/change-request-update";
export * from "./templates/change-request-team";
```

- [ ] **Step 6: Run and commit**

```bash
pnpm --filter @fynix/email exec vitest run
git add packages/email/src
git commit -m "Change request emails: one to the customer, one to the team"
```

---

### Task 6: Customer operations (platform server)

**Files:**
- Create: `apps/platform/lib/server/change-requests.ts`
- Test: `apps/platform/lib/server/change-requests.test.ts`

What it does: every customer action checks the website is live (`getLiveWebsite()` from `lib/server/onboarding.ts` returns non-null), runs the query on `getStaffDb()`, then sends the team email. The email is best-effort and never undoes the write, the same as `respondToPreview` in `lib/server/project-response.ts`.

- [ ] **Step 1: Write the failing tests.** Follow `apps/platform/lib/server/project-response.test.ts`: `vi.mock("server-only")`, mock `@fynix/db` and `@fynix/email`, and set `process.env.FYNIX_TEAM_EMAIL`.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptChangeQuote, approveChangePreview, createChangeRequest, requestChangeRevisions, withdrawChangeRequest } from "@fynix/db";
import { changeRequestTeamEmail, createOutboxTransport } from "@fynix/email";
import { respondToChange, submitChangeRequest } from "./change-requests";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "https://console.fynix.digital" }) }));
vi.mock("@fynix/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fynix/db")>()),
  createChangeRequest: vi.fn(),
  acceptChangeQuote: vi.fn(),
  approveChangePreview: vi.fn(),
  requestChangeRevisions: vi.fn(),
  withdrawChangeRequest: vi.fn(),
}));
vi.mock("@fynix/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fynix/email")>()),
  createOutboxTransport: vi.fn(),
}));

const send = vi.fn();
const db = {} as never;
const NOW = new Date("2026-10-01T10:00:00.000Z");
const TENANT = { businessId: "b-1", businessName: "Harbour Bakery", userId: "u-1" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FYNIX_TEAM_EMAIL = "team@fynix.digital";
  vi.mocked(createOutboxTransport).mockReturnValue({ send } as never);
});

describe("submitChangeRequest", () => {
  it("trims the description, refuses an empty or over-long one, and tells the team", async () => {
    await expect(submitChangeRequest(db, TENANT, "   ", NOW)).resolves.toEqual({ ok: false, message: "Tell us what you’d like changed." });
    await expect(submitChangeRequest(db, TENANT, "x".repeat(2_001), NOW)).resolves.toMatchObject({ ok: false });

    vi.mocked(createChangeRequest).mockResolvedValue({ id: "cr-1" } as never);
    await expect(submitChangeRequest(db, TENANT, "  New menu prices  ", NOW)).resolves.toEqual({ ok: true });
    expect(createChangeRequest).toHaveBeenCalledWith(db, { businessId: "b-1", userId: "u-1", description: "New menu prices", now: NOW });
    expect(send).toHaveBeenCalledWith(changeRequestTeamEmail({
      to: "team@fynix.digital", businessName: "Harbour Bakery", event: "requested",
      clientUrl: "https://console.fynix.digital/clients/b-1",
    }));
  });

  it("keeps the request when the team email fails", async () => {
    vi.mocked(createChangeRequest).mockResolvedValue({ id: "cr-1" } as never);
    send.mockRejectedValueOnce(new Error("outbox down"));
    await expect(submitChangeRequest(db, TENANT, "New menu prices", NOW)).resolves.toEqual({ ok: true });
  });
});

describe("respondToChange", () => {
  it.each([
    ["accept", acceptChangeQuote, "accepted"],
    ["approve", approveChangePreview, "approved"],
    ["revisions", requestChangeRevisions, "revisions"],
    ["withdraw", withdrawChangeRequest, "withdrawn"],
  ] as const)("%s runs its transition and tells the team", async (kind, query, event) => {
    vi.mocked(query).mockResolvedValue({ id: "cr-1" } as never);
    await respondToChange(db, TENANT, { kind, requestId: "cr-1" }, NOW);
    expect(query).toHaveBeenCalledWith(db, { businessId: "b-1", requestId: "cr-1", now: NOW });
    expect(send).toHaveBeenCalledWith(changeRequestTeamEmail({
      to: "team@fynix.digital", businessName: "Harbour Bakery", event,
      clientUrl: "https://console.fynix.digital/clients/b-1",
    }));
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @fynix/platform exec vitest run lib/server/change-requests.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Implement**

```ts
import "server-only";
import {
  acceptChangeQuote,
  approveChangePreview,
  createChangeRequest,
  MAX_CHANGE_REQUEST_LENGTH,
  requestChangeRevisions,
  withdrawChangeRequest,
  type Database,
} from "@fynix/db";
import { changeRequestTeamEmail, createOutboxTransport, type ChangeRequestTeamEvent } from "@fynix/email";
import { cleanMultiline } from "@fynix/shared/lib/validation/text";
import { serverEnv } from "./env";

export type ChangeFormResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface ChangeTenant {
  readonly businessId: string;
  readonly businessName: string;
  readonly userId: string;
}

export type ChangeResponse = {
  readonly kind: "accept" | "approve" | "revisions" | "withdraw";
  readonly requestId: string;
};

const RESPONSES = {
  accept: { run: acceptChangeQuote, event: "accepted" },
  approve: { run: approveChangePreview, event: "approved" },
  revisions: { run: requestChangeRevisions, event: "revisions" },
  withdraw: { run: withdrawChangeRequest, event: "withdrawn" },
} as const satisfies Record<ChangeResponse["kind"], { run: unknown; event: ChangeRequestTeamEvent }>;

/**
 * Opens a change request after the caller proved the business is theirs and its website is live. Runs as staff for
 * the same reason as every customer-triggered transition (see approveProjectPreview in @fynix/db).
 */
export async function submitChangeRequest(db: Database, tenant: ChangeTenant, description: string, now: Date): Promise<ChangeFormResult> {
  const cleaned = cleanMultiline(description);
  if (cleaned === "") return { ok: false, message: "Tell us what you’d like changed." };
  if (cleaned.length > MAX_CHANGE_REQUEST_LENGTH) {
    return { ok: false, message: `Keep it under ${MAX_CHANGE_REQUEST_LENGTH.toLocaleString("en")} characters; we’ll talk through the details.` };
  }
  await createChangeRequest(db, { businessId: tenant.businessId, userId: tenant.userId, description: cleaned, now });
  await notifyTeam(db, tenant, "requested");
  return { ok: true };
}

export async function respondToChange(db: Database, tenant: ChangeTenant, response: ChangeResponse, now: Date): Promise<void> {
  const { run, event } = RESPONSES[response.kind];
  await run(db, { businessId: tenant.businessId, requestId: response.requestId, now });
  await notifyTeam(db, tenant, event);
}

/** Best-effort, after the write has committed: a failed email must never undo what the customer did. */
async function notifyTeam(db: Database, tenant: ChangeTenant, event: ChangeRequestTeamEvent): Promise<void> {
  const teamInbox = process.env.FYNIX_TEAM_EMAIL;
  if (teamInbox === undefined || teamInbox.trim() === "") {
    console.error("FYNIX_TEAM_EMAIL is not set, so nobody was told about a change request.", { businessId: tenant.businessId, event });
    return;
  }
  const clientUrl = new URL(`/clients/${tenant.businessId}`, serverEnv().ADMIN_ORIGIN).toString();
  try {
    await createOutboxTransport(db).send(changeRequestTeamEmail({ to: teamInbox, businessName: tenant.businessName, event, clientUrl }));
  } catch (error) {
    console.error("A change request was recorded but the team notification failed.", { businessId: tenant.businessId, event, error });
  }
}
```

Check two names while implementing: that `cleanMultiline` exists at `@fynix/shared/lib/validation/text` (the blog actions use it), and that `MAX_CHANGE_REQUEST_LENGTH` is exported from `@fynix/db` through the schema (Task 2).

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @fynix/platform exec vitest run lib/server/change-requests.test.ts
git add apps/platform/lib/server/change-requests.ts apps/platform/lib/server/change-requests.test.ts
git commit -m "Customer change-request operations: submit, accept, approve, revise, withdraw"
```

---

### Task 7: Customer "Changes" page

**Files:**
- Create: `apps/platform/app/app-host/(protected)/changes/actions.ts`
- Create: `apps/platform/app/app-host/(protected)/changes/page.tsx`
- Create: `apps/platform/components/panel/change-request-form.tsx`
- Modify: `apps/platform/app/app-host/(protected)/project/page.tsx` (the live "Something bigger?" card)
- Modify: `apps/platform/components/panel/customer-shell.tsx` (nav items, line ~31)

- [ ] **Step 1: Server actions**

```ts
"use server";

import { ChangeRequestAlreadyOpenError, ChangeRequestNotInStateError } from "@fynix/db";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { getLiveWebsite } from "@/lib/server/onboarding";
import { respondToChange, submitChangeRequest, type ChangeFormResult, type ChangeResponse } from "@/lib/server/change-requests";

const idSchema = z.uuid();

async function liveTenant() {
  const { user, tenant } = await requireCustomerAccess();
  if ((await getLiveWebsite()) === null) redirect("/project");
  return { businessId: tenant.businessId, businessName: tenant.businessName, userId: user.id };
}

export async function submitChangeRequestAction(_previous: ChangeFormResult, formData: FormData): Promise<ChangeFormResult> {
  const tenant = await liveTenant();
  try {
    const result = await submitChangeRequest(getStaffDb(), tenant, String(formData.get("description") ?? ""), new Date());
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof ChangeRequestAlreadyOpenError) {
      return { ok: false, message: "You already have a change with us. We’ll take the next one when it’s done." };
    }
    throw error;
  }
}

async function respond(kind: ChangeResponse["kind"], formData: FormData): Promise<void> {
  const tenant = await liveTenant();
  const requestId = idSchema.parse(formData.get("requestId"));
  try {
    await respondToChange(getStaffDb(), tenant, { kind, requestId }, new Date());
  } catch (error) {
    if (error instanceof ChangeRequestNotInStateError) redirect("/changes?notice=out-of-date");
    throw error;
  }
  redirect(`/changes?notice=${kind}`);
}

export async function acceptChangeQuoteAction(formData: FormData): Promise<void> { await respond("accept", formData); }
export async function approveChangeAction(formData: FormData): Promise<void> { await respond("approve", formData); }
export async function requestChangeRevisionsAction(formData: FormData): Promise<void> { await respond("revisions", formData); }
export async function withdrawChangeAction(formData: FormData): Promise<void> { await respond("withdraw", formData); }
```

Make sure `requireCustomerAccess()` returns `user`. It does: `GrantedCustomer` has `user: SessionUser`. Also check that `user.id` is the Better Auth user id (text), which `change_requests.requested_by_user_id` references.

- [ ] **Step 2: The request form (client component)**

```tsx
"use client";

import { useActionState, type ReactElement } from "react";
import { Button } from "@fynix/shared/ui/panel/button";
import type { ChangeFormResult } from "@/lib/server/change-requests";

const initialState: ChangeFormResult = { ok: true };

export function ChangeRequestForm({
  action,
}: {
  readonly action: (previous: ChangeFormResult, formData: FormData) => Promise<ChangeFormResult>;
}): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="rounded-card border border-line bg-card p-6 sm:p-8">
      <label htmlFor="description" className="text-sm font-medium">What would you like changed?</label>
      <p className="mt-0.5 text-sm text-ink-soft">New prices, a photo, a line of text. We’ll reply with an estimate before we start.</p>
      <textarea
        id="description"
        name="description"
        required
        rows={5}
        maxLength={2000}
        className="mt-2 block w-full rounded-control border border-line bg-paper px-3 py-2.5 text-base text-ink focus:border-accent"
      />
      {state.ok ? null : <p role="alert" className="mt-2 text-sm text-accent-deep">{state.message}</p>}
      <Button type="submit" size="sm" disabled={isPending} aria-busy={isPending} className="mt-4">
        {isPending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
```

Importing the `ChangeFormResult` type from a `server-only` module is type-only and is erased at build. If lint's import rules object, move the type into `apps/platform/lib/change-request-form.ts` and import it from there in both files.

- [ ] **Step 3: The page.** It must be a server component that:
  1. calls `requireCustomerAccess()`, and redirects to `/project` when `getLiveWebsite()` is null;
  2. reads the open request and the history with `withTenantScope(getAppDb(), { userId, businessId }, (tx) => …)` using `findOpenChangeRequest` and `listChangeRequests`. The customer's own connection reads under row-level security, which is what the `change_requests_tenant_select` policy is for;
  3. with no open request, renders `ChangeRequestForm action={submitChangeRequestAction}` and the free-time line. Compute that line with `freeMinutesRemaining(plan, usedMinutes)` from Task 1. The plan comes from `billing.plan`, and `usedMinutes` from `usedFreeEstimateMinutes` on the same scoped transaction. Show "You have N minutes of free change time left." or "Your free change time is used; changes are {hourly} an hour.";
  4. with an open request, shows its description, `CHANGE_REQUEST_STATUS_COPY[status].customer`, and exactly one set of actions:
     - `quoted`: the frozen amount `formatMoney(quotedAmountCents, currency)`, an **Accept** button (`acceptChangeQuoteAction`) and a **Withdraw** button;
     - `preview`: a **View your preview** link (`safeExternalHref(previewUrl)`), **Approve** (`approveChangeAction`) and **Ask for another round** (`requestChangeRevisionsAction`), reusing the layout of `components/panel/preview-review-actions.tsx`, including its Calendly link;
     - `requested`, `in_progress`, `revisions`: a **Withdraw** button only;
     - `approved`: no buttons;
     - every button is a `<form action={…}><input type="hidden" name="requestId" value={request.id} /><SubmitButton …/></form>`;
  5. lists closed requests below it: date, description (first 140 characters), status copy, and "Paid" or "{amount} due" for shipped paid ones;
  6. shows a notice from `?notice=` using a fixed-copy map, never echoing the parameter (the same pattern as `lib/project-response-notices.ts`): `accept`, `approve`, `revisions`, `withdraw` and `out-of-date`.

  Export `metadata = { title: "Changes" }`.

- [ ] **Step 4: Entry points.** In `project/page.tsx`, change the live "Something bigger?" card's "email us" text to a `ButtonLink href="/changes"` reading "Request a change". Add `{ href: "/changes", label: "Changes", icon: … }` to the nav items in `components/panel/customer-shell.tsx`, shown only when the website is live. Pass a `hasLiveWebsite` prop from the layout that renders the shell, and read both files before editing.

- [ ] **Step 5: Check it in a browser.** Start the platform dev server (`preview_start` with the `fynix_platform-platform-dev` config), sign in as a live test customer and:
  - submit a request, then check the form is replaced by "We’ve got your request";
  - withdraw it, then check the form is back;
  - a second submit while one is open shows "You already have a change with us";
  - `?notice=<script>` shows nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/app/app-host/\(protected\)/changes apps/platform/components/panel/change-request-form.tsx apps/platform/app/app-host/\(protected\)/project/page.tsx apps/platform/components/panel/customer-shell.tsx
git commit -m "Customers request, accept, approve and withdraw website changes from a Changes page"
```

---

### Task 8: Staff operations (admin server)

**Files:**
- Create: `apps/admin/lib/server/change-requests.ts`
- Test: `apps/admin/lib/server/change-requests.test.ts`

- [ ] **Step 1: Write the failing tests** (the same mocking style as `apps/admin/lib/server/project-preview.test.ts`):
  - `estimateChange` takes 120 minutes for an INR business with 0 free minutes left. Expect `recordChangeQuote` to be called with `amountCents: 336300, currency: "INR"`, and the customer to be emailed `changeRequestUpdateEmail({ event: { kind: "quoted", amount: "₹3,363" } … })`.
  - `estimateChange` takes 30 minutes with 60 free. Expect `amountCents: 0`, and **no** "quoted" email (the request went straight to `in_progress`).
  - `sendChangePreviewTo` records the preview and emails the owner `{ kind: "preview", previewUrl }`.
  - `shipChange` records `actualMinutes` and emails `{ kind: "shipped" }`.
  - `declineChange` refuses an empty reason without calling the query, and otherwise emails `{ kind: "declined", reason }`.
  - Every function throws `ChangeRecipientMissingError` when `findClientDetail` has no owner, after the write (the same order as `sendProjectPreview`).

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @fynix/admin exec vitest run lib/server/change-requests.test.ts`

- [ ] **Step 3: Implement**

```ts
import "server-only";
import {
  declineChangeRequest,
  findClientDetail,
  findActivePlan,
  markChangeShipped,
  recordChangePayment,
  recordChangeQuote,
  sendChangePreview,
  usedFreeEstimateMinutes,
  type Database,
} from "@fynix/db";
import { changeRequestUpdateEmail, createOutboxTransport, type ChangeRequestCustomerEvent } from "@fynix/email";
import { freeMinutesRemaining, quoteChange } from "@fynix/shared/lib/billing/change-pricing";
import { formatMoney } from "@fynix/shared/lib/money";
import { serverEnv } from "./env";

export class ChangeRecipientMissingError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no owner to email about their change request.`);
    this.name = "ChangeRecipientMissingError";
  }
}

interface ChangeTarget {
  readonly businessId: string;
  readonly requestId: string;
}

async function emailOwner(db: Database, businessId: string, event: ChangeRequestCustomerEvent): Promise<void> {
  const client = await findClientDetail(db, businessId);
  if (client === null || client.owner === null) throw new ChangeRecipientMissingError(businessId);
  const dashboardUrl = new URL("/changes", serverEnv().APP_ORIGIN).toString();
  await createOutboxTransport(db).send(
    changeRequestUpdateEmail({ to: client.owner.email, businessName: client.businessName, event, dashboardUrl }),
  );
}

/** Staff estimate a request. The price is worked out here from the business's own plan and free time left. */
export async function estimateChange(db: Database, input: ChangeTarget & { readonly estimateMinutes: number }, now: Date): Promise<void> {
  const client = await findClientDetail(db, input.businessId);
  if (client === null) throw new ChangeRecipientMissingError(input.businessId);
  const plan = await findActivePlan(db, client.currency);
  if (plan === null) throw new Error(`No active ${client.currency} plan to price a change with.`);
  const free = freeMinutesRemaining(plan, await usedFreeEstimateMinutes(db, input.businessId));
  const quote = quoteChange(plan, input.estimateMinutes, free);

  const request = await recordChangeQuote(db, {
    ...input, amountCents: quote.amountCents, currency: quote.currency, now,
  });
  if (request.status === "quoted") {
    await emailOwner(db, input.businessId, { kind: "quoted", amount: formatMoney(quote.amountCents, quote.currency) });
  }
}

export async function sendChangePreviewTo(db: Database, input: ChangeTarget & { readonly previewUrl: string }, now: Date): Promise<void> {
  await sendChangePreview(db, { ...input, now });
  await emailOwner(db, input.businessId, { kind: "preview", previewUrl: input.previewUrl });
}

export async function shipChange(db: Database, input: ChangeTarget & { readonly actualMinutes: number }, now: Date): Promise<void> {
  await markChangeShipped(db, { ...input, now });
  await emailOwner(db, input.businessId, { kind: "shipped" });
}

export async function declineChange(db: Database, input: ChangeTarget & { readonly reason: string }, now: Date): Promise<boolean> {
  const reason = input.reason.trim();
  if (reason === "") return false;
  await declineChangeRequest(db, { ...input, reason, now });
  await emailOwner(db, input.businessId, { kind: "declined", reason });
  return true;
}

export function recordChangePaymentBy(
  db: Database,
  input: ChangeTarget & { readonly reference: string; readonly staffUserId: string; readonly paidAt: Date },
) {
  return recordChangePayment(db, input);
}
```

`findActivePlan(db, currency)` exists in `packages/db/src/queries/billing.ts` (checked). Confirm while implementing that `findClientDetail` exposes the business's billing `currency` (it selects `businesses.currency`; add it to the returned type if it isn't there), and that `APP_ORIGIN` is in the admin's `serverEnv()` (the admin sends setup links pointing at the app).

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @fynix/admin exec vitest run lib/server/change-requests.test.ts
git add apps/admin/lib/server/change-requests.ts apps/admin/lib/server/change-requests.test.ts
git commit -m "Staff change-request operations: estimate, preview, ship, decline, record payment"
```

---

### Task 9: Admin client page panel

**Files:**
- Create: `apps/admin/app/(protected)/clients/[businessId]/change-request-actions.ts`
- Create: `apps/admin/components/change-request-panel.tsx`
- Create: `packages/shared/src/lib/change-request-notices.ts`
- Modify: `apps/admin/app/(protected)/clients/[businessId]/page.tsx`

- [ ] **Step 1: Notices.** Fixed copy keyed by a query value, in the same shape as `packages/shared/src/lib/project-preview-notices.ts` (read it and copy its structure):
  - `estimated`: "Estimate sent." or "Within their free time: marked in progress.", depending on the result;
  - `preview-sent`, `shipped`, `declined`, `paid`;
  - `invalid`: "Check the form: a positive number of minutes, a valid https link, or a reason.";
  - `out-of-date`: "That request has moved on. Reload to see where it is.";
  - `no-owner`.

  Export `changeRequestNoticeHref(businessId, notice)` and `readChangeRequestNotice(value)`.

- [ ] **Step 2: Server actions.** Each action:
  - calls `requireStaffAccess()`;
  - reads `businessId` and `requestId` with `z.uuid()`;
  - validates its own input: `estimateMinutes` with `z.coerce.number().int().min(1).max(100 * 60)`; `previewUrl` with the same `z.url({ protocol: /^https?$/ })` as `sendPreviewAction`; `actualMinutes` as an integer ≥ 1; `reason` non-empty and at most 500 characters; `reference` non-empty and at most 120 characters;
  - calls the Task 8 function;
  - maps `ChangeRequestNotInStateError` to `out-of-date` and `ChangeRecipientMissingError` to `no-owner`;
  - calls `revalidatePath` for `/`, `/clients` and `/clients/${businessId}`;
  - redirects to the notice.

  Follow `apps/admin/app/(protected)/clients/[businessId]/actions.ts` exactly for structure.

- [ ] **Step 3: The panel.** A server component taking `{ businessId, open: ChangeRequest | null, history: ChangeRequest[], freeMinutes: number, hourly: string }`:
  - the heading "Change requests", with a badge `CHANGE_REQUEST_STATUS_COPY[status].staffLabel`;
  - the open request's description in full (whitespace preserved, `whitespace-pre-wrap`), and when it was asked;
  - exactly one form for the status:
    - `requested`: minutes estimate, the line "{freeMinutes} free minutes left, then {hourly}/hour", **Send estimate**, and a separate **Decline** form with a reason;
    - `quoted`: "Waiting for them to accept {amount}", plus **Decline**;
    - `in_progress` or `revisions`: a preview link input and **Send preview**. For `revisions`, add the line "They asked for another round: book a call if the change isn't clear";
    - `preview`: "Waiting for them" and the link;
    - `approved`: the line "Merge the branch into main in their repo; Vercel deploys it. Then:", an actual minutes input and **Mark shipped**;
  - history: every closed request with its dates, estimate and actual minutes, amount, and for shipped paid ones either "Paid {date} · {reference}" or a **Record payment** form (reference plus the date the money arrived, reusing `apps/admin/components/received-date-input.tsx`).

- [ ] **Step 4: Render it** on the client page when the latest project is `live`, after the Build section. Load `open`, `history` and `freeMinutes` in the page's existing data loading, with the staff db, `findOpenChangeRequest`, `listChangeRequests`, `usedFreeEstimateMinutes` and `freeMinutesRemaining`.

- [ ] **Step 5: Check it in a browser**, with the admin dev server (`fynix-admin-dev`) and a live test client that has an open request:
  - estimate 30 minutes on a fresh client: it shows "Within their free time", and the customer's page shows "We’re working on it";
  - estimate 120 on a second request: the customer sees the amount and Accept;
  - send a preview, approve as the customer, mark shipped, record the payment, and check each step's notice and email in the Dev outbox.

- [ ] **Step 6: Commit**

```bash
git add apps/admin packages/shared/src/lib/change-request-notices.ts
git commit -m "Staff handle change requests from the client page: estimate, preview, ship, decline, payment"
```

---

### Task 10: "Waiting on us" and "Money owed" on the admin overview

**Files:**
- Modify: `apps/admin/app/(protected)/page.tsx`
- Modify: `packages/db/src/queries/change-requests.ts` (+ integration test)

- [ ] **Step 1: Write the failing integration test** for `listChangeRequestsNeedingStaff(db)`: it returns every open request whose status `isWaitingOnStaff` (requested, in_progress, revisions, approved), with `businessId`, `businessName`, `status` and `createdAt`, oldest first. Also `listUnpaidShippedChanges(db)` returns shipped requests with `quoted_amount_cents > 0` and `paid_at is null`.

- [ ] **Step 2: Implement both** with a join on `businesses` for the name. Filter with `CHANGE_REQUEST_STATUSES_WAITING_ON_STAFF` from Task 2, the same list the shared copy in Task 4 uses.

- [ ] **Step 3: Render** them on the overview under the existing "Waiting on us" card: a row per request ("{business}: {staffLabel}", linking to `/clients/{id}`), and a new "Money owed for changes" card listing unpaid shipped changes with their amounts.

- [ ] **Step 4: Run the tests and check the page in a browser**, then **commit**

```bash
git add packages/db apps/admin
git commit -m "Show change requests waiting on the team, and unpaid changes, on the overview"
```

---

### Task 11: Full check and PR

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test`. All pass, with 0 lint warnings.
- [ ] **Step 2:** `pnpm test:integration`. All pass, including `change-requests.integration.test.ts`.
- [ ] **Step 3:** `pnpm build`. Both apps build.
- [ ] **Step 4:** Walk through the whole flow once in the browser: the customer asks; staff estimate (paid); the customer accepts; staff send a Vercel preview link; the customer asks for another round; staff send a preview; the customer approves; staff mark it shipped and record the payment. Check the Dev outbox has, in order: team "asked for a change", customer "estimate", team "accepted", customer "preview", team "another round", customer "preview", team "approved", customer "live".
- [ ] **Step 5:** Push the branch and open a PR into `development`. The PR body lists the two new migrations (`0040`, `0041`); CI's `database` job applies them to an empty Postgres 16 database.

---

## Not in this plan (and why)

- **Automatic merge on approval.** It needs GitHub access to every client repo. Staff merge by hand, and "Mark shipped" records it.
- **Online payment for extra hours.** The payment provider only does subscriptions today. The money is recorded as owed and collected by hand.
- **Photos or attachments on a request.** Uploads are on hold with the blog-media decision. The customer can describe the change, and staff can call.
- **Vercel preview links needing a Vercel login.** This is a Vercel project setting, not code: in each client project, turn Deployment Protection off for Preview deployments, or share a protection-bypass link. Add this to the client-site setup checklist.
- **Blog "Preview on my website".** It's a separate plan (Plan B) and depends on the blog-media decision for cover images.

## Self-review

- **Spec coverage:**
  - written request (Task 7);
  - estimate, with acceptance when paid (Tasks 1, 3, 8, 7);
  - preview link, then approve or another round (Tasks 3, 7, 9);
  - staff merge, then Mark shipped (Task 9);
  - hours recorded, money collected by hand (Tasks 3, 9, 10);
  - first hour free once (Task 1, with `usedFreeEstimateMinutes` in Task 3);
  - emails both ways (Tasks 5, 6, 8).
- **Names are consistent across tasks:**
  - `recordChangeQuote`, `acceptChangeQuote`, `sendChangePreview`, `approveChangePreview`, `requestChangeRevisions`, `markChangeShipped`, `declineChangeRequest`, `withdrawChangeRequest`, `recordChangePayment`, `findOpenChangeRequest`, `listChangeRequests`, `usedFreeEstimateMinutes` (defined in Task 3, used in Tasks 6, 8, 9 and 10);
  - `quoteChange` and `freeMinutesRemaining` (Task 1, used in Tasks 7 and 8);
  - `changeRequestUpdateEmail` and `changeRequestTeamEmail` (Task 5, used in Tasks 6 and 8).
- **Checked against the code:** `billingCurrency` (Task 2), `findActivePlan` (Task 8), and the nav in `components/panel/customer-shell.tsx` (Task 7). Still to confirm while implementing: that `findClientDetail` returns `currency` (Task 8).
