import {
  countActiveErrorIssues,
  countSupportQueues,
  countSupportTicketsByStatus,
  listAddOnsToContact,
  listBreaches,
  listClients,
  listDomainMoves,
  listErrorIssues,
  listKickoffBoard,
  listLeads,
  listOpenClosures,
  listOpenPrivacyRequests,
  listPaymentsNeedingAttention,
  listProjectsStartedWithoutCallConfirmation,
  listReportsForReview,
  listSetupCallsBetween,
  listSetupCallsForStaff,
  listStaffRoster,
  listSupportTicketsForStaff,
  sumCapturedPaymentsBetween,
  type ClientBilling,
  type ClientSummary,
  type KickoffBoardRow,
  type Lead,
  type PaymentNeedingAttention,
} from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countFailedDeliveries24h } from "./deliveries";
import { readGoogleToday } from "./google-today";
import { readSystemHealth } from "./system-health";
import { countTodayItems, loadTodayItems, loadTodayPage } from "./today";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    countActiveErrorIssues: vi.fn(),
    countSupportQueues: vi.fn(),
    countSupportTicketsByStatus: vi.fn(),
    listAddOnsToContact: vi.fn(),
    listBreaches: vi.fn(),
    listClients: vi.fn(),
    listDomainMoves: vi.fn(),
    listErrorIssues: vi.fn(),
    listKickoffBoard: vi.fn(),
    listLeads: vi.fn(),
    listOpenClosures: vi.fn(),
    listOpenPrivacyRequests: vi.fn(),
    listPaymentsNeedingAttention: vi.fn(),
    listProjectsStartedWithoutCallConfirmation: vi.fn(),
    listReportsForReview: vi.fn(),
    listSetupCallsBetween: vi.fn(),
    listSetupCallsForStaff: vi.fn(),
    listStaffRoster: vi.fn(),
    listSupportTicketsForStaff: vi.fn(),
    sumCapturedPaymentsBetween: vi.fn(),
  };
});
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));
vi.mock("./system-health", () => ({ readSystemHealth: vi.fn() }));
vi.mock("./deliveries", () => ({ countFailedDeliveries24h: vi.fn() }));
vi.mock("./google-today", () => ({ readGoogleToday: vi.fn() }));

const NOW = new Date("2026-11-30T06:00:00.000Z");

const NEW_LEAD = {
  id: "lead-1",
  businessName: "Green Leaf Cafe",
  status: "new",
  createdAt: new Date("2026-11-30T05:30:00.000Z"),
} as Lead;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(listClients).mockResolvedValue([]);
  vi.mocked(listDomainMoves).mockResolvedValue([]);
  vi.mocked(listLeads).mockResolvedValue([NEW_LEAD]);
  vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([]);
  vi.mocked(listAddOnsToContact).mockResolvedValue([]);
  vi.mocked(listSupportTicketsForStaff).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(listErrorIssues).mockResolvedValue({ issues: [], total: 0 });
  vi.mocked(sumCapturedPaymentsBetween).mockResolvedValue([{ currency: "INR", amountCents: 299_900 }]);
  vi.mocked(countSupportTicketsByStatus).mockResolvedValue({ new: 1, triaged: 0, in_progress: 0, waiting_on_you: 0, resolved: 0, closed: 0 });
  vi.mocked(countActiveErrorIssues).mockResolvedValue(0);
  vi.mocked(listSetupCallsBetween).mockResolvedValue([]);
  vi.mocked(readSystemHealth).mockResolvedValue([]);
  vi.mocked(countFailedDeliveries24h).mockResolvedValue(0);
  vi.mocked(listKickoffBoard).mockResolvedValue([]);
  vi.mocked(listStaffRoster).mockResolvedValue([]);
  vi.mocked(listProjectsStartedWithoutCallConfirmation).mockResolvedValue([]);
  vi.mocked(readGoogleToday).mockResolvedValue([]);
  vi.mocked(listOpenPrivacyRequests).mockResolvedValue([]);
  vi.mocked(listBreaches).mockResolvedValue([]);
  vi.mocked(listOpenClosures).mockResolvedValue([]);
  vi.mocked(listReportsForReview).mockResolvedValue([]);
  vi.mocked(countSupportQueues).mockResolvedValue({ needsReply: 2, needsReplyOverADay: 0, waitingOnClient: 1, done: 0 });
  vi.mocked(listSetupCallsForStaff).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function kickoffRow(values: Partial<KickoffBoardRow> & Pick<KickoffBoardRow, "businessId">): KickoffBoardRow {
  return {
    businessName: values.businessId,
    startsAt: null,
    endsAt: null,
    heldAt: null,
    summary: null,
    projectStatus: "onboarding",
    hasWebsite: true,
    services: [],
    ...values,
  };
}

