import { describe, expect, it, vi } from "vitest";
import type { LiveSpotRow } from "@firstfold/db";
import { spotsNow } from "./advertise-spots-now";

vi.mock("server-only", () => ({}));

const WEEK = "2026-10-05";

function row(overrides: Partial<LiveSpotRow> & Pick<LiveSpotRow, "placement" | "spot">): LiveSpotRow {
  return {
    weekStart: WEEK,
    businessId: null,
    source: "staff",
    ad: { spot: overrides.spot, key: "dentists/thane/naupada/smile-dental", linkUrl: null, picture: null, placeId: null, name: "Smile Dental", tagline: null },
    ...overrides,
  };
}

describe("spotsNow", () => {
  it("lists every placement that is sold in the board's order, with free spots simply absent", () => {
    const spots = spotsNow([row({ placement: "side", spot: 1, businessId: "me", source: "auction" })], "me");
    expect(spots.map((entry) => [entry.placement, entry.totalSpots, entry.holders.length])).toEqual([
      ["home", 4, 0],
      ["side", 2, 1],
      ["profile", 1, 0],
    ]);
  });

  it("leaves out the top of the list, which is no longer sold, even where an ad of it is still running", () => {
    const spots = spotsNow([row({ placement: "top", spot: 1, businessId: "me", source: "auction" })], "me");
    expect(spots.map((entry) => entry.placement)).toEqual(["home", "side", "profile"]);
  });

  it("marks the signed-in business's own ad and ends it at the end of its week", () => {
    const [home] = spotsNow(
      [
        row({ placement: "home", spot: 2, businessId: "someone-else", source: "auction", ad: { spot: 2, key: "k/thane/a/x", linkUrl: null, picture: null, placeId: null, name: "Other Clinic", tagline: null } }),
        row({ placement: "home", spot: 1, businessId: "me", source: "auction" }),
      ],
      "me",
    );
    expect(home?.holders.map((holder) => [holder.spot, holder.name, holder.mine])).toEqual([
      [1, "Smile Dental", true],
      [2, "Other Clinic", false],
    ]);
    // The week of Monday 5 Oct ends at Monday 12 Oct 00:00 in India.
    expect(home?.holders[0]?.endsAt.toISOString()).toBe("2026-10-11T18:30:00.000Z");
  });

  it("ends a staff-placed ad when its whole run of booked weeks ends, not at the end of this week", () => {
    const held = [WEEK, "2026-10-12", "2026-10-19", "2026-10-26"].map((weekStart) => ({ placement: "home" as const, spot: 1, weekStart }));
    const [home] = spotsNow([row({ placement: "home", spot: 1 })], "me", held);
    // The run's last week, from Monday 26 Oct, ends at Monday 2 Nov 00:00 in India.
    expect(home?.holders[0]?.endsAt.toISOString()).toBe("2026-11-01T18:30:00.000Z");
  });

  it("never calls a staff-placed ad the business's own", () => {
    const [home] = spotsNow([row({ placement: "home", spot: 1, businessId: null })], "me");
    expect(home?.holders[0]?.mine).toBe(false);
  });
});
