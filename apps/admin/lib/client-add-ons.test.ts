import type { AddOnAssessment } from "@brandbasket/shared/server/basket-change";
import type { AddOnSubscriptionForStaff, BundledAddOn, PressRelease } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { clientAddOnRows, clientPressReleaseRows, clientAddOnOption, clientBundledAddOnRows } from "./client-add-ons";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-12T09:00:00.000Z");

function row(overrides: Partial<AddOnSubscriptionForStaff> & Pick<AddOnSubscriptionForStaff, "id">): AddOnSubscriptionForStaff {
  return {
    businessId: "business-1",
    addOn: "digital-growth",
    listAmountCents: 999_900,
    discountAmountCents: 0,
    offerDiscountAmountCents: 0,
    netAmountCents: 999_900,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: 1_179_882,
    currency: "INR",
    provider: "razorpay",
    providerSubscriptionId: `sub_${overrides.id}`,
    providerPlanId: null,
    providerStatus: null,
    status: "active",
    startAt: null,
    activatedAt: new Date("2026-10-12T09:00:00.000Z"),
    currentPeriodStart: new Date("2026-10-12T09:00:00.000Z"),
    currentPeriodEnd: PERIOD_END,
    haltedAt: null,
    endKind: null,
    endRequestedAt: null,
    endRequestedByStaffId: null,
    endedAt: null,
    continuesId: null,
    contactedAt: null,
    contactedByStaffId: null,
    createdAt: new Date("2026-10-12T09:00:00.000Z"),
    updatedAt: new Date("2026-10-12T09:00:00.000Z"),
    endRequestedByStaffName: null,
    ...overrides,
  };
}

