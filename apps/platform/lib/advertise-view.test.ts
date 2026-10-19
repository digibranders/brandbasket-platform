import { describe, expect, it, vi } from "vitest";
import type { DirectoryAdBid, DirectoryAdWin } from "@brandbasket/db";
import { adOutcomes, bidPanelWeeks, marketPageHref, placementPageHref, weekLabel } from "./advertise-view";

vi.mock("server-only", () => ({}));

/** Wednesday 30 Sept 2026: the running week is 28 Sept, next week 5 Oct. */
const NOW = new Date("2026-09-30T06:00:00.000Z");
const THIS_WEEK = "2026-09-28";
const NEXT_WEEK = "2026-10-05";

function win(overrides: Partial<DirectoryAdWin>): DirectoryAdWin {
  return {
    id: "win-1",
    chargeId: "charge-1",
    placement: "top",
    weekStart: THIS_WEEK,
    spot: 1,
    pricePaise: 141_000,
    status: "awaiting_payment",
    payBy: new Date("2026-10-01T07:00:00.000Z"),
    paidAt: null,
    ...overrides,
  };
}

function lostBid(overrides: Partial<DirectoryAdBid>): DirectoryAdBid {
  return {
    id: "bid-1",
    placement: "side",
    weekStart: THIS_WEEK,
    amountPaise: 90_000,
    status: "lost",
    amountSetAt: new Date("2026-09-25T00:00:00.000Z"),
    ...overrides,
  };
}

const OPEN_WEEK = {
  weekStart: NEXT_WEEK,
  closesAt: new Date("2026-10-03T14:30:00.000Z"),
  lowerUntil: new Date("2026-10-02T14:30:00.000Z"),
  offers: [
    { placement: "top" as const, reservePaise: 99_900, totalSpots: 1, bidders: 3, myBidPaise: 180_000, openSpots: 1, bookedUntil: null },
    { placement: "side" as const, reservePaise: 49_900, totalSpots: 2, bidders: 2, myBidPaise: null, openSpots: 2, bookedUntil: null },
    { placement: "profile" as const, reservePaise: null, totalSpots: 1, bidders: 0, myBidPaise: null, openSpots: 1, bookedUntil: null },
    { placement: "home" as const, reservePaise: 150_000, totalSpots: 4, bidders: 5, myBidPaise: null, openSpots: 3, bookedUntil: null },
  ],
};

describe("weekLabel", () => {
  it("names a week the way an owner would", () => {
    expect(weekLabel(THIS_WEEK, NOW)).toBe("This week");
    expect(weekLabel(NEXT_WEEK, NOW)).toBe("Next week");
    expect(weekLabel("2026-10-12", NOW)).toBe("Week after next");
    expect(weekLabel("2026-10-19", NOW)).toBe("In 3 weeks");
  });
});

