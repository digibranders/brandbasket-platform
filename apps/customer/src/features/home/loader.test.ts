import { countIncludedEdits, findSiteHealthFacts, listActivityEvents, listDeliverablesForBusiness, listMonthlySnapshots, listRequestItems, listRequestNeeds, listWaitingOnYou } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChecklistSummary } from "@/features/checklist/loader";
import { callsOpenFor, readBookingUrl, readKickoffFacts, readMissedKickoffAt, readTeamCalls } from "@/features/calls/server/calls";
import { loadHomePanels, loadHomeState, loadIncludedEdits, loadNeedsYou, loadServices, type HomeStateView } from "./loader";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn(() => undefined) }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/features/checklist/loader", () => ({ loadChecklistSummary: vi.fn() }));
vi.mock("@/features/calls/loader", () => ({ canBookCalls: vi.fn(() => true) }));
vi.mock("@/features/calls/server/calls", () => ({
  callsOpenFor: vi.fn(() => true),
  readBookingUrl: vi.fn(),
  readKickoffFacts: vi.fn(),
  readMissedKickoffAt: vi.fn(),
  readTeamCalls: vi.fn(),
}));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  countIncludedEdits: vi.fn(),
  findSiteHealthFacts: vi.fn(),
  listActivityEvents: vi.fn(),
  listDeliverablesForBusiness: vi.fn(async () => []),
  listEnquiries: vi.fn(async () => []),
  listMonthlySnapshots: vi.fn(async () => []),
  listRequestItems: vi.fn(async () => []),
  listRequestNeeds: vi.fn(),
  listWaitingOnYou: vi.fn(),
  listWaitingPosts: vi.fn(async () => []),
  withTenantScope: vi.fn(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ kind: "tx" })),
}));

const NOW = new Date("2026-11-20T06:30:00.000Z");

function customer(overrides: { status?: "paid" | "unpaid" | "lapsed"; services?: readonly string[]; hasWebsite?: boolean; role?: string; renewalFailingUntil?: Date | null } = {}) {
  return {
    user: { id: "u1", name: "Anand Verma", email: "anand@example.test" },
    tenant: {},
    businessId: "b1",
    role: overrides.role ?? "owner",
    currency: "INR",
    services: overrides.services ?? ["website", "social"],
    billing: { status: overrides.status ?? "paid", paymentUnderReview: false, hasAccess: (overrides.status ?? "paid") === "paid", hasWebsite: overrides.hasWebsite ?? true, subscription: null, plan: null, renewalFailingUntil: overrides.renewalFailingUntil ?? null },
  } as never;
}

const PROJECT = { status: "building", slaDueAt: null, onHoldReason: null, previewSentAt: null, launchPlannedOn: null, revisionRoundsIncluded: 2, revisionRoundsGranted: 0, onboardingSubmittedAt: NOW } as never;
const HELD = { startsAt: new Date("2026-11-10T05:30:00Z"), endsAt: new Date("2026-11-10T06:00:00Z"), heldAt: new Date("2026-11-10T06:05:00Z"), summary: null } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readKickoffFacts).mockResolvedValue({ booking: null, project: null, live: null });
  vi.mocked(readMissedKickoffAt).mockResolvedValue(null);
  vi.mocked(readBookingUrl).mockResolvedValue("https://cal.com/a/b");
  vi.mocked(readTeamCalls).mockResolvedValue([]);
  vi.mocked(loadChecklistSummary).mockResolvedValue({ items: [], done: 0, total: 0 });
  vi.mocked(listRequestNeeds).mockResolvedValue([]);
  vi.mocked(listWaitingOnYou).mockResolvedValue([]);
  vi.mocked(listActivityEvents).mockResolvedValue([]);
  vi.mocked(countIncludedEdits).mockResolvedValue(1);
  vi.mocked(listRequestItems).mockResolvedValue([]);
  vi.mocked(listDeliverablesForBusiness).mockResolvedValue([]);
  vi.mocked(listMonthlySnapshots).mockResolvedValue([]);
});