describe("loadTodayItems", () => {
  it("keeps the rest of the queue when one source fails, and logs the failure", async () => {
    vi.mocked(listClients).mockRejectedValue(new Error("database down"));
    const items = await loadTodayItems(NOW, true);
    expect(items.map((item) => item.key)).toEqual(["lead:lead-1"]);
    expect(console.error).toHaveBeenCalled();
  });

  it("asks only for requests nobody has answered", async () => {
    await loadTodayItems(NOW, true);
    expect(listSupportTicketsForStaff).toHaveBeenCalledWith({}, { queue: "needs_reply", limit: 25 });
    expect(listErrorIssues).toHaveBeenCalledWith({}, { status: "new" });
  });

  it("includes the staff owner on unpaid sign-up items when assigned (D21)", async () => {
    vi.mocked(listLeads).mockResolvedValue([
      {
        id: "lead-unpaid",
        businessName: "Glow Dental",
        status: "account_created",
        assignedStaffId: "staff-1",
        createdAt: new Date("2026-11-29T10:00:00.000Z"),
      } as Lead,
    ]);
    vi.mocked(listStaffRoster).mockResolvedValue([
      { userId: "staff-1", name: "Rohan Mehta", email: "rohan@example.test", role: "admin", active: true, lastSignInAt: null },
    ]);

    const items = await loadTodayItems(NOW, true);
    const signupItem = items.find((item) => item.key === "signup:lead-unpaid");
    expect(signupItem).toBeDefined();
    expect(signupItem?.detail).toBe("Signed up 29 Nov · Rohan Mehta");
  });
});

describe("failed deliveries in the queue", () => {
  it("adds one item when deliveries failed in the last 24 hours", async () => {
    vi.mocked(countFailedDeliveries24h).mockResolvedValue(2);
    const items = await loadTodayItems(NOW, true);
    expect(countFailedDeliveries24h).toHaveBeenCalledWith(NOW);
    expect(items.filter((item) => item.kind === "delivery")).toEqual([
      { key: "deliveries:failed", kind: "delivery", href: "/deliveries", title: "2 emails and webhooks failed", detail: "", dueAt: null },
    ]);
  });

  it("adds no item when none failed", async () => {
    const items = await loadTodayItems(NOW, true);
    expect(items.some((item) => item.kind === "delivery")).toBe(false);
  });

  it("names deliveries as failed and adds no item when the count cannot be read", async () => {
    vi.mocked(countFailedDeliveries24h).mockRejectedValue(new Error("database down"));
    const page = await loadTodayPage(NOW, true);
    expect(page.failed).toEqual(["deliveries"]);
    expect(page.items.some((item) => item.kind === "delivery")).toBe(false);
    expect(page.items.map((item) => item.key)).toEqual(["lead:lead-1"]);
  });
});

