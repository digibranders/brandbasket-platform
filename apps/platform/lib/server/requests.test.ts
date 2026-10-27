import { countIncludedEdits, getChangeWithEvents, getSupportTicket, listRequestItems, listRequestNeeds, listUnreadReplies, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { loadRequestDetail, loadRequestNeeds, loadRequests, loadUnreadReplies } from "./requests";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  countIncludedEdits: vi.fn(),
  getChangeWithEvents: vi.fn(),
  getSupportTicket: vi.fn(),
  listRequestItems: vi.fn(),
  listRequestNeeds: vi.fn(),
  listUnreadReplies: vi.fn(),
  withTenantScope: vi.fn(),
}));

const appDb = { name: "app-db" } as never;
const appTx = { name: "app-tx" } as never;
const freshTenant = () => ({ userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" }) as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
});

describe("loadRequests", () => {
  it("reads the list as the person and counts the month's included edits for the business, in India's month", async () => {
    vi.mocked(listRequestItems).mockResolvedValue([]);
    vi.mocked(countIncludedEdits).mockResolvedValue(1);
    const data = await loadRequests(freshTenant(), true);
    expect(listRequestItems).toHaveBeenCalledWith(appTx, "user-a", "business-1");
    const [, businessId, window] = vi.mocked(countIncludedEdits).mock.calls[0] ?? [];
    expect(businessId).toBe("business-1");
    expect(window?.from.getTime()).toBeLessThanOrEqual(Date.now());
    expect(window?.to.getTime()).toBeGreaterThan(Date.now());
    expect(data).toEqual({ items: [], includedUsed: 1, includedAllowed: 2 });
  });

  it("does not count, and allows none, for a plan without the website", async () => {
    vi.mocked(listRequestItems).mockResolvedValue([]);
    const data = await loadRequests(freshTenant(), false);
    expect(countIncludedEdits).not.toHaveBeenCalled();
    expect(data).toMatchObject({ includedUsed: 0, includedAllowed: 0 });
  });

  it("fails loudly when the list cannot be read, so the page never shows an empty list by mistake", async () => {
    vi.mocked(listRequestItems).mockRejectedValue(new Error("db down"));
    vi.mocked(countIncludedEdits).mockResolvedValue(0);
    await expect(loadRequests(freshTenant(), true)).rejects.toThrow("db down");
  });
});

describe("loadRequestNeeds", () => {
  it("returns what waits on the person", async () => {
    const needs = [{ ticketId: "t1", subject: "Add an Implants page", kind: "website", state: "quoted", quote: null, acceptedAt: null, updatedAt: new Date() }];
    vi.mocked(listRequestNeeds).mockResolvedValue(needs as never);
    expect(await loadRequestNeeds(freshTenant())).toEqual(needs);
    expect(listRequestNeeds).toHaveBeenCalledWith(appTx, "user-a", "business-1");
  });

  it("shows nothing, and logs once, when it cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listRequestNeeds).mockRejectedValue(new Error("db down"));
    expect(await loadRequestNeeds(freshTenant())).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("[requests] could not read the requests waiting on you");
    log.mockRestore();
  });
});

describe("loadUnreadReplies", () => {
  it("returns the replies the person has not read, and none when the read fails", async () => {
    vi.mocked(listUnreadReplies).mockResolvedValue([{ ticketId: "t1", subject: "Add an Implants page" }]);
    expect(await loadUnreadReplies(freshTenant())).toEqual([{ ticketId: "t1", subject: "Add an Implants page" }]);
    expect(listUnreadReplies).toHaveBeenCalledWith(appTx, "user-a", "business-1");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listUnreadReplies).mockRejectedValue(new Error("db down"));
    expect(await loadUnreadReplies(freshTenant())).toEqual([]);
    expect(log.mock.calls[0]?.[0]).toBe("[requests] could not read the unread replies");
    log.mockRestore();
  });
});

describe("loadRequestDetail", () => {
  it("joins the thread to the change details", async () => {
    vi.mocked(getSupportTicket).mockResolvedValue({ ticket: { id: "t1" }, messages: [{ id: "m1" }], attachments: [] } as never);
    vi.mocked(getChangeWithEvents).mockResolvedValue({ change: { id: "c1" }, events: [{ state: "requested" }] } as never);
    const detail = await loadRequestDetail(freshTenant(), "t1");
    expect(getSupportTicket).toHaveBeenCalledWith(appDb, "user-a", "t1", "business-1");
    expect(detail).toMatchObject({ ticket: { id: "t1" }, change: { id: "c1" }, events: [{ state: "requested" }] });
  });

  it("opens a question with no change details", async () => {
    vi.mocked(getSupportTicket).mockResolvedValue({ ticket: { id: "t1" }, messages: [], attachments: [] } as never);
    vi.mocked(getChangeWithEvents).mockResolvedValue(null);
    expect(await loadRequestDetail(freshTenant(), "t1")).toMatchObject({ change: null, events: [] });
  });

  it("is null for a conversation that is not the person's", async () => {
    vi.mocked(getSupportTicket).mockResolvedValue(null);
    vi.mocked(getChangeWithEvents).mockResolvedValue(null);
    expect(await loadRequestDetail(freshTenant(), "t9")).toBeNull();
  });
});
