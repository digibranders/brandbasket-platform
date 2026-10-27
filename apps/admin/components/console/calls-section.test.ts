import { findSetupCallBooking, listTeamCalls } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallsSection } from "./calls-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, findSetupCallBooking: vi.fn(), listTeamCalls: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/app/(protected)/clients/[businessId]/call-actions", () => ({ markTeamCallHeldAction: vi.fn(), undoTeamCallHeldAction: vi.fn(), saveCallSummaryAction: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

const call = (overrides: Record<string, unknown>) =>
  ({
    id: "call-1",
    reason: "social",
    note: "Ads for braces",
    status: "booked",
    source: "dashboard",
    startsAt: new Date("2026-12-02T08:30:00.000Z"),
    endsAt: new Date("2026-12-02T09:00:00.000Z"),
    summary: null,
    ...overrides,
  }) as never;

async function render(notice: Parameters<typeof CallsSection>[0]["notice"] = null): Promise<string> {
  return renderToStaticMarkup(await CallsSection({ businessId: BUSINESS, notice })).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listTeamCalls).mockResolvedValue([]);
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-02T09:30:00Z"));
});

describe("CallsSection", () => {
  it("says there are no calls after the kickoff yet", async () => {
    const html = await render();
    expect(html).toContain('id="calls"');
    expect(html).toContain("No calls after the kickoff yet.");
    expect(html).toContain("what was agreed");
  });

  it("lists a booked call that has started with what the customer wrote, in India time, and offers Mark as held", async () => {
    vi.mocked(listTeamCalls).mockResolvedValue([call({})]);
    const html = await render();
    expect(html).toContain("2 December 2026");
    expect(html).toContain("2:00");
    expect(html).toContain("India time");
    expect(html).toContain("Social &amp; Ads");
    expect(html).toContain("Ads for braces");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Mark as held");
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html).toContain('name="callId" value="call-1"');
    expect(html).not.toContain('name="summary"');
  });

  it("does not offer Mark as held on a call that is still ahead", async () => {
    vi.mocked(listTeamCalls).mockResolvedValue([call({ startsAt: new Date("2026-12-09T08:30:00.000Z"), endsAt: new Date("2026-12-09T09:00:00.000Z") })]);
    const html = await render();
    expect(html).toContain("Booked, not started");
    expect(html).not.toContain("Mark as held");
  });

  it("offers a box for what was agreed, with what is saved, and Undo, on a held call", async () => {
    vi.mocked(listTeamCalls).mockResolvedValue([call({ status: "held", summary: "Try braces ads in January" })]);
    const html = await render();
    expect(html).toContain("Held");
    expect(html).toContain("What was agreed");
    expect(html).toMatch(/<textarea[^>]*name="summary"[^>]*maxLength="600"|<textarea[^>]*maxlength="600"[^>]*name="summary"/i);
    expect(html).toContain("Try braces ads in January");
    expect(html).toContain(">Undo<");
    expect(html).toContain(">Save<");
    expect(html).not.toContain("Mark as held");
  });

  it("lists the kickoff call, held, with a box for what was agreed, and nothing to mark", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: new Date("2026-10-27T08:30:00.000Z"), heldAt: new Date("2026-10-27T09:10:00.000Z"), summary: "6 pages in blue and white" } as never);
    const html = await render();
    expect(html).toContain("Kickoff");
    expect(html).toContain('name="callId" value="kickoff"');
    expect(html).toContain("6 pages in blue and white");
    expect(html).not.toContain("Mark as held");
    expect(html).not.toContain(">Undo<");
  });

  it("shows a cancelled call with no buttons", async () => {
    vi.mocked(listTeamCalls).mockResolvedValue([call({ status: "cancelled" })]);
    const html = await render();
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Mark as held");
    expect(html).not.toContain(">Save<");
  });

  it("shows the notice an action left in the address", async () => {
    expect(await render("saved")).toContain("Saved. The customer can read it on their Calls page.");
    expect(await render("gone")).toContain("That call has changed.");
  });
});