describe("kickoff calls needing an outcome in the queue", () => {
  const ENDED_EARLIER = new Date("2026-11-29T05:00:00.000Z");
  const ENDED_LATER = new Date("2026-11-30T03:00:00.000Z");

  it("asks for the board over the last 14 days and adds one item per business whose call ended without being marked held", async () => {
    vi.mocked(listKickoffBoard).mockResolvedValue([
      kickoffRow({ businessId: "b-late", endsAt: ENDED_LATER }),
      kickoffRow({ businessId: "b-early", endsAt: ENDED_EARLIER }),
      kickoffRow({ businessId: "b-not-yet", endsAt: new Date("2026-11-30T09:00:00.000Z") }),
      kickoffRow({ businessId: "b-held", endsAt: ENDED_EARLIER, heldAt: new Date("2026-11-29T06:00:00.000Z") }),
      kickoffRow({ businessId: "b-started", endsAt: ENDED_EARLIER, projectStatus: "submitted" }),
    ]);
    const items = await loadTodayItems(NOW, true);
    expect(listKickoffBoard).toHaveBeenCalledWith({}, { now: NOW, lookBackDays: 14 });
    expect(items.filter((item) => item.kind === "kickoff")).toEqual([
      { key: "kickoff:b-early", kind: "kickoff", href: "/", title: "Did the kickoff happen?", detail: "b-early · ended 29 Nov, 10:30", dueAt: ENDED_EARLIER },
      { key: "kickoff:b-late", kind: "kickoff", href: "/", title: "Did the kickoff happen?", detail: "b-late · ended 30 Nov, 08:30", dueAt: ENDED_LATER },
    ]);
  });

  it("drops the item once the call is marked held, or its booking is removed by a no-show", async () => {
    vi.mocked(listKickoffBoard).mockResolvedValue([kickoffRow({ businessId: "b-one", endsAt: ENDED_LATER })]);
    expect((await loadTodayItems(NOW, true)).some((item) => item.key === "kickoff:b-one")).toBe(true);
    vi.mocked(listKickoffBoard).mockResolvedValue([kickoffRow({ businessId: "b-one", endsAt: ENDED_LATER, heldAt: new Date("2026-11-30T03:30:00.000Z") })]);
    expect((await loadTodayItems(NOW, true)).some((item) => item.kind === "kickoff")).toBe(false);
    vi.mocked(listKickoffBoard).mockResolvedValue([]);
    expect((await loadTodayItems(NOW, true)).some((item) => item.kind === "kickoff")).toBe(false);
  });

  it("adds no item when no call is waiting for an outcome", async () => {
    const items = await loadTodayItems(NOW, true);
    expect(items.some((item) => item.kind === "kickoff")).toBe(false);
  });

  it("names kickoff calls as failed and adds no item when the board cannot be read", async () => {
    vi.mocked(listKickoffBoard).mockRejectedValue(new Error("database down"));
    const page = await loadTodayPage(NOW, true);
    expect(page.failed).toEqual(["kickoff calls"]);
    expect(page.items.some((item) => item.kind === "kickoff")).toBe(false);
    expect(page.items.map((item) => item.key)).toEqual(["lead:lead-1"]);
  });
});

describe("Google rows", () => {
  const GOOGLE_ITEM = { key: "google:sign-in", kind: "google", href: "/settings#google", title: "Brandbasket Google sign-in was lost", detail: "", action: "Open Settings", dueAt: new Date("2026-11-29T06:00:00.000Z") } as const;

  it("puts the Google rows in the queue and the rail's count, and asks for the sign-in only for a role that may see it", async () => {
    vi.mocked(readGoogleToday).mockResolvedValue([GOOGLE_ITEM]);
    expect((await loadTodayItems(NOW, true, true)).map((item) => item.key)).toEqual(["google:sign-in", "lead:lead-1"]);
    expect(readGoogleToday).toHaveBeenLastCalledWith(NOW, true);
    expect(await countTodayItems(true, false)).toBe(2);
    expect(readGoogleToday).toHaveBeenLastCalledWith(expect.any(Date), false);
    await loadTodayPage(NOW, false, true);
    expect(readGoogleToday).toHaveBeenLastCalledWith(NOW, true);
  });

  it("adds nothing when all is well", async () => {
    expect((await loadTodayItems(NOW, true, true)).some((item) => item.kind === "google")).toBe(false);
  });

  it("keeps the rest of the queue when the Google read fails, and says so", async () => {
    vi.mocked(readGoogleToday).mockRejectedValue(new Error("database down"));
    const page = await loadTodayPage(NOW, true, true);
    expect(page.failed).toEqual(["Google"]);
    expect(page.items.map((item) => item.key)).toEqual(["lead:lead-1"]);
  });
});

