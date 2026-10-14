import type { AddOnSubscriptionForStaff, PressRelease } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { clientAddOnRows, clientPressReleaseRows } from "./client-add-ons";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-12T09:00:00.000Z");

function row(overrides: Partial<AddOnSubscriptionForStaff> & Pick<AddOnSubscriptionForStaff, "id">): AddOnSubscriptionForStaff {
  return {
    businessId: "business-1",
    addOn: "local-seo",
    listAmountCents: 1_000_000,
    discountAmountCents: 0,
    netAmountCents: 1_000_000,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: 1_180_000,
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
      title: "Local SEO",
      state: { tone: "done", label: "Active" },
      price: "₹10,000 + GST a month",
      dateLine: "Renews on 12 November 2026",
      endNote: null,
      canEnd: true,
      endsOnText: "12 November 2026",
      needsContact: true,
    });
  });

  it("names the Premium price a member paid", () => {
    const [shown] = clientAddOnRows(
      [row({ id: "a", discountAmountCents: 100_000, netAmountCents: 900_000, chargedAmountCents: 1_062_000 })],
      NOW,
    );
    expect(shown?.price).toBe("₹9,000 + GST a month, Premium price");
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
        row({ id: "ads", addOn: "performance-marketing", netAmountCents: 800_000, listAmountCents: 800_000 }),
      ],
      NOW,
    );
    expect(Object.fromEntries(shown.map((entry) => [entry.id, [entry.state.label, entry.canEnd]]))).toEqual({
      "seo-new": ["Active", true],
      "seo-old": ["Earlier", false],
      ads: ["Active", true],
    });
    expect(shown.find((entry) => entry.id === "seo-old")?.dateLine).toBe("Ended on 12 September 2026");
    expect(shown.find((entry) => entry.id === "ads")?.title).toBe("Performance marketing");
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
        row({ id: "b", addOn: "performance-marketing", status: "halted", haltedAt: NOW }),
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
