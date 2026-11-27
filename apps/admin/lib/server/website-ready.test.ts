import { findDealForBusiness, findOpenProjectForStaff, markLinkReady, unmarkLinkReady, type Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "./activity";
import { sendBalanceDue } from "./payment-emails";
import type { GrantedStaff } from "./staff-access";
import { markWebsiteReady, undoWebsiteReady } from "./website-ready";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  findDealForBusiness: vi.fn(),
  findOpenProjectForStaff: vi.fn(),
  markLinkReady: vi.fn(),
  unmarkLinkReady: vi.fn(),
}));
vi.mock("./activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("./payment-emails", () => ({ sendBalanceDue: vi.fn() }));

const db = {} as Database;
const NOW = new Date("2026-11-27T05:00:00Z");
const STAFF = { user: { id: "staff-1" } } as unknown as GrantedStaff;
const INPUT = { businessId: "b1", staff: STAFF, now: NOW };
const BUILDING = { id: "link-1", dealType: "paid", currency: "INR", setupFeeListCents: 1_000_000, setupFeeDiscountCents: 0, advanceCents: 500_000, advancePaidAt: NOW, readyAt: null, paidAt: null, revokedAt: null, expiresAt: NOW } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findDealForBusiness).mockResolvedValue(BUILDING);
  vi.mocked(findOpenProjectForStaff).mockResolvedValue({ status: "approved" } as never);
  vi.mocked(markLinkReady).mockResolvedValue(true);
  vi.mocked(unmarkLinkReady).mockResolvedValue(true);
});

describe("markWebsiteReady", () => {
  it("marks a building deal whose preview is approved ready, records it and tells the customer the balance", async () => {
    expect(await markWebsiteReady(db, INPUT)).toBe("ready");
    expect(markLinkReady).toHaveBeenCalledWith(db, { linkId: "link-1", staffUserId: "staff-1", now: NOW });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ businessId: "b1", kind: "payment_link.ready" }));
    expect(sendBalanceDue).toHaveBeenCalledWith({ businessId: "b1", linkId: "link-1", readyAt: NOW, currency: "INR", balanceCents: 500_000, reminder: false });
  });

  it("refuses a business with no deal, or a free one", async () => {
    vi.mocked(findDealForBusiness).mockResolvedValue(null);
    expect(await markWebsiteReady(db, INPUT)).toBe("no-deal");
    vi.mocked(findDealForBusiness).mockResolvedValue({ ...(BUILDING as object), dealType: "free" } as never);
    expect(await markWebsiteReady(db, INPUT)).toBe("no-deal");
    expect(markLinkReady).not.toHaveBeenCalled();
  });

  it("refuses a deal that is already ready", async () => {
    vi.mocked(findDealForBusiness).mockResolvedValue({ ...(BUILDING as object), readyAt: NOW } as never);
    expect(await markWebsiteReady(db, INPUT)).toBe("not-building");
    expect(markLinkReady).not.toHaveBeenCalled();
  });

  it("refuses until the customer has approved the preview, whatever stage the project is at", async () => {
    for (const status of ["onboarding", "building", "preview", "revisions", "live"]) {
      vi.mocked(findOpenProjectForStaff).mockResolvedValue({ status } as never);
      expect(await markWebsiteReady(db, INPUT)).toBe("not-approved");
    }
    vi.mocked(findOpenProjectForStaff).mockResolvedValue(null);
    expect(await markWebsiteReady(db, INPUT)).toBe("not-approved");
    expect(markLinkReady).not.toHaveBeenCalled();
    expect(sendBalanceDue).not.toHaveBeenCalled();
  });

  it("sends nothing when another press got there first", async () => {
    vi.mocked(markLinkReady).mockResolvedValue(false);
    expect(await markWebsiteReady(db, INPUT)).toBe("not-building");
    expect(recordStaffAction).not.toHaveBeenCalled();
    expect(sendBalanceDue).not.toHaveBeenCalled();
  });
});

describe("undoWebsiteReady", () => {
  it("takes ready back while the balance is due, and records it", async () => {
    vi.mocked(findDealForBusiness).mockResolvedValue({ ...(BUILDING as object), readyAt: NOW } as never);
    expect(await undoWebsiteReady(db, { businessId: "b1", staff: STAFF })).toBe("undone");
    expect(unmarkLinkReady).toHaveBeenCalledWith(db, { linkId: "link-1" });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, expect.objectContaining({ kind: "payment_link.ready_undone" }));
  });

  it("refuses a deal that is not ready, or one with no unpaid deal at all (paid deals are not found)", async () => {
    expect(await undoWebsiteReady(db, { businessId: "b1", staff: STAFF })).toBe("not-ready");
    vi.mocked(findDealForBusiness).mockResolvedValue(null);
    expect(await undoWebsiteReady(db, { businessId: "b1", staff: STAFF })).toBe("not-ready");
    expect(unmarkLinkReady).not.toHaveBeenCalled();
  });
});
