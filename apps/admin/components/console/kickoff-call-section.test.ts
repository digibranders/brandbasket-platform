import { findSetupCallBooking } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffCallSection } from "./kickoff-call-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findSetupCallBooking: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/kickoff-actions", () => ({
  markCallHeldAction: vi.fn(),
  undoCallHeldAction: vi.fn(),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

async function render(): Promise<string> {
  return renderToStaticMarkup(await KickoffCallSection({ businessId: BUSINESS }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("KickoffCallSection", () => {
  it("offers Mark call as held while the call is not held, and says when it was booked in India time", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: new Date("2026-10-28T10:00:00Z"), heldAt: null } as never);
    const html = await render();
    expect(html).toContain('id="kickoff-call"');
    expect(html).toContain("Mark call as held");
    expect(html).not.toContain(">Undo<");
    expect(html).toContain("28 October 2026");
    expect(html).toContain("3:30");
    expect(html).toContain("Not yet");
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
  });

  it("offers Undo once the call is held", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: null, heldAt: new Date("2026-10-29T10:00:00Z") } as never);
    const html = await render();
    expect(html).toContain(">Undo<");
    expect(html).not.toContain("Mark call as held");
    expect(html).toContain("Not booked through the dashboard");
    expect(html).toContain("29 October 2026");
  });

  it("treats no booking as not booked and not held", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Not booked through the dashboard");
    expect(html).toContain("Mark call as held");
  });
});