describe("countTodayItems", () => {
  it("is the length of the queue", async () => {
    expect(await countTodayItems(true)).toBe(1);
  });
});

describe("a role without the money capability", () => {
  const FLAGGED = { paymentId: "pay-1", businessId: "oak", businessName: "Oak Cafe", raisedAt: new Date("2026-11-29T05:00:00.000Z") } as PaymentNeedingAttention;

  it("never reads flagged payments or collected money, and the queue has no payment item", async () => {
    vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([FLAGGED]);
    const page = await loadTodayPage(NOW, false);
    expect(listPaymentsNeedingAttention).not.toHaveBeenCalled();
    expect(sumCapturedPaymentsBetween).not.toHaveBeenCalled();
    expect(page.items.some((item) => item.key.startsWith("payment:"))).toBe(false);
    expect(page.failed).toEqual([]);
    expect(page.figures.map((figure) => figure.label)).not.toContain("Collected this month");
    expect(page.figures).toHaveLength(5);
  });

  it("shows both to a role with it", async () => {
    vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([FLAGGED]);
    const page = await loadTodayPage(NOW, true);
    expect(page.items.some((item) => item.key === "payment:pay-1")).toBe(true);
    expect(page.figures.map((figure) => figure.label)).toContain("Collected this month");
  });

  it("counts the queue without the flagged payments", async () => {
    vi.mocked(listPaymentsNeedingAttention).mockResolvedValue([FLAGGED]);
    expect(await countTodayItems(true)).toBe(2);
    expect(await countTodayItems(false)).toBe(1);
  });
});

describe("billing status items in the queue (past_due and lapsed)", () => {
  const PAID_THROUGH = new Date("2026-11-20T00:00:00.000Z");
  const LAPSED_THROUGH = new Date("2026-10-01T00:00:00.000Z");

  function makeClient(businessId: string, businessName: string, billing: Partial<ClientBilling>): ClientSummary {
    return {
      businessId,
      businessName,
      currency: "INR",
      tier: "managed",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      owner: null,
      project: null,
      billing: {
        subscription: null,
        firstPayment: null,
        ...billing,
      },
    };
  }

  it("adds past_due and lapsed items for staff with money capability", async () => {
    const clientPastDue = makeClient("c-past-due", "Past Due Business", {
      subscription: {
        status: "past_due",
        provider: "razorpay",
        billingInterval: "month",
        activatedAt: new Date("2026-10-01T00:00:00.000Z"),
        paidThroughAt: PAID_THROUGH,
        commitmentEndsAt: null,
      },
      firstPayment: {
        amountCents: 299_900,
        currency: "INR",
        provider: "razorpay",
        paidAt: new Date("2026-10-01T00:00:00.000Z"),
        manual: null,
      },
    });

    const clientLapsed = makeClient("c-lapsed", "Lapsed Business", {
      subscription: {
        status: "cancelled",
        provider: "razorpay",
        billingInterval: "month",
        activatedAt: new Date("2026-09-01T00:00:00.000Z"),
        paidThroughAt: LAPSED_THROUGH,
        commitmentEndsAt: null,
      },
      firstPayment: {
        amountCents: 299_900,
        currency: "INR",
        provider: "razorpay",
        paidAt: new Date("2026-09-01T00:00:00.000Z"),
        manual: null,
      },
    });

    vi.mocked(listClients).mockResolvedValue([clientPastDue, clientLapsed]);
    const items = await loadTodayItems(NOW, true);

    const pastDueItem = items.find((item) => item.key === "billing:past_due:c-past-due");
    expect(pastDueItem).toEqual({
      key: "billing:past_due:c-past-due",
      kind: "payment",
      title: "Payment past due: Past Due Business",
      detail: "Renewal payment failed",
      dueAt: PAID_THROUGH,
      href: "/clients/c-past-due/billing",
    });

    const lapsedItem = items.find((item) => item.key === "billing:lapsed:c-lapsed");
    expect(lapsedItem).toEqual({
      key: "billing:lapsed:c-lapsed",
      kind: "payment",
      title: "Plan lapsed: Lapsed Business",
      detail: "Plan has ended",
      dueAt: LAPSED_THROUGH,
      href: "/clients/c-lapsed/billing",
    });
  });

  it("adds a balance due item for a deal whose website is ready, and none for one still being built (plan 66)", async () => {
    const advancePaidAt = new Date("2026-11-10T00:00:00.000Z");
    const deal = (state: "building" | "balance_due") => ({ linkId: "l", state, currency: "INR" as const, advanceCents: 2_000_000, advancePaidAt, balanceCents: 4_000_000 });
    vi.mocked(listClients).mockResolvedValue([
      makeClient("c-ready", "Ready Business", { deal: deal("balance_due") }),
      makeClient("c-building", "Building Business", { deal: deal("building") }),
    ]);
    const items = await loadTodayItems(NOW, true);
    expect(items.find((item) => item.key === "billing:balance_due:c-ready")).toEqual({
      key: "billing:balance_due:c-ready",
      kind: "payment",
      title: "Balance due: Ready Business",
      detail: "Website is ready, balance not paid",
      dueAt: advancePaidAt,
      href: "/clients/c-ready/billing",
    });
    expect(items.some((item) => item.key.endsWith("c-building"))).toBe(false);
  });

  it("hides past_due and lapsed items when staff cannot see money", async () => {
    const clientPastDue = makeClient("c-past-due", "Past Due Business", {
      subscription: {
        status: "past_due",
        provider: "razorpay",
        billingInterval: "month",
        activatedAt: new Date("2026-10-01T00:00:00.000Z"),
        paidThroughAt: PAID_THROUGH,
        commitmentEndsAt: null,
      },
      firstPayment: {
        amountCents: 299_900,
        currency: "INR",
        provider: "razorpay",
        paidAt: new Date("2026-10-01T00:00:00.000Z"),
        manual: null,
      },
    });

    vi.mocked(listClients).mockResolvedValue([clientPastDue]);
    const items = await loadTodayItems(NOW, false);
    expect(items.some((item) => item.key.startsWith("billing:"))).toBe(false);
  });
});

