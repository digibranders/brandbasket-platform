import { findSetupCallBooking, isProjectStartedWithoutCallConfirmation } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffCallSection } from "./kickoff-call-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  findSetupCallBooking: vi.fn(),
  isProjectStartedWithoutCallConfirmation: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/server/db", () => ({
  getStaffDb: vi.fn(() => ({})),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

async function render(): Promise<string> {
  return renderToStaticMarkup(await KickoffCallSection({ businessId: BUSINESS }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("KickoffCallSection", () => {
  it("renders read-only status with no mark or undo buttons", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: new Date("2026-10-28T10:00:00Z"), heldAt: null } as never);
    const html = await render();
    expect(html).toContain('id="kickoff-call"');
    expect(html).toContain("Call completed");
    expect(html).toContain("Not yet");
    expect(html).not.toContain("Mark call as held");
    expect(html).not.toContain(">Undo<");
    expect(html).not.toContain("<form");
    expect(html).toContain("28 October 2026");
    expect(html).toContain("3:30");
  });

  it("renders timing window and direct join meeting link when booking has timing and meeting URL", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({
      startsAt: new Date("2026-10-28T10:00:00Z"),
      endsAt: new Date("2026-10-28T10:30:00Z"),
      inviteeUri: "https://api.cal.com/v2/bookings/cal-uid-456",
      heldAt: null,
    } as never);
    const html = await render();
    expect(html).toContain("Timing window");
    expect(html).toContain("3:30 PM to 4:00 PM");
    expect(html).toContain('href="https://app.cal.com/video/cal-uid-456"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Join meeting");
  });

  it("does not render join meeting link when inviteeUri is not available", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({
      startsAt: new Date("2026-10-28T10:00:00Z"),
      endsAt: new Date("2026-10-28T10:30:00Z"),
      inviteeUri: null,
      heldAt: null,
    } as never);
    const html = await render();
    expect(html).toContain("Timing window");
    expect(html).toContain("3:30 PM to 4:00 PM");
    expect(html).not.toContain("Join meeting");
  });

  it("shows completed time when the call is completed, without any action buttons", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: null, heldAt: new Date("2026-10-29T10:00:00Z") } as never);
    const html = await render();
    expect(html).not.toContain(">Undo<");
    expect(html).not.toContain("<form");
    expect(html).toContain("Not booked through the dashboard");
    expect(html).toContain("29 October 2026");
  });

  it("treats no booking as not booked and not completed, with no action buttons", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Not booked through the dashboard");
    expect(html).toContain("Not yet");
    expect(html).not.toContain("<form");
  });

  it("shows started without call confirmation when fallback triggered", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: new Date("2026-10-28T10:00:00Z"), heldAt: null } as never);
    vi.mocked(isProjectStartedWithoutCallConfirmation).mockResolvedValue(true);
    const html = await render();
    expect(html).toContain("Started without call confirmation");
    expect(html).not.toContain("<form");
  });
});