describe("clientAddOnRows", () => {
  it("shows an active add-on with its price, next billing date and the buttons that end it", () => {
    const [shown] = clientAddOnRows([row({ id: "a" })], NOW);
    expect(shown).toMatchObject({
      id: "a",
      title: "Social Media and Ads",
      state: { tone: "done", label: "Active" },
      price: "₹9,999 + GST a month",
      dateLine: "Renews on 12 November 2026",
      endNote: null,
      canEnd: true,
      endsOnText: "12 November 2026",
      needsContact: true,
    });
  });

  it("says who scheduled a pause and when, and gives no end buttons once it is set", () => {
    const [shown] = clientAddOnRows(
      [
        row({
          id: "a",
          endKind: "pause",
          endRequestedAt: new Date("2026-10-18T09:00:00.000Z"),
          endRequestedByStaffId: "staff-1",
          endRequestedByStaffName: "Priya Shah",
        }),
      ],
      NOW,
    );
    expect(shown).toMatchObject({
      state: { tone: "waiting", label: "Pausing" },
      dateLine: "Pauses on 12 November 2026",
      endNote: "Paused by Priya Shah on 18 October 2026",
      canEnd: false,
    });
  });

  it("says when the customer ended it themselves", () => {
    const [shown] = clientAddOnRows(
      [row({ id: "a", endKind: "cancel", endRequestedAt: new Date("2026-10-18T09:00:00.000Z") })],
      NOW,
    );
    expect(shown).toMatchObject({
      state: { tone: "waiting", label: "Ending" },
      dateLine: "Ends on 12 November 2026",
      endNote: "Cancelled by the customer on 18 October 2026",
    });
  });

  it("shows a pause that has taken effect as paused since the billing date", () => {
    const [shown] = clientAddOnRows(
      [
        row({
          id: "a",
          status: "cancelled",
          endKind: "pause",
          endRequestedAt: new Date("2026-10-18T09:00:00.000Z"),
          endRequestedByStaffId: "staff-1",
          endRequestedByStaffName: "Priya Shah",
          endedAt: PERIOD_END,
        }),
      ],
      new Date("2026-11-20T09:00:00.000Z"),
    );
    expect(shown).toMatchObject({ state: { tone: "quiet", label: "Paused" }, dateLine: "Paused since 12 November 2026", canEnd: false });
  });

  it("leaves out an unpaid checkout and a row that was cancelled before it was ever paid", () => {
    const shown = clientAddOnRows(
      [
        row({ id: "checkout", status: "incomplete", activatedAt: null, currentPeriodEnd: null }),
        row({ id: "abandoned", status: "cancelled", activatedAt: null, currentPeriodEnd: null, endedAt: NOW }),
        row({ id: "paid" }),
      ],
      NOW,
    );
    expect(shown.map((entry) => entry.id)).toEqual(["paid"]);
  });

  it("shows a kept subscription as the one in force and the row it replaces as earlier", () => {
    const shown = clientAddOnRows(
      [
        row({
          id: "kept",
          status: "scheduled",
          activatedAt: null,
          currentPeriodEnd: null,
          currentPeriodStart: null,
          startAt: PERIOD_END,
          continuesId: "old",
          createdAt: new Date("2026-10-19T09:00:00.000Z"),
        }),
        row({ id: "old", endKind: "cancel", endRequestedAt: new Date("2026-10-15T09:00:00.000Z") }),
      ],
      NOW,
    );
    expect(shown.map((entry) => [entry.id, entry.state.label, entry.canEnd])).toEqual([
      ["kept", "Active", true],
      ["old", "Earlier", false],
    ]);
    expect(shown[0]).toMatchObject({ dateLine: "Renews on 12 November 2026", needsContact: false });
    expect(shown[1]).toMatchObject({ dateLine: "Paid until 12 November 2026" });
  });

  it("only lets the newest row of an add-on be ended, and lists each add-on on its own", () => {
    const shown = clientAddOnRows(
      [
        row({ id: "seo-new", createdAt: new Date("2026-10-12T09:00:00.000Z") }),
        row({
          id: "seo-old",
          status: "cancelled",
          endKind: "cancel",
          endRequestedAt: new Date("2026-08-01T09:00:00.000Z"),
          endedAt: new Date("2026-09-12T09:00:00.000Z"),
          currentPeriodEnd: new Date("2026-09-12T09:00:00.000Z"),
          createdAt: new Date("2026-08-12T09:00:00.000Z"),
        }),
        row({ id: "ads", addOn: "local-seo-aeo", netAmountCents: 800_000, listAmountCents: 800_000 }),
      ],
      NOW,
    );
    expect(Object.fromEntries(shown.map((entry) => [entry.id, [entry.state.label, entry.canEnd]]))).toEqual({
      "seo-new": ["Active", true],
      "seo-old": ["Earlier", false],
      ads: ["Active", true],
    });
    expect(shown.find((entry) => entry.id === "seo-old")?.dateLine).toBe("Ended on 12 September 2026");
    expect(shown.find((entry) => entry.id === "ads")?.title).toBe("Local SEO + AEO");
  });

  it("shows payment trouble in the words the customer sees, with no end buttons", () => {
    const [failing] = clientAddOnRows([row({ id: "a", status: "past_due" })], NOW);
    expect(failing).toMatchObject({ state: { tone: "problem", label: "Payment failing" }, canEnd: false, dateLine: null });
    const [failed] = clientAddOnRows([row({ id: "b", status: "halted", haltedAt: new Date("2026-10-18T09:00:00.000Z") })], NOW);
    expect(failed).toMatchObject({ state: { tone: "problem", label: "Payment failed" }, dateLine: "Customer can pay until 25 October 2026", canEnd: false });
  });

  it("marks a purchase as already followed up once it has been contacted", () => {
    const [shown] = clientAddOnRows([row({ id: "a", contactedAt: new Date("2026-10-13T09:00:00.000Z"), contactedByStaffId: "staff-1" })], NOW);
    expect(shown).toMatchObject({ needsContact: false, contactedOn: "13 October 2026" });
  });

  it("shows a row with impossible data as needing a look, so it never breaks the page", () => {
    const [shown] = clientAddOnRows([row({ id: "bad", currentPeriodEnd: null })], NOW);
    expect(shown).toMatchObject({ id: "bad", broken: true, state: { tone: "problem", label: "Needs a look" }, canEnd: false });
    const [fine] = clientAddOnRows([row({ id: "ok" })], NOW);
    expect(fine?.broken).toBe(false);
  });

  it("uses no em or en dashes", () => {
    const shown = clientAddOnRows(
      [
        row({ id: "a", endKind: "pause", endRequestedAt: NOW, endRequestedByStaffId: "s", endRequestedByStaffName: "Priya" }),
        row({ id: "b", addOn: "local-seo-aeo", status: "halted", haltedAt: NOW }),
        row({ id: "c", status: "past_due" }),
      ],
      NOW,
    );
    expect(JSON.stringify(shown)).not.toMatch(/[–—]/);
  });
});

