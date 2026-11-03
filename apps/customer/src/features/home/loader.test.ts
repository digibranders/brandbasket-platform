import { countIncludedEdits, listActivityEvents, listRequestNeeds, listWaitingOnYou } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChecklistSummary } from "@/features/checklist/loader";
import { callsOpenFor, readBookingUrl, readKickoffFacts, readMissedKickoffAt, readTeamCalls } from "@/features/calls/server/calls";
import { loadHomePanels, loadHomeState, loadIncludedEdits, loadNeedsYou, type HomeStateView } from "./loader";

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
  listActivityEvents: vi.fn(),
  listDeliverablesForBusiness: vi.fn(async () => []),
  listEnquiries: vi.fn(async () => []),
  listMonthlySnapshots: vi.fn(async () => []),
  listRequestNeeds: vi.fn(),
  listWaitingOnYou: vi.fn(),
  listWaitingPosts: vi.fn(async () => []),
  withTenantScope: vi.fn(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ kind: "tx" })),
}));

const NOW = new Date("2026-11-20T06:30:00.000Z");

function customer(overrides: { status?: "paid" | "unpaid" | "lapsed"; services?: readonly string[]; hasWebsite?: boolean } = {}) {
  return {
    user: { id: "u1", name: "Anand Verma", email: "anand@example.test" },
    tenant: {},
    businessId: "b1",
    role: "owner",
    services: overrides.services ?? ["website", "social"],
    billing: { status: overrides.status ?? "paid", paymentUnderReview: false, hasAccess: (overrides.status ?? "paid") === "paid", hasWebsite: overrides.hasWebsite ?? true, subscription: null, plan: null },
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

  it("reads nothing but the booking page for a payment task", async () => {
    const panels = await loadHomePanels(customer({ status: "unpaid" }), view("payment_required"), NOW);
    expect(panels).toMatchObject({ checklist: null, needs: null, enquiries: null, services: null, activity: null, coming: null, included: null });
    expect(listRequestNeeds).not.toHaveBeenCalled();
  });

  it("has no included edits without the website, and an error when they cannot be counted", async () => {
    expect(await loadIncludedEdits(customer({ hasWebsite: false }), NOW)).toEqual({ ok: true, data: null });
    vi.mocked(countIncludedEdits).mockRejectedValue(new Error("down"));
    expect((await loadIncludedEdits(customer(), NOW)).ok).toBe(false);
  });
});