describe("loadTodayPage", () => {
  it("returns the queue, six figures, today's calls and the systems lines", async () => {
    const call = { businessId: "b1", businessName: "Kumar Opticals", startsAt: new Date("2026-11-30T08:30:00.000Z"), endsAt: new Date("2026-11-30T09:00:00.000Z") };
    vi.mocked(listSetupCallsBetween).mockResolvedValue([call]);
    vi.mocked(readSystemHealth).mockResolvedValue([{ key: "email", label: "Email", state: "ok", detail: "last 09:40" }]);
    const page = await loadTodayPage(NOW, true);
    expect(page.items).toHaveLength(1);
    expect(page.figures).toHaveLength(6);
    expect(page.figures[2]?.value).toBe("₹2,999");
    expect(page.calls).toEqual([call]);
    expect(page.systems).toEqual([{ key: "email", label: "Email", state: "ok", detail: "last 09:40" }]);
    expect(listSetupCallsBetween).toHaveBeenCalledWith({}, new Date("2026-11-29T18:30:00.000Z"), new Date("2026-11-30T18:30:00.000Z"));
  });

  it("still draws the figures when the money and request counts fail", async () => {
    vi.mocked(sumCapturedPaymentsBetween).mockRejectedValue(new Error("down"));
    vi.mocked(countSupportTicketsByStatus).mockRejectedValue(new Error("down"));
    const page = await loadTodayPage(NOW, true);
    expect(page.figures.map((figure) => figure.value)).toEqual(["1", "0", "₹0", "0", "0", "0"]);
  });

  it("reports no failed sources when every queue source reads", async () => {
    const page = await loadTodayPage(NOW, true);
    expect(page.failed).toEqual([]);
  });

  it("names the failed source and keeps the other items", async () => {
    vi.mocked(listClients).mockRejectedValue(new Error("database down"));
    const page = await loadTodayPage(NOW, true);
    expect(page.failed).toEqual(["clients"]);
    expect(page.items.map((item) => item.key)).toEqual(["lead:lead-1"]);
  });

  it("names all six queue sources and leaves the queue empty when every one fails", async () => {
    vi.mocked(listClients).mockRejectedValue(new Error("down"));
    vi.mocked(listLeads).mockRejectedValue(new Error("down"));
    vi.mocked(listPaymentsNeedingAttention).mockRejectedValue(new Error("down"));
    vi.mocked(listAddOnsToContact).mockRejectedValue(new Error("down"));
    vi.mocked(listSupportTicketsForStaff).mockRejectedValue(new Error("down"));
    vi.mocked(listErrorIssues).mockRejectedValue(new Error("down"));
    const page = await loadTodayPage(NOW, true);
    expect(page.items).toEqual([]);
    expect(page.failed).toHaveLength(6);
    expect(page.failed).toEqual(
      expect.arrayContaining(["clients", "leads", "flagged payments", "add-ons to contact", "requests needing a reply", "new errors"]),
    );
  });

  it("adds an approved preview row linking to the website page with Launch action", async () => {
    vi.mocked(listClients).mockResolvedValue([
      {
        businessId: "biz-app",
        businessName: "Approved Cafe",
        project: {
          id: "p1",
          status: "approved",
          slaDueAt: new Date("2026-12-01T10:00:00.000Z"),
          onboardingSubmittedAt: null,
          previewUrl: "https://preview.example.com",
          previewSentAt: null,
          revisionRoundsGranted: 0,
          launchedAt: null,
          createdAt: new Date("2026-11-20T00:00:00.000Z"),
        },
      } as never,
    ]);
    const items = await loadTodayItems(NOW, true);
    const approved = items.find((item) => item.kind === "approved");
    expect(approved).toEqual({
      key: "approved:biz-app",
      kind: "approved",
      href: "/clients/biz-app/website",
      title: "Website approved: Approved Cafe",
      detail: "Ready to launch",
      dueAt: new Date("2026-12-01T10:00:00.000Z"),
      action: "Launch",
    });
  });

  it("adds domain move items from listDomainMoves", async () => {
    vi.mocked(listDomainMoves).mockResolvedValue([
      {
        id: "dom-1",
        businessId: "biz-1",
        businessName: "Domain Cafe",
        hostname: "domaincafe.com",
        status: "pending",
        createdAt: new Date("2026-11-29T10:00:00.000Z"),
      },
    ]);
    const items = await loadTodayItems(NOW, true);
    const domainItem = items.find((item) => item.kind === "domain");
    expect(domainItem).toEqual({
      key: "domain:dom-1",
      kind: "domain",
      href: "/clients/biz-1/website",
      title: "Domain move: Domain Cafe",
      detail: "domaincafe.com · pending",
      dueAt: new Date("2026-11-30T10:00:00.000Z"),
    });
  });

  it("includes projects started without call confirmation in today's items", async () => {
    vi.mocked(listProjectsStartedWithoutCallConfirmation).mockResolvedValue([
      {
        projectId: "proj-1",
        businessId: "biz-1",
        businessName: "Fallback Bakers",
        startedAt: new Date("2026-11-29T10:00:00.000Z"),
      },
    ]);
    const items = await loadTodayItems(NOW, true);
    const item = items.find((i) => i.key === "unconfirmed_start:biz-1");
    expect(item).toBeDefined();
    expect(item?.title).toBe("Started without call confirmation");
    expect(item?.detail).toBe("Fallback Bakers");
    expect(item?.href).toBe("/clients/biz-1/website");
  });
});

