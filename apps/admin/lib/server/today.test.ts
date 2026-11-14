import {
  countActiveErrorIssues,
  countSupportTicketsByStatus,
  listAddOnsToContact,
  listClients,
  listErrorIssues,
  listKickoffBoard,
  listLeads,
  listPaymentsNeedingAttention,
  listSetupCallsBetween,
  listStaffRoster,
  listSupportTicketsForStaff,
  sumCapturedPaymentsBetween,
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
    countSupportTicketsByStatus: vi.fn(),
    listAddOnsToContact: vi.fn(),
    listClients: vi.fn(),
    listErrorIssues: vi.fn(),
    listKickoffBoard: vi.fn(),
    listLeads: vi.fn(),
    listPaymentsNeedingAttention: vi.fn(),
    listSetupCallsBetween: vi.fn(),
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
  vi.mocked(readGoogleToday).mockResolvedValue([]);
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
      { key: "kickoff:b-early", kind: "kickoff", href: "/calls", title: "Did the kickoff happen?", detail: "b-early · ended 29 Nov, 10:30", dueAt: ENDED_EARLIER },
      { key: "kickoff:b-late", kind: "kickoff", href: "/calls", title: "Did the kickoff happen?", detail: "b-late · ended 30 Nov, 08:30", dueAt: ENDED_LATER },
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
});