describe("marketPageHref", () => {
  it("points at the market's page on the website", () => {
    expect(marketPageHref({ categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" }, "https://brandbasket.in")).toBe(
      "https://brandbasket.in/in/mh/thane/naupada/dentists",
    );
  });
});

describe("placementPageHref", () => {
  const market = { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" };

  it("points the home spot at the home page, the list spots at the market's page, and a business page spot nowhere", () => {
    expect(placementPageHref("home", market, "https://brandbasket.in")).toBe("https://brandbasket.in/");
    expect(placementPageHref("top", market, "https://brandbasket.in")).toBe("https://brandbasket.in/in/mh/thane/naupada/dentists");
    expect(placementPageHref("side", market, "https://brandbasket.in")).toBe("https://brandbasket.in/in/mh/thane/naupada/dentists");
    expect(placementPageHref("profile", market, "https://brandbasket.in")).toBeNull();
  });
});

describe("bidPanelWeeks", () => {
  it("dates every step in Indian time and carries the price to beat", () => {
    const [week] = bidPanelWeeks({ weeks: [OPEN_WEEK], lastPrices: { weekStart: THIS_WEEK, top: [141_000], side: [61_000, 49_900], profile: [], home: [310_000, 250_000] } }, NOW);
    expect(week).toMatchObject({
      weekStart: NEXT_WEEK,
      label: "Next week",
      range: "5 – 11 Oct",
      closes: "Sat 3 Oct, 8:00 pm",
      payBy: "Sun 4 Oct, 8:00 pm",
      lowerUntil: "Fri 2 Oct, 8:00 pm",
      canLower: true,
    });
    expect(week?.offers.map((offer) => [offer.placement, offer.lastPaise])).toEqual([
      ["top", 141_000],
      ["side", 49_900],
      ["profile", null],
      ["home", 250_000],
    ]);
  });

  it("tells an owner the last day a spot is booked until, while staff hold every spot of it", () => {
    const booked = { ...OPEN_WEEK, offers: OPEN_WEEK.offers.map((offer) => (offer.placement === "home" ? { ...offer, openSpots: 0, bookedUntil: new Date("2026-12-14T18:30:00.000Z") } : offer)) };
    const [week] = bidPanelWeeks({ weeks: [booked], lastPrices: null }, NOW);
    expect(week?.offers.map((offer) => [offer.placement, offer.bookedUntil])).toEqual([
      ["top", null],
      ["side", null],
      ["profile", null],
      ["home", "Mon 14 Dec"],
    ]);
  });

  it("has no price to beat before anyone has won, and stops lowering in the last day", () => {
    const [week] = bidPanelWeeks({ weeks: [OPEN_WEEK], lastPrices: null }, new Date("2026-10-03T04:00:00.000Z"));
    expect(week?.canLower).toBe(false);
    expect(week?.offers.map((offer) => offer.lastPaise)).toEqual([null, null, null, null]);
  });
});

describe("adOutcomes", () => {
  it("puts what is owed first, soonest deadline first", () => {
    const later = win({ id: "later", payBy: new Date("2026-10-02T07:00:00.000Z") });
    const sooner = win({ id: "sooner", placement: "side", payBy: new Date("2026-10-01T07:00:00.000Z") });
    expect(adOutcomes({ wins: [later, sooner], settledBids: [], weeks: [] }, NOW).toPay.map((entry) => entry.id)).toEqual(["sooner", "later"]);
  });

  it("separates an ad showing now from one paid for a later week", () => {
    const showing = win({ id: "showing", status: "paid", paidAt: NOW });
    const booked = win({ id: "booked", status: "paid", paidAt: NOW, weekStart: NEXT_WEEK });
    const outcomes = adOutcomes({ wins: [showing, booked], settledBids: [], weeks: [] }, NOW);
    expect(outcomes.live.map((entry) => entry.id)).toEqual(["showing"]);
    expect(outcomes.upcoming.map((entry) => entry.id)).toEqual(["booked"]);
  });

  it("says why a spot was missed", () => {
    const outcomes = adOutcomes(
      {
        wins: [win({ id: "top", status: "paid", paidAt: NOW }), win({ id: "lapsed", placement: "side", status: "lapsed", weekStart: NEXT_WEEK })],
        settledBids: [lostBid({ id: "side-lost" }), lostBid({ id: "top-lost", placement: "top", weekStart: NEXT_WEEK })],
        weeks: [],
      },
      NOW,
    );
    expect(outcomes.missed).toEqual([
      { id: "lapsed", placement: "side", weekStart: NEXT_WEEK, reason: "not-paid" },
      { id: "side-lost", placement: "side", weekStart: THIS_WEEK, reason: "holds-top" },
      { id: "top-lost", placement: "top", weekStart: NEXT_WEEK, reason: "outbid" },
    ]);
  });

  it("names the soonest week with a bid in", () => {
    expect(adOutcomes({ wins: [], settledBids: [], weeks: [OPEN_WEEK] }, NOW).bidWeek).toBe(NEXT_WEEK);
    expect(adOutcomes({ wins: [], settledBids: [], weeks: [] }, NOW).bidWeek).toBeNull();
  });
});
