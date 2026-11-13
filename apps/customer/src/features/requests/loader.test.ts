import { getSupportTicket, listRequestItems } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChange, loadRequestRows, loadThread } from "./loader";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn(() => "event-1") }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  listRequestItems: vi.fn(),
  getSupportTicket: vi.fn(),
  getChangeWithEvents: vi.fn(),
  withTenantScope: vi.fn(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ kind: "tx" })),
}));

const customer = { user: { id: "user-1" }, tenant: { businessId: "business-1" }, businessId: "business-1", billing: { hasWebsite: true } } as never;

beforeEach(() => vi.clearAllMocks());

describe("the loaders", () => {
  it("return a typed failure, not an empty list, when the list cannot be read", async () => {
    vi.mocked(listRequestItems).mockRejectedValue(new Error("connection reset"));
    const rows = await loadRequestRows(customer);
    expect(rows.ok).toBe(false);
    expect(!rows.ok && rows.error.eventId).toBe("event-1");
  });

  it("fail the thread and the change separately", async () => {
    vi.mocked(getSupportTicket).mockRejectedValue(new Error("down"));
    expect((await loadThread(customer, "t1")).ok).toBe(false);
    // The change read is its own panel: getChangeWithEvents is mocked to return undefined, which is a read that succeeded with nothing.
    expect((await loadChange(customer, "t1")).ok).toBe(true);
  });

  it("read the person's own conversations of the session's business", async () => {
    vi.mocked(listRequestItems).mockResolvedValue([]);
    expect(await loadRequestRows(customer)).toEqual({ ok: true, data: [] });
    expect(listRequestItems).toHaveBeenCalledWith({ kind: "tx" }, "user-1", "business-1");
  });
});