describe("clientPressReleaseRows", () => {
  function release(overrides: Partial<PressRelease & { paidAt: Date | null; amountCents: number }> & Pick<PressRelease, "id">) {
    return {
      businessId: "business-1",
      chargeId: `charge-${overrides.id}`,
      status: "waiting" as const,
      statusChangedAt: null,
      statusChangedByStaffId: null,
      createdAt: new Date("2026-10-12T09:00:00.000Z"),
      paidAt: new Date("2026-10-12T08:00:00.000Z"),
      amountCents: 826_000,
      ...overrides,
    };
  }

  it("offers the steps ahead of a release and none behind it", () => {
    const rows = clientPressReleaseRows([
      release({ id: "a" }),
      release({ id: "b", status: "in_progress" }),
      release({ id: "c", status: "published" }),
    ]);
    expect(rows.map((entry) => [entry.id, entry.status, entry.state.label, entry.nextSteps])).toEqual([
      ["a", "waiting", "Waiting", ["in_progress", "published"]],
      ["b", "in_progress", "In progress", ["published"]],
      ["c", "published", "Published", []],
    ]);
    expect(rows[0]).toMatchObject({ state: { tone: "waiting" }, boughtOn: "12 October 2026", amount: "₹8,260 with GST" });
    expect(rows[1]?.state.tone).toBe("moving");
    expect(rows[2]?.state.tone).toBe("done");
  });

  it("falls back to the day the release was created when the charge has no payment time", () => {
    const [row] = clientPressReleaseRows([release({ id: "a", paidAt: null })]);
    expect(row?.boughtOn).toBe("12 October 2026");
  });
});

