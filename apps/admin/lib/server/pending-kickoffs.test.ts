import { listKickoffBoard } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPendingKickoffPrompts } from "./pending-kickoffs";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  listKickoffBoard: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  getStaffDb: vi.fn(() => ({})),
}));

const NOW = new Date("2026-11-14T10:00:00Z");

describe("listPendingKickoffPrompts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns only finished calls that are not confirmed and whose project has not started", async () => {
    vi.mocked(listKickoffBoard).mockResolvedValue([
      {
        businessId: "b-pending",
        businessName: "Pending Cafe",
        startsAt: new Date("2026-11-14T09:00:00Z"),
        endsAt: new Date("2026-11-14T09:30:00Z"),
        heldAt: null,
        summary: null,
        projectStatus: "onboarding",
        hasWebsite: true,
        services: ["managed-website"],
      },
      {
        businessId: "b-future",
        businessName: "Future Salon",
        startsAt: new Date("2026-11-14T10:30:00Z"),
        endsAt: new Date("2026-11-14T11:00:00Z"),
        heldAt: null,
        summary: null,
        projectStatus: "onboarding",
        hasWebsite: true,
        services: ["managed-website"],
      },
      {
        businessId: "b-completed",
        businessName: "Completed Shop",
        startsAt: new Date("2026-11-14T08:00:00Z"),
        endsAt: new Date("2026-11-14T08:30:00Z"),
        heldAt: new Date("2026-11-14T08:35:00Z"),
        summary: "Notes",
        projectStatus: "submitted",
        hasWebsite: true,
        services: ["managed-website"],
      },
      {
        businessId: "b-started",
        businessName: "Auto Started Store",
        startsAt: new Date("2026-11-13T08:00:00Z"),
        endsAt: new Date("2026-11-13T08:30:00Z"),
        heldAt: null,
        summary: null,
        projectStatus: "submitted",
        hasWebsite: true,
        services: ["managed-website"],
      },
    ]);

    const result = await listPendingKickoffPrompts(NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      businessId: "b-pending",
      businessName: "Pending Cafe",
      endsAt: new Date("2026-11-14T09:30:00Z"),
    });
  });
});