describe("compliance, report and silent-preview rows", () => {
  const PRIVACY = { id: "pr-1", reference: "PR-0001", kind: "access", status: "received", dueAt: new Date("2026-12-10T00:00:00.000Z") };
  const BREACH = { id: "br-1", status: "open", summary: "A laptop was lost", detectedAt: new Date("2026-11-30T00:00:00.000Z"), reportedCertInAt: null, reportedBoardAt: null };

  it("reads privacy requests, breaches and closing accounts only with the oversight capability", async () => {
    vi.mocked(listOpenPrivacyRequests).mockResolvedValue([PRIVACY as never]);
    vi.mocked(listBreaches).mockResolvedValue([BREACH as never]);
    vi.mocked(listOpenClosures).mockResolvedValue([{ businessId: "biz-1", requestedAt: NOW, eraseAfter: new Date("2026-12-02T00:00:00.000Z") }]);
    const without = await loadTodayItems(NOW, true);
    expect(without.map((item) => item.kind)).not.toEqual(expect.arrayContaining(["privacy"]));
    expect(listOpenPrivacyRequests).not.toHaveBeenCalled();
    expect(listBreaches).not.toHaveBeenCalled();
    expect(listOpenClosures).not.toHaveBeenCalled();
    const items = await loadTodayItems(NOW, true, false, true);
    expect(items.map((item) => item.key)).toEqual(expect.arrayContaining(["privacy:pr-1", "breach:br-1", "closure:biz-1"]));
    expect(items.find((item) => item.key === "closure:biz-1")?.title).toBe("Account closing: An account");
  });

  it("adds one report row while reports wait for a review, due at the end of the 5th", async () => {
    vi.mocked(listReportsForReview).mockResolvedValue([{ state: "draft" }, { state: "held" }, { state: "approved" }] as never);
    const row = (await loadTodayItems(NOW, true)).find((item) => item.kind === "report");
    expect(row?.title).toBe("2 reports to review");
    expect(row?.dueAt).toEqual(new Date("2026-11-05T18:30:00.000Z"));
  });

  it("adds a row for a preview sent 5 or more days ago, and none for a newer one", async () => {
    const project = (sentAt: string): never => ({ businessId: sentAt, businessName: `Cafe ${sentAt}`, project: { status: "preview", previewSentAt: new Date(sentAt) } }) as never;
    vi.mocked(listClients).mockResolvedValue([project("2026-11-24T06:00:00.000Z"), project("2026-11-26T06:00:00.000Z")]);
    const rows = (await loadTodayItems(NOW, true)).filter((item) => item.kind === "preview_silent");
    expect(rows.map((item) => item.key)).toEqual(["preview_silent:2026-11-24T06:00:00.000Z"]);
  });

  it("names a failed compliance source and leaves the rest of the queue", async () => {
    vi.mocked(listBreaches).mockRejectedValue(new Error("down"));
    const page = await loadTodayPage(NOW, true, false, true);
    expect(page.failed).toEqual(["breaches"]);
    expect(page.items.map((item) => item.key)).toEqual(["lead:lead-1"]);
  });
});

