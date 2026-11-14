import { listKickoffBoard } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffWrapUp } from "./kickoff-wrap-up";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  listKickoffBoard: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  getStaffDb: vi.fn(() => ({})),
}));
vi.mock("./kickoff-actions", () => ({
  completeKickoffAction: vi.fn(),
  recordKickoffOutcomeAction: vi.fn(),
}));

const NOW = new Date("2026-11-14T10:00:00Z");

describe("KickoffWrapUp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders empty state when no calls are finished and unconfirmed", async () => {
    vi.mocked(listKickoffBoard).mockResolvedValue([]);
    const html = renderToStaticMarkup(await KickoffWrapUp({ now: NOW }));
    expect(html).toContain("No calls waiting for a word from you.");
  });

  it("renders finished calls with Call completed, They did not join, and Reschedule actions", async () => {
    vi.mocked(listKickoffBoard).mockResolvedValue([
      {
        businessId: "biz-1",
        businessName: "Green Leaf Cafe",
        startsAt: new Date("2026-11-14T09:00:00Z"),
        endsAt: new Date("2026-11-14T09:30:00Z"),
        heldAt: null,
        summary: null,
        projectStatus: "onboarding",
        hasWebsite: true,
        services: ["managed-website"],
      },
    ]);
    const html = renderToStaticMarkup(await KickoffWrapUp({ now: NOW }));
    expect(html).toContain("Green Leaf Cafe");
    expect(html).toContain("Call completed");
    expect(html).toContain("They did not join");
    expect(html).toContain("Reschedule");
    expect(html).not.toContain("held");
  });
});
