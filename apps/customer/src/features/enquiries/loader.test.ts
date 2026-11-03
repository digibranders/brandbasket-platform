import { listEnquiries, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnquiries, loadEnquiriesForExport } from "./loader";
import type { EnquiryRecord } from "./rules";

vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@brandbasket/db", () => ({ listEnquiries: vi.fn(), withTenantScope: vi.fn() }));

const NOW = new Date("2026-11-03T06:30:00Z");
const customer = { tenant: { businessId: "b1" } } as never;
const tx = { name: "tx" } as never;
const day = 86_400_000;

function record(id: string, ageDays: number, over: Partial<EnquiryRecord> = {}): EnquiryRecord {
  return { id, kind: "chat", source: null, name: id, phone: null, email: null, message: null, status: "contacted", note: null, receivedAt: new Date(NOW.getTime() - ageDays * day), sourceRef: `chatbot_lead:${id}`, ...over };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work(tx));
});

describe("loadEnquiries", () => {
  it("keeps the last 30 days and anyone older who is still waiting, and reads waiting people separately", async () => {
    vi.mocked(listEnquiries).mockImplementation(async (_tx, filter) =>
      filter.status !== undefined
        ? [record("waiting-old", 70, { status: "new" })]
        : ([record("recent", 2), record("older", 45), record("ancient", 100)] as never),
    );
    const view = await loadEnquiries(customer, NOW);
    expect(view.rows.map((row) => row.title).sort()).toEqual(["recent", "waiting-old"]);
    expect(view.summary.waiting).toBe(1);
    expect(view.truncated).toBe(false);
    expect(listEnquiries).toHaveBeenCalledWith(tx, { status: ["new"], kind: ["chat", "form", "ad_lead"], limit: 200 });
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, customer.tenant, expect.any(Function));
  });

  it("does not list the same enquiry twice when it is both recent and waiting", async () => {
    vi.mocked(listEnquiries).mockImplementation(async (_tx, filter) => (filter.status !== undefined ? [record("a", 1, { status: "new" })] : [record("a", 1, { status: "new" })]) as never);
    expect((await loadEnquiries(customer, NOW)).rows).toHaveLength(1);
  });

  it("says it was cut short when it hit the page limit before reaching 90 days back", async () => {
    vi.mocked(listEnquiries).mockImplementation(async (_tx, filter) =>
      filter.status !== undefined ? [] : (Array.from({ length: 200 }, (_, i) => record(`r${filter.offset}-${i}`, 1)) as never),
    );
    const view = await loadEnquiries(customer, NOW);
    expect(view.truncated).toBe(true);
    expect(view.summary.receivedChange).toBeNull();
    expect(listEnquiries).toHaveBeenCalledTimes(6);
  });

  it("lets a database failure through for the panel to show as an error, never as an empty list", async () => {
    vi.mocked(listEnquiries).mockRejectedValue(new Error("connection refused"));
    await expect(loadEnquiries(customer, NOW)).rejects.toThrow("connection refused");
  });
});

describe("loadEnquiriesForExport", () => {
  it("reads every page until a short one", async () => {
    vi.mocked(listEnquiries)
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => record(`a${i}`, 1)) as never)
      .mockResolvedValueOnce([record("last", 400)] as never);
    expect(await loadEnquiriesForExport(customer)).toHaveLength(201);
    expect(listEnquiries).toHaveBeenNthCalledWith(2, tx, { limit: 200, offset: 200 });
  });
});
