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
});
