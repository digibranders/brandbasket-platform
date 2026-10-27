import type { ClientSummary } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { businessFigures, collectedText, figuresInput, type FiguresInput } from "./business-figures";

// 11:30 on Monday 30 November 2026 in India.
const NOW = new Date("2026-11-30T06:00:00.000Z");
const DAY_MS = 86_400_000;

function client(overrides: { readonly paidThroughAt?: Date | null; readonly firstPaidAt?: Date | null; readonly projectStatus?: "submitted" | "live"; readonly slaDueAt?: Date | null }): ClientSummary {
  return {
    businessId: "business",
    businessName: "Business",
    currency: "INR",
    tier: "managed",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    owner: null,
    project:
      overrides.projectStatus === undefined
        ? null
        : {
            id: "project",
            status: overrides.projectStatus,
            onboardingSubmittedAt: null,
            slaDueAt: overrides.slaDueAt ?? null,
            previewUrl: null,
            previewSentAt: null,
            revisionRoundsGranted: 0,
            launchedAt: null,
            createdAt: new Date("2026-10-01T00:00:00.000Z"),
          },
    billing: {
      subscription:
        overrides.paidThroughAt === undefined || overrides.paidThroughAt === null
          ? null
          : { status: "active", provider: "razorpay", activatedAt: new Date("2026-10-01T00:00:00.000Z"), paidThroughAt: overrides.paidThroughAt, commitmentEndsAt: null },
      firstPayment:
        overrides.firstPaidAt === undefined || overrides.firstPaidAt === null
          ? null
          : { amountCents: 299_900, currency: "INR", provider: "razorpay", paidAt: overrides.firstPaidAt, manual: null },
    },
  };
}

describe("collectedText", () => {
  it("leads with rupees and adds dollars when there are any", () => {
    expect(collectedText([{ currency: "USD", amountCents: 15_000 }, { currency: "INR", amountCents: 46_182_000 }])).toEqual({ value: "₹4,61,820", note: "and $150 in dollars" });
    expect(collectedText([{ currency: "INR", amountCents: 299_900 }])).toEqual({ value: "₹2,999", note: "This month" });
    expect(collectedText([])).toEqual({ value: "₹0", note: "This month" });
  });
});

describe("figuresInput", () => {
  it("counts this week against last, new payers this month, builds and previews due today", () => {
    const input = figuresInput(
      {
        leads: [
          { createdAt: new Date(NOW.getTime() - DAY_MS) },
          { createdAt: new Date(NOW.getTime() - 3 * DAY_MS) },
          { createdAt: new Date(NOW.getTime() - 9 * DAY_MS) },
          { createdAt: new Date(NOW.getTime() - 20 * DAY_MS) },
        ],
        clients: [
          client({ paidThroughAt: new Date("2026-12-20T00:00:00.000Z"), firstPaidAt: new Date("2026-11-20T00:00:00.000Z"), projectStatus: "submitted", slaDueAt: new Date("2026-11-30T12:30:00.000Z") }),
          client({ paidThroughAt: new Date("2026-12-05T00:00:00.000Z"), firstPaidAt: new Date("2026-10-05T00:00:00.000Z"), projectStatus: "submitted", slaDueAt: new Date("2026-11-28T12:30:00.000Z") }),
          client({ paidThroughAt: new Date("2026-11-01T00:00:00.000Z"), firstPaidAt: new Date("2026-09-01T00:00:00.000Z"), projectStatus: "live" }),
        ],
        collected: [{ currency: "INR", amountCents: 299_900 }],
        ticketCounts: { new: 2, triaged: 1, in_progress: 1, waiting_on_you: 1, resolved: 4, closed: 9 },
        activeErrors: 0,
      },
      NOW,
    );
    expect(input).toEqual({
      leadsThisWeek: 2,
      leadsLastWeek: 1,
      payingClients: 2,
      newPayingThisMonth: 1,
      collected: [{ currency: "INR", amountCents: 299_900 }],
      inBuild: 2,
      previewsDueToday: 1,
      openRequests: 5,
      newRequests: 2,
      activeErrors: 0,
    });
  });

  it("shows no request figures when they could not be read", () => {
    const input = figuresInput({ leads: [], clients: [], collected: [], ticketCounts: null, activeErrors: 0 }, NOW);
    expect([input.openRequests, input.newRequests]).toEqual([0, 0]);
  });
});

describe("businessFigures", () => {
  const BASE: FiguresInput = {
    leadsThisWeek: 23,
    leadsLastWeek: 17,
    payingClients: 41,
    newPayingThisMonth: 3,
    collected: [{ currency: "INR", amountCents: 46_182_000 }],
    inBuild: 7,
    previewsDueToday: 2,
    openRequests: 9,
    newRequests: 4,
    activeErrors: 1,
  };

  it("writes the six figures with their notes and tones", () => {
    expect(businessFigures(BASE).map((figure) => [figure.label, figure.value, figure.note, figure.tone])).toEqual([
      ["New enquiries, 7 days", "23", "+6 vs last week", "good"],
      ["Paying clients", "41", "+3 this month", "good"],
      ["Collected this month", "₹4,61,820", "This month", "good"],
      ["In build", "7", "2 previews due today", "warn"],
      ["Open requests", "9", "4 with no reply yet", "warn"],
      ["Errors to look at", "1", "New or being checked", "bad"],
    ]);
  });

  it("uses calm words when nothing is waiting", () => {
    const figures = businessFigures({ ...BASE, leadsThisWeek: 5, leadsLastWeek: 8, newPayingThisMonth: 0, previewsDueToday: 0, newRequests: 0, activeErrors: 0 });
    expect(figures.map((figure) => [figure.note, figure.tone])).toEqual([
      ["-3 vs last week", "warn"],
      ["None new this month", "good"],
      ["This month", "good"],
      ["No previews due today", "good"],
      ["All have a reply", "good"],
      ["None open", "good"],
    ]);
  });

  it("says when enquiries held steady, and when one preview is due", () => {
    const figures = businessFigures({ ...BASE, leadsLastWeek: 23, previewsDueToday: 1 });
    expect([figures[0]?.note, figures[3]?.note]).toEqual(["Same as last week", "1 preview due today"]);
  });
});
