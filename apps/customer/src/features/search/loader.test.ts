import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSearchPresence } from "./loader";

vi.mock("@/lib/report", () => ({ reportError: vi.fn(() => undefined) }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({}) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));

const db = vi.hoisted(() => ({ findSearchConnection: vi.fn(), listSearchDays: vi.fn(), listSearchLists: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  withTenantScope: async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({}),
  ...db,
}));

const NOW = new Date("2026-11-03T06:00:00.000Z");
const TENANT = { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Apex", role: "owner" } as never;
const FETCHED = new Date("2026-11-03T00:30:00.000Z");

const clicks = (day: string, value: number) => ({ metric: "clicks", day, value, fetchedAt: FETCHED });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  db.findSearchConnection.mockResolvedValue({ status: "connected" });
  db.listSearchDays.mockResolvedValue([]);
  db.listSearchLists.mockResolvedValue([]);
});

describe("loadSearchPresence", () => {
  it("reads nothing and returns null while the switch is off", () => {
    expect(loadSearchPresence(TENANT, NOW)).toBeNull();
    expect(db.findSearchConnection).not.toHaveBeenCalled();
    expect(db.listSearchDays).not.toHaveBeenCalled();
  });

  it("has no data without a connection, or once it was removed, and reads no numbers", async () => {
    vi.stubEnv("CUSTOMER_SEARCH_ENABLED", "true");
    db.findSearchConnection.mockResolvedValue(null);
    expect(await loadSearchPresence(TENANT, NOW)).toEqual({ ok: true, data: null });
    db.findSearchConnection.mockResolvedValue({ status: "removed" });
    expect(await loadSearchPresence(TENANT, NOW)).toEqual({ ok: true, data: null });
    expect(db.listSearchDays).not.toHaveBeenCalled();
  });

  it("is waiting when a connection has no measured day, whatever its status", async () => {
    vi.stubEnv("CUSTOMER_SEARCH_ENABLED", "1");
    for (const status of ["pending", "awaiting_setup", "connected", "access_lost"]) {
      db.findSearchConnection.mockResolvedValue({ status });
      expect(await loadSearchPresence(TENANT, NOW)).toEqual({ ok: true, data: { kind: "waiting" } });
    }
    expect(db.listSearchLists).not.toHaveBeenCalled();
  });

  it("is waiting when only impressions were stored: no clicks day, no number", async () => {
    vi.stubEnv("CUSTOMER_SEARCH_ENABLED", "1");
    db.listSearchDays.mockResolvedValue([{ metric: "impressions", day: "2026-10-30", value: 40, fetchedAt: FETCHED }]);
    expect(await loadSearchPresence(TENANT, NOW)).toEqual({ ok: true, data: { kind: "waiting" } });
  });

  it("is measured: the window ends at the last measured day, and the current month's lists are used", async () => {
    vi.stubEnv("CUSTOMER_SEARCH_ENABLED", "1");
    db.listSearchDays.mockResolvedValue([clicks("2026-10-29", 4), clicks("2026-10-30", 6)]);
    db.listSearchLists.mockImplementation(async (_tx: unknown, month: string) =>
      month === "2026-11-01" ? [{ dimension: "query", rows: [{ key: "sweet shop near me", count: 48 }], fetchedAt: FETCHED }] : [],
    );
    const loaded = await loadSearchPresence(TENANT, NOW);
    expect(db.listSearchDays).toHaveBeenCalledWith(expect.anything(), "2026-07-06", "2026-11-03");
    expect(loaded?.ok && loaded.data).toMatchObject({
      kind: "measured",
      summary: { clicks: 10, from: "2026-10-29", to: "2026-10-30", change: null },
      lists: { month: "2026-11-01", queries: [{ label: "sweet shop near me", value: 48 }], pages: [] },
    });
  });

  it("falls back to last month's lists, and has none when neither month was pulled", async () => {
    vi.stubEnv("CUSTOMER_SEARCH_ENABLED", "1");
    db.listSearchDays.mockResolvedValue([clicks("2026-10-30", 6)]);
    db.listSearchLists.mockImplementation(async (_tx: unknown, month: string) =>
      month === "2026-10-01" ? [{ dimension: "page", rows: [{ key: "https://apex.in/", count: 9 }], fetchedAt: FETCHED }] : [],
    );
    const fallback = await loadSearchPresence(TENANT, NOW);
    expect(fallback?.ok && fallback.data).toMatchObject({ kind: "measured", lists: { month: "2026-10-01", pages: [{ label: "Home", value: 9 }] } });
    db.listSearchLists.mockResolvedValue([]);
    const none = await loadSearchPresence(TENANT, NOW);
    expect(none?.ok && none.data).toMatchObject({ kind: "measured", lists: null });
  });

  it("returns the error state when a read fails, never a guessed one", async () => {
    vi.stubEnv("CUSTOMER_SEARCH_ENABLED", "1");
    db.listSearchDays.mockRejectedValue(new Error("connection lost"));
    const loaded = await loadSearchPresence(TENANT, NOW);
    expect(loaded?.ok).toBe(false);
    expect(loaded).not.toHaveProperty("data");
    db.findSearchConnection.mockRejectedValue(new Error("connection lost"));
    expect((await loadSearchPresence(TENANT, NOW))?.ok).toBe(false);
  });
});