describe("clientBundledAddOnRows", () => {
  const SIGNED_UP = new Date("2026-10-19T00:00:00.000Z");
  const ADDED = new Date("2026-11-05T06:00:00.000Z");
  const NEXT_BILLING = new Date("2026-11-19T00:00:00.000Z");
  const context = { nextBillingOn: NEXT_BILLING, openChargeCents: new Map([["charge-1", 373_032]]), cancelRequested: false };
  const bundled = (overrides: Partial<BundledAddOn> = {}): BundledAddOn =>
    ({
      id: "row-1",
      addOn: "digital-growth",
      status: "active",
      listAmountCents: 700_000,
      offerDiscountAmountCents: 0,
      netAmountCents: 700_000,
      taxRateBasisPoints: 1_800,
      activatedAt: SIGNED_UP,
      billedFrom: SIGNED_UP,
      providerScheduledAt: null,
      endRequestedAt: null,
      removedAt: null,
      chargeId: null,
      contactedAt: null,
      createdAt: SIGNED_UP,
      ...overrides,
    }) as BundledAddOn;

  it("shows one taken at sign-up as active, removable from the next billing date", () => {
    expect(clientBundledAddOnRows([bundled({ offerDiscountAmountCents: 35_000, netAmountCents: 665_000 })], "INR", context)).toEqual([
      expect.objectContaining({
        state: { tone: "done", label: "Active" },
        price: "₹6,650 + GST a month, package price, billed with the monthly payment",
        dateLine: "Bought on 19 October 2026",
        canRemove: true,
        endsOnText: "19 November 2026",
        canRetry: false,
        needsContact: true,
      }),
    ]);
  });

  it("names the price of a service with no package offer without any offer wording", () => {
    expect(clientBundledAddOnRows([bundled({ listAmountCents: 999_900, netAmountCents: 999_900 })], "INR", context)[0]?.price).toBe("₹9,999 + GST a month, billed with the monthly payment");
  });

  it("offers no removal while the client has asked to close their account", () => {
    expect(clientBundledAddOnRows([bundled()], "INR", { ...context, cancelRequested: true })[0]).toMatchObject({ canRemove: false, endsOnText: null });
  });

  it("shows one added since, waiting for its charge, with the amount", () => {
    expect(clientBundledAddOnRows([bundled({ status: "pending", activatedAt: null, billedFrom: null, chargeId: "charge-1", createdAt: ADDED })], "INR", context)).toEqual([
      expect.objectContaining({
        state: { tone: "waiting", label: "Waiting for payment" },
        dateLine: "Added on 5 November 2026, waiting for the customer to pay the ₹3,730.32 charge for the rest of the month",
        canRemove: false,
        needsContact: false,
      }),
    ]);
  });

  it("says when a paid add joins the monthly payment, or that the provider still has to be told", () => {
    const told = bundled({ activatedAt: ADDED, billedFrom: null, providerScheduledAt: ADDED });
    expect(clientBundledAddOnRows([told], "INR", context)[0]).toMatchObject({
      state: { tone: "done", label: "Active" },
      dateLine: "Added on 5 November 2026; joins the monthly payment on 19 November 2026",
      canRetry: false,
    });
    expect(clientBundledAddOnRows([{ ...told, providerScheduledAt: null }], "INR", context)[0]).toMatchObject({
      state: { tone: "problem", label: "Provider not told" },
      canRetry: true,
    });
  });

  it("leaves out an unpaid first checkout's add-on", () => {
    expect(clientBundledAddOnRows([bundled({ status: "pending", activatedAt: null, billedFrom: null })], "INR", context)).toEqual([]);
  });

  it("offers no Remove for one that is ending or removed", () => {
    const rows = clientBundledAddOnRows([bundled({ endRequestedAt: ADDED }), bundled({ id: "row-2", status: "removed", removedAt: NEXT_BILLING })], "INR", context);
    expect(rows.map((row) => [row.state.label, row.canRemove])).toEqual([
      ["Ending", false],
      ["Removed", false],
    ]);
  });
});

describe("clientAddOnOption", () => {
  it("prices an add for the rest of the month and the new monthly payment", () => {
    const assessment = {
      kind: "offer",
      plan: { taxRateBasisPoints: 1_800 },
      quote: { kind: "quote", chargeCents: 826_000, nextRenewalCents: 1_179_882, daysLeft: 31 },
    } as unknown as AddOnAssessment;
    expect(clientAddOnOption("digital-growth", assessment, "INR")).toEqual({
      addOn: "digital-growth",
      title: "Social Media and Ads",
      kind: "add",
      costText: "₹8,260 now for the 31 days left, then ₹11,798.82 a month with GST. The customer pays the charge from Billing.",
    });
  });

  it("keeps an ending one, and offers nothing that cannot be added", () => {
    expect(clientAddOnOption("local-seo-aeo", { kind: "keep" } as unknown as AddOnAssessment, "INR")).toMatchObject({ kind: "keep", title: "Local SEO + AEO" });
    expect(clientAddOnOption("local-seo-aeo", { kind: "blocked", reason: "manual-billing" }, "INR")).toBeNull();
    expect(clientAddOnOption("local-seo-aeo", null, "INR")).toBeNull();
  });
});