describe("loadHomeState", () => {
  it("returns an error, never a guessed state, when the booking or project cannot be read", async () => {
    vi.mocked(readKickoffFacts).mockRejectedValue(new Error("db down"));
    const loaded = await loadHomeState(customer(), NOW);
    expect(loaded.ok).toBe(false);
    expect(loaded).not.toHaveProperty("data");
  });

  it("returns an error, not 'book your kickoff' without the miss, when the missed-call outcome cannot be read", async () => {
    vi.mocked(readMissedKickoffAt).mockRejectedValue(new Error("staff db down"));
    expect((await loadHomeState(customer(), NOW)).ok).toBe(false);
  });

  it("asks for the kickoff, with the missed time, only for a paid website customer with no booking", async () => {
    const missed = new Date("2026-11-18T05:30:00Z");
    vi.mocked(readMissedKickoffAt).mockResolvedValue(missed);
    const loaded = await loadHomeState(customer(), NOW);
    expect(loaded.ok && loaded.data.state).toEqual({ kind: "kickoff_unbooked", missedAt: missed });
    expect(loaded.ok && loaded.data.layout).toBe("task");

    vi.mocked(readMissedKickoffAt).mockClear();
    await loadHomeState(customer({ services: ["social"] }), NOW);
    expect(readMissedKickoffAt).not.toHaveBeenCalled();
  });

  it("follows the project once the kickoff is held, and says whether calls are open", async () => {
    vi.mocked(readKickoffFacts).mockResolvedValue({ booking: HELD, project: PROJECT, live: null });
    vi.mocked(callsOpenFor).mockReturnValue(true);
    const loaded = await loadHomeState(customer(), NOW);
    expect(loaded.ok && loaded.data).toMatchObject({ state: { kind: "building", dueAt: null }, layout: "progress", callsOpen: true });
  });

  it("puts an unpaid business on the payment task without reading the miss", async () => {
    const loaded = await loadHomeState(customer({ status: "unpaid" }), NOW);
    expect(loaded.ok && loaded.data.state.kind).toBe("payment_required");
    expect(readMissedKickoffAt).not.toHaveBeenCalled();
  });
});

