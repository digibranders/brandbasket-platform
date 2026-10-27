import { countChatbotLeadsSince, countIncludedEdits, countSiteEvents, listActivityEvents, listMonthlySnapshots, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadNextCall } from "./calls";
import { getAppDb } from "./db";
import { getLiveWebsite, getProjectOverview } from "./onboarding";
import { loadOverview } from "./overview";
import { loadRequestNeeds } from "./requests";
import { loadWaitingPostCount } from "./social";
import { loadTodo } from "./todo";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./calls", () => ({ loadNextCall: vi.fn() }));
vi.mock("./onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("./todo", () => ({ loadTodo: vi.fn() }));
vi.mock("./requests", () => ({ loadRequestNeeds: vi.fn() }));
vi.mock("./social", () => ({ loadWaitingPostCount: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ countChatbotLeadsSince: vi.fn(), countIncludedEdits: vi.fn(), countSiteEvents: vi.fn(), listActivityEvents: vi.fn(), listMonthlySnapshots: vi.fn(), withTenantScope: vi.fn() }));

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
  vi.mocked(loadRequestNeeds).mockResolvedValue([]);
  vi.mocked(countIncludedEdits).mockResolvedValue(0);
  vi.mocked(countSiteEvents).mockResolvedValue({ call: 0, whatsapp: 0, form: 0 });
  vi.mocked(loadWaitingPostCount).mockResolvedValue({ count: 0, by: null });
  vi.mocked(loadNextCall).mockResolvedValue(null);
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

  it("carries the time of the next call after the kickoff, for the signed-in business", async () => {
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
    vi.mocked(loadNextCall).mockResolvedValue("Wed 2 Dec, 14:00");
    const data = await loadOverview(tenant, noBilling, now);
    expect(data.nextCall).toBe("Wed 2 Dec, 14:00");
    expect(loadNextCall).toHaveBeenCalledWith(tenant, now);
  });

  it("adds the quotes to accept and the changes to check to what needs the customer, ahead of the To do items", async () => {
    vi.mocked(loadTodo).mockResolvedValue({ ...todoFor(["website"]), open: 2 });
    vi.mocked(loadRequestNeeds).mockResolvedValue([
      { ticketId: "t1", subject: "Add an Implants page", kind: "website", state: "quoted", quote: { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR", workingDays: 5, quotedAt: now }, acceptedAt: null, updatedAt: now },
    ]);

    const data = await loadOverview(tenant, noBilling, now);

    expect(data.open).toBe(3);
    expect(data.requests).toEqual([{ key: "request-t1", label: "Accept a quote: Add an Implants page", hint: "3 hours, ₹1,500", service: "website", href: "/requests?open=t1" }]);
  });

  it("counts the month's included edits for a plan with the website, in India's month, and none for a plan without it", async () => {
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
    vi.mocked(countIncludedEdits).mockResolvedValue(1);

    const withWebsite = await loadOverview(tenant, { subscription: null, plan: null, hasWebsite: true } as never, now);

    expect(withWebsite.included).toEqual({ used: 1, allowed: 2 });
    const [, businessId, window] = vi.mocked(countIncludedEdits).mock.calls[0] ?? [];
    expect(businessId).toBe("business-1");
    expect(window?.from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(window?.to.toISOString()).toBe("2026-10-31T18:30:00.000Z");

    vi.mocked(countIncludedEdits).mockClear();
    const without = await loadOverview(tenant, { subscription: null, plan: null, hasWebsite: false } as never, now);
    expect(without.included).toBeNull();
    expect(countIncludedEdits).not.toHaveBeenCalled();
  });

  it("leaves the included-edits line out, and logs once, when the count cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
    vi.mocked(countIncludedEdits).mockRejectedValue(new Error("db down"));

    const data = await loadOverview(tenant, { subscription: null, plan: null, hasWebsite: true } as never, now);

    expect(data.included).toBeNull();
    expect(log.mock.calls.map((call) => call[0])).toEqual(["[overview] could not read the included edits"]);
    log.mockRestore();
  });
  describe("posts waiting for approval", () => {
    it("adds one row at the front of what needs the customer and counts it in open", async () => {
      vi.mocked(loadTodo).mockResolvedValue({ ...todoFor(["website", "social"]), open: 2 });
      vi.mocked(loadWaitingPostCount).mockResolvedValue({ count: 4, by: "Tue 1 Dec" });
      vi.mocked(loadRequestNeeds).mockResolvedValue([
        { ticketId: "t1", subject: "Add a page", kind: "website", state: "preview", quote: null, acceptedAt: null, updatedAt: now },
      ]);

      const data = await loadOverview(tenant, noBilling, now);

      expect(data.requests[0]).toEqual({ key: "posts", label: "Approve 4 posts", hint: "by Tue 1 Dec", service: "social", href: "/social" });
      expect(data.requests).toHaveLength(2);
      expect(data.open).toBe(4);
    });

    it("says Approve 1 post for a single post", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["social"]));
      vi.mocked(loadWaitingPostCount).mockResolvedValue({ count: 1, by: "Tue 1 Dec" });

      const data = await loadOverview(tenant, noBilling, now);

      expect(data.requests.map((row) => row.label)).toEqual(["Approve 1 post"]);
      expect(data.open).toBe(1);
    });

    it("adds no row when nothing is waiting", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["social"]));

      const data = await loadOverview(tenant, noBilling, now);

      expect(data.requests).toEqual([]);
      expect(data.open).toBe(0);
    });

    it("leaves the row out, and logs once, when the count cannot be read", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["social"]));
      vi.mocked(loadWaitingPostCount).mockRejectedValue(new Error("db down"));

      const data = await loadOverview(tenant, noBilling, now);

      expect(data.requests).toEqual([]);
      expect(data.open).toBe(0);
      expect(log.mock.calls.map((call) => call[0])).toEqual(["[overview] could not read the posts waiting for approval"]);
      log.mockRestore();
    });

    it("does not read the posts for a business without Social & Ads", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));

      await loadOverview(tenant, noBilling, now);

      expect(loadWaitingPostCount).not.toHaveBeenCalled();
    });
  });

  describe("website enquiries", () => {
    const octoberStart = new Date("2026-10-01T00:00:00+05:30").getTime();

    it("counts this month and last month in India's months and shows the website line with last month's total", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
      vi.mocked(countSiteEvents).mockImplementation(async (_db, _businessId, window) =>
        window.from.getTime() === octoberStart ? { call: 3, whatsapp: 1, form: 2 } : { call: 2, whatsapp: 0, form: 1 },
      );

      const data = await loadOverview(tenant, noBilling, now);

      const windows = vi.mocked(countSiteEvents).mock.calls.map(([, businessId, window]) => [businessId, window.from.toISOString(), window.to.toISOString()]);
      expect(windows).toEqual([
        ["business-1", "2026-09-30T18:30:00.000Z", "2026-10-31T18:30:00.000Z"],
        ["business-1", "2026-08-31T18:30:00.000Z", "2026-09-30T18:30:00.000Z"],
      ]);
      expect(data.results).toEqual([
        { service: "website", figure: "6", headline: "people contacted you from your website", detail: "3 calls, 1 WhatsApp, 2 forms, up from 3" },
      ]);
    });

    it("keeps today's chatbot line when the site has sent no events", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
      vi.mocked(countChatbotLeadsSince).mockResolvedValue(4);

      const data = await loadOverview(tenant, noBilling, now);

      expect(data.results).toEqual([{ service: "website", figure: "4", headline: "people left their details with your chatbot", detail: null }]);
    });

    it("keeps the chatbot line, and logs once, when the events cannot be read", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["website"]));
      vi.mocked(countChatbotLeadsSince).mockResolvedValue(4);
      vi.mocked(countSiteEvents).mockRejectedValue(new Error("db down"));

      const data = await loadOverview(tenant, noBilling, now);

      expect(data.results[0]?.figure).toBe("4");
      expect(log.mock.calls.map((call) => call[0])).toEqual(["[overview] could not read the website enquiries"]);
      log.mockRestore();
    });

    it("does not read the events for a business without the website", async () => {
      vi.mocked(loadTodo).mockResolvedValue(todoFor(["social"]));

      await loadOverview(tenant, noBilling, now);

      expect(countSiteEvents).not.toHaveBeenCalled();
    });
  });
});
