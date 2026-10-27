import { countChatbotLeadsSince, listActivityEvents, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { getLiveWebsite, getProjectOverview } from "./onboarding";
import { loadOverview } from "./overview";
import { loadTodo } from "./todo";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("./todo", () => ({ loadTodo: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ countChatbotLeadsSince: vi.fn(), listActivityEvents: vi.fn(), listMonthlySnapshots: vi.fn(), withTenantScope: vi.fn() }));

const appDb = { name: "app-db" } as never;
const appTx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;
const now = new Date("2026-10-27T10:00:00Z");
const noBilling = { subscription: null, plan: null } as never;

function todoFor(services: readonly ("website" | "social" | "search")[]): Awaited<ReturnType<typeof loadTodo>> {
  return { services, items: [], open: 0, answers: { social: undefined, search: undefined } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] });
  vi.mocked(getLiveWebsite).mockResolvedValue(null);
  vi.mocked(listActivityEvents).mockResolvedValue([]);
  vi.mocked(listMonthlySnapshots).mockResolvedValue([]);
  vi.mocked(countChatbotLeadsSince).mockResolvedValue(0);
});

describe("loadOverview", () => {
  it("leaves out the Social line when the monthly numbers cannot be read, and keeps the website line", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website", "social"]));
    vi.mocked(countChatbotLeadsSince).mockResolvedValue(4);
    vi.mocked(listMonthlySnapshots).mockRejectedValue(new Error("db down"));

    const data = await loadOverview(tenant, noBilling, now);

    expect(data.results.map((line) => line.service)).toEqual(["website"]);
    expect(data.results[0]?.figure).toBe("4");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("still draws and logs when the project and the live website cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
    vi.mocked(getProjectOverview).mockRejectedValue(new Error("db down"));
    vi.mocked(getLiveWebsite).mockRejectedValue(new Error("db down"));

    const data = await loadOverview(tenant, noBilling, now);

    expect(data.activity).toEqual([]);
    expect(log.mock.calls.map((call) => call[0])).toEqual(["[overview] could not read the project", "[overview] could not read the live website"]);
    log.mockRestore();
  });

  it("does not swallow a redirect thrown while reading the project", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
    vi.mocked(getProjectOverview).mockRejectedValue(redirect);

    await expect(loadOverview(tenant, noBilling, now)).rejects.toBe(redirect);
  });

  it("merges a staff update with the live website row, newest first", async () => {
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
    vi.mocked(listActivityEvents).mockResolvedValue([
      { id: "event-1", occurredAt: new Date("2026-10-20T00:00:00Z"), title: "Updated your opening hours", service: "website" },
    ] as never);
    vi.mocked(getLiveWebsite).mockResolvedValue({ hostname: "cafe.example", launchedAt: new Date("2026-10-25T00:00:00Z") } as never);

    const data = await loadOverview(tenant, noBilling, now);

    expect(data.activity.map((row) => row.label)).toEqual(["Your website went live on cafe.example", "Updated your opening hours"]);
  });

  it("gives a customer without a subscription no next payment", async () => {
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));

    const data = await loadOverview(tenant, noBilling, now);

    expect(data.nextPayment).toBeNull();
  });

  describe("the next payment", () => {
    const paidThrough = new Date("2026-11-20T00:00:00Z");
    const plan = { recurringAmountCents: 299_900, currency: "INR" };
    const billingFor = (overrides: Record<string, unknown>, planOverride: unknown = plan, hasAccess = true) =>
      ({
        hasAccess,
        subscription: {
          status: "active",
          provider: "razorpay",
          cancelRequestedAt: null,
          commitmentEndsAt: null,
          paidThroughAt: paidThrough,
          discountAmountCents: 0,
          nextDiscountAmountCents: null,
          bundledAddOnNetCents: 0,
          pendingBundledAddOnNetCents: null,
          ...overrides,
        },
        plan: planOverride,
      }) as never;

    it("shows the date and the amount for an active card subscription", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));

      const data = await loadOverview(tenant, billingFor({}), now);

      expect(data.nextPayment).toEqual({ date: paidThrough, amount: expect.stringContaining("2,999") });
    });

    it("shows no next payment once access has lapsed, even with a past paid-through date", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));

      const data = await loadOverview(tenant, billingFor({ paidThroughAt: new Date("2026-10-01T00:00:00Z") }, plan, false), now);

      expect(data.nextPayment).toBeNull();
    });

    it("keeps the date with no amount when nothing is left to charge", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));

      const data = await loadOverview(tenant, billingFor({ discountAmountCents: 299_900 }), now);

      expect(data.nextPayment).toEqual({ date: paidThrough, amount: null });
    });

    it.each([
      ["cancelled", { status: "cancelled" }],
      ["asked to end", { cancelRequestedAt: new Date("2026-10-20T00:00:00Z") }],
      ["paid by hand", { provider: "manual" }],
    ])("shows no next payment for a subscription that is %s", async (_label, overrides) => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));

      const data = await loadOverview(tenant, billingFor(overrides), now);

      expect(data.nextPayment).toBeNull();
    });
  });
});
