import type { BusinessProfile } from "@brandbasket/db";
import { listServiceSetups, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import type { OnboardingSnapshot } from "./rules-snapshot";
import { readOnboardingSnapshot } from "./server/snapshot";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ name: "app-db" })) }));
vi.mock("@brandbasket/db", () => ({ listServiceSetups: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("./server/snapshot", () => ({ readOnboardingSnapshot: vi.fn() }));

const { loadChecklistSummary } = await import("./loader");
const { load } = await import("@/lib/loaded");

const tx = { name: "scoped-tx" };

function customer(services: CustomerContext["services"]): CustomerContext {
  return { tenant: { userId: "u1", businessId: "b1", businessName: "Bloom", role: "owner" }, businessId: "b1", services } as unknown as CustomerContext;
}

const OPEN_SNAPSHOT: OnboardingSnapshot = {
  project: { id: "p1", status: "onboarding" } as OnboardingSnapshot["project"],
  locked: false,
  completed: ["business"],
  profile: { displayName: "Bloom", phone: "+919820011223", email: null } as unknown as BusinessProfile,
  hours: [],
  services: [],
  brief: null,
  domain: null,
  logo: null,
  photos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx as never));
  vi.mocked(readOnboardingSnapshot).mockResolvedValue(OPEN_SNAPSHOT);
  vi.mocked(listServiceSetups).mockResolvedValue([]);
});

describe("loadChecklistSummary", () => {
  it("returns the items for Home: open first, with the deep link and the counts", async () => {
    const summary = await loadChecklistSummary(customer(["website", "social"]));
    expect(summary.total).toBe(6);
    expect(summary.done).toBe(1);
    expect(summary.items.map((item) => item.key)).toEqual(["brand", "services", "domain", "accounts", "budget", "business"]);
    expect(summary.items[0]).toEqual({ key: "brand", label: "Logo and photos", service: "website", done: false, href: "/checklist?item=brand" });
  });

  it("reads Social and Search answers only for a plan that has them", async () => {
    await loadChecklistSummary(customer(["website"]));
    expect(listServiceSetups).not.toHaveBeenCalled();
    await loadChecklistSummary(customer(["search"]));
    expect(listServiceSetups).toHaveBeenCalledWith(tx, "b1");
    expect(readOnboardingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("throws on a failed read, so the caller's panel shows its error and never an all-open list", async () => {
    vi.mocked(readOnboardingSnapshot).mockRejectedValue(new Error("connection refused"));
    await expect(loadChecklistSummary(customer(["website", "social"]))).rejects.toThrow("connection refused");
  });

  it("is a failed panel, not an all-open or all-done list, once wrapped in load()", async () => {
    vi.mocked(listServiceSetups).mockRejectedValue(new Error("connection refused"));
    const result = await load("home.checklist", () => loadChecklistSummary(customer(["social"])));
    expect(result).toMatchObject({ ok: false, error: { eventId: "event-1" } });
    expect(result).not.toHaveProperty("data");
  });
});