describe("the panels", () => {
  const view = (kind: "ongoing" | "payment_required"): HomeStateView => ({
    state: { kind },
    layout: kind === "ongoing" ? "overview" : "task",
    kickoff: null,
    project: null,
    live: null,
    callsOpen: true,
  });

  it("keeps a failed panel to itself: Needs you fails, What we did still draws", async () => {
    vi.mocked(listRequestNeeds).mockRejectedValue(new Error("needs down"));
    vi.mocked(listActivityEvents).mockResolvedValue([{ id: "e1", occurredAt: NOW, title: "Published 3 posts", service: "social" }] as never);
    const panels = await loadHomePanels(customer(), view("ongoing"), NOW);
    expect(panels.needs?.ok).toBe(false);
    expect(panels.activity).toEqual({ ok: true, data: [expect.objectContaining({ key: "e1" })] });
    expect(panels.included).toEqual({ ok: true, data: expect.objectContaining({ used: 1, allowed: 2 }) });
  });

  it("does not drop the setup questions silently: Needs you fails when the checklist could not be read", async () => {
    const loaded = await loadNeedsYou(customer(), { ok: false, error: { at: NOW } });
    expect(loaded.ok).toBe(false);
  });

  it("puts a failing renewal first in Needs you, with the day the website could go offline", async () => {
    const loaded = await loadNeedsYou(customer({ renewalFailingUntil: new Date("2026-11-27T00:00:00Z") }), { ok: true, data: { items: [], done: 0, total: 0 } }, NOW);
    expect(loaded.ok && loaded.data[0]).toMatchObject({ key: "billing", action: "Change payment method", hint: "We will try again. Your website stays online until Fri 27 Nov." });
  });

  it("does not read Needs you for a viewer, who can act on none of it", async () => {
    const panels = await loadHomePanels(customer({ role: "viewer" }), view("ongoing"), NOW);
    expect(panels.needs).toBeNull();
    expect(listRequestNeeds).not.toHaveBeenCalled();
    expect(panels.activity?.ok).toBe(true);
  });

  it("lists published posts, finished search work and requests that are done in What we did", async () => {
    vi.mocked(listDeliverablesForBusiness).mockImplementation(async (_tx, _business, input) =>
      input.service === "social"
        ? ([{ id: "p1", kind: "post", title: "Diwali offer", status: "published", publishedAt: new Date("2026-11-18T05:00:00Z") }] as never)
        : ([{ id: "s1", kind: "page", title: "Contact page", status: "published", publishedAt: new Date("2026-11-17T05:00:00Z") }] as never),
    );
    vi.mocked(listRequestItems).mockResolvedValue([
      { ticketId: "t1", subject: "Change hours", ticketStatus: "resolved", category: "website_change", lastActivityAt: new Date("2026-11-16T05:00:00Z"), unread: false, change: null },
    ] as never);
    const panels = await loadHomePanels(customer({ services: ["website", "social", "search"] }), view("ongoing"), NOW);
    expect(panels.activity?.ok && panels.activity.data.map((row) => row.label)).toEqual(["Published a post: Diwali offer", "Improved a page: Contact page", "Finished your request: Change hours"]);
  });

  it("gives the strip Leads from ads and Google page one only when they were measured", async () => {
    vi.mocked(listMonthlySnapshots).mockResolvedValue([
      { service: "social", adEnquiries: 5, adSpendCents: null, adBudgetCents: null, updatedAt: NOW },
      { service: "search", keywordsPageOne: 10, keywordsPageOnePrev: 8, updatedAt: NOW },
    ] as never);
    const panels = await loadHomePanels(customer({ services: ["website", "social", "search"] }), view("ongoing"), NOW);
    expect(panels.figures).toEqual({ ok: true, data: { month: "November", adLeads: { count: 5, updatedAt: NOW }, pageOne: expect.objectContaining({ count: 10, diff: 2 }) } });
    vi.mocked(listMonthlySnapshots).mockResolvedValue([{ service: "social", adEnquiries: null, adSpendCents: null, adBudgetCents: null, updatedAt: NOW }] as never);
    const none = await loadHomePanels(customer({ services: ["website", "social", "search"] }), view("ongoing"), NOW);
    expect(none.figures).toEqual({ ok: true, data: { month: "November", adLeads: null, pageOne: null } });
  });

  it("reads nothing but the booking page for a payment task", async () => {
    const panels = await loadHomePanels(customer({ status: "unpaid" }), view("payment_required"), NOW);
    expect(panels).toMatchObject({ checklist: null, needs: null, enquiries: null, figures: null, services: null, activity: null, coming: null, included: null });
    expect(listRequestNeeds).not.toHaveBeenCalled();
  });

  it("adds the site health to the website's line once live, and leaves the line as it was when the checks cannot be read", async () => {
    const live = { ...view("ongoing"), live: { hostname: "apex.in", launchedAt: NOW } } as HomeStateView;
    vi.mocked(findSiteHealthFacts).mockResolvedValue({ latest: { status: "up", checkedAt: NOW }, firstCheckedAt: NOW, up: 1, down: 0, certificate: null, phoneSpeed: null });
    const loaded = await loadServices(customer(), live, NOW);
    expect(loaded.ok && loaded.data.find((row) => row.service === "website")?.line).toBe("Live at apex.in. Up now. Last check: Today, 12:00. Checking since Fri 20 Nov.");
    vi.mocked(findSiteHealthFacts).mockRejectedValue(new Error("down"));
    const failed = await loadServices(customer(), live, NOW);
    expect(failed.ok && failed.data.find((row) => row.service === "website")?.line).toBe("Live at apex.in.");
    expect((await loadServices(customer(), view("ongoing"), NOW)).ok).toBe(true);
  });

  it("has no included edits without the website, and an error when they cannot be counted", async () => {
    expect(await loadIncludedEdits(customer({ hasWebsite: false }), NOW)).toEqual({ ok: true, data: null });
    vi.mocked(countIncludedEdits).mockRejectedValue(new Error("down"));
    expect((await loadIncludedEdits(customer(), NOW)).ok).toBe(false);
  });
});