describe("the Today page's open requests and calls", () => {
  it("counts requests that need a reply or wait on the customer", async () => {
    expect((await loadTodayPage(NOW, true)).openRequests).toBe(3);
  });

  it("leaves the count null and names the source when it cannot be read", async () => {
    vi.mocked(countSupportQueues).mockRejectedValue(new Error("down"));
    const page = await loadTodayPage(NOW, true);
    expect(page.openRequests).toBeNull();
    expect(page.failed).toEqual(["open requests"]);
  });

  it("splits calls from the last 7 and next 28 days into coming up and the last week", async () => {
    vi.mocked(listSetupCallsForStaff).mockResolvedValue([
      { businessId: "b-next", businessName: "Next", startsAt: new Date("2026-12-03T08:00:00.000Z"), setupDone: 1 },
      { businessId: "b-past", businessName: "Past", startsAt: new Date("2026-11-27T08:00:00.000Z"), setupDone: 2 },
    ] as never);
    const page = await loadTodayPage(NOW, true);
    expect(page.callGroups.upcoming.map((line) => line.call.businessId)).toEqual(["b-next"]);
    expect(page.callGroups.past.map((line) => line.call.businessId)).toEqual(["b-past"]);
    expect(listSetupCallsForStaff).toHaveBeenCalledWith({}, new Date("2026-11-22T18:30:00.000Z"), new Date("2026-12-27T18:30:00.000Z"));
  });
});
