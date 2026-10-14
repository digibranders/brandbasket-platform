import { describe, expect, it } from "vitest";
import {
  AD_INCREMENT_PAISE,
  bidChangeRefusal,
  biddingClosesAt,
  firstPayBy,
  latestClosedWeekStart,
  lowerDeadline,
  openBiddingWeeks,
  rankBids,
  secondPriceWinners,
  weekEndsAt,
  weekStartOf,
  weekStartsAt,
  type RankableBid,
} from "./directory-ad-rules";

/** 2026-10-05 is a Monday. */
const MONDAY = "2026-10-05";

function bid(id: string, amountPaise: number, setAtIso = "2026-10-01T00:00:00.000Z"): RankableBid {
  return { id, amountPaise, amountSetAt: new Date(setAtIso) };
}

describe("week timing (Asia/Kolkata)", () => {
  it("finds the Monday of the Indian week, even when UTC is still on Sunday", () => {
    // Monday 00:10 IST is Sunday 18:40 UTC.
    expect(weekStartOf(new Date("2026-10-04T18:40:00.000Z"))).toBe(MONDAY);
    // Sunday 23:50 IST belongs to the week before.
    expect(weekStartOf(new Date("2026-10-04T18:20:00.000Z"))).toBe("2026-09-28");
    expect(weekStartOf(new Date("2026-10-11T12:00:00.000Z"))).toBe(MONDAY);
  });

  it("starts a week at Monday 00:00 IST and ends it seven days later", () => {
    expect(weekStartsAt(MONDAY).toISOString()).toBe("2026-10-04T18:30:00.000Z");
    expect(weekEndsAt(MONDAY).toISOString()).toBe("2026-10-11T18:30:00.000Z");
  });

  it("closes bidding on the Saturday before at 20:00 IST, lets bids drop until a day earlier, and asks for payment a day later", () => {
    expect(biddingClosesAt(MONDAY).toISOString()).toBe("2026-10-03T14:30:00.000Z");
    expect(lowerDeadline(MONDAY).toISOString()).toBe("2026-10-02T14:30:00.000Z");
    expect(firstPayBy(MONDAY).toISOString()).toBe("2026-10-04T14:30:00.000Z");
  });

  it("offers the next two weeks whose bidding is still open", () => {
    // Wednesday 30 Sep: next week (5 Oct) is still open.
    expect(openBiddingWeeks(new Date("2026-09-30T06:00:00.000Z"))).toEqual(["2026-10-05", "2026-10-12"]);
    // Saturday 3 Oct, 21:00 IST: bidding for 5 Oct has closed.
    expect(openBiddingWeeks(new Date("2026-10-03T15:30:00.000Z"))).toEqual(["2026-10-12", "2026-10-19"]);
  });

  it("names the latest week whose bidding has closed", () => {
    expect(latestClosedWeekStart(new Date("2026-10-03T14:29:59.000Z"))).toBe("2026-09-28");
    expect(latestClosedWeekStart(new Date("2026-10-03T14:30:00.000Z"))).toBe(MONDAY);
  });

  it("refuses a week that is not a Monday", () => {
    expect(() => weekStartsAt("2026-10-06")).toThrow(RangeError);
    expect(() => weekStartsAt("not a date")).toThrow(RangeError);
  });
});

describe("rankBids", () => {
  it("ranks by amount, then the earlier amount, then id", () => {
    const ranked = rankBids([
      bid("c", 50_000),
      bid("b", 60_000, "2026-10-02T00:00:00.000Z"),
      bid("a", 60_000, "2026-10-01T00:00:00.000Z"),
      bid("d", 50_000),
    ]);
    expect(ranked.map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("secondPriceWinners", () => {
  const reserve = 50_000;

  it("charges a lone bidder the price", () => {
    expect(secondPriceWinners([bid("a", 90_000)], 1, reserve)).toEqual([{ bidId: "a", spot: 1, pricePaise: reserve }]);
  });

  it("charges the winner the next bid plus ₹10", () => {
    const winners = secondPriceWinners(rankBids([bid("a", 90_000), bid("b", 70_000)]), 1, reserve);
    expect(winners).toEqual([{ bidId: "a", spot: 1, pricePaise: 70_000 + AD_INCREMENT_PAISE }]);
  });

  it("never charges more than the winner's own bid", () => {
    const winners = secondPriceWinners(
      rankBids([bid("a", 70_000, "2026-10-01T00:00:00.000Z"), bid("b", 70_000, "2026-10-02T00:00:00.000Z")]),
      1,
      reserve,
    );
    expect(winners).toEqual([{ bidId: "a", spot: 1, pricePaise: 70_000 }]);
  });

  it("fills two spots, each paying the bid below it, the last paying the price", () => {
    const winners = secondPriceWinners(rankBids([bid("a", 90_000), bid("b", 80_000), bid("c", 60_000)]), 2, reserve);
    expect(winners).toEqual([
      { bidId: "a", spot: 1, pricePaise: 81_000 },
      { bidId: "b", spot: 2, pricePaise: 61_000 },
    ]);
    const two = secondPriceWinners(rankBids([bid("a", 90_000), bid("b", 80_000)]), 2, reserve);
    expect(two[1]).toEqual({ bidId: "b", spot: 2, pricePaise: reserve });
  });

  it("returns nobody when there are no bids", () => {
    expect(secondPriceWinners([], 2, reserve)).toEqual([]);
  });
});

describe("bidChangeRefusal", () => {
  const wednesday = new Date("2026-09-30T06:00:00.000Z");
  const saturdayMorning = new Date("2026-10-03T04:00:00.000Z");
  const base = { weekStart: MONDAY, reservePaise: 50_000, now: wednesday, currentPaise: null } as const;

  it("accepts a whole-rupee bid at or above the price for an open week", () => {
    expect(bidChangeRefusal({ ...base, amountPaise: 50_000 })).toBeNull();
  });

  it("refuses bids below the price, above the cap, or with paise", () => {
    expect(bidChangeRefusal({ ...base, amountPaise: 49_900 })).toBe("below-price");
    expect(bidChangeRefusal({ ...base, amountPaise: 10_000_100 })).toBe("above-max");
    expect(bidChangeRefusal({ ...base, amountPaise: 50_050 })).toBe("not-whole-rupees");
  });

  it("refuses a week whose bidding has closed or is not open yet", () => {
    expect(bidChangeRefusal({ ...base, amountPaise: 60_000, now: new Date("2026-10-03T15:00:00.000Z") })).toBe("closed");
    expect(bidChangeRefusal({ ...base, weekStart: "2026-10-26", amountPaise: 60_000 })).toBe("closed");
  });

  it("lets a bid rise at any time before the close but only fall or be withdrawn until a day before", () => {
    expect(bidChangeRefusal({ ...base, now: saturdayMorning, currentPaise: 60_000, amountPaise: 70_000 })).toBeNull();
    expect(bidChangeRefusal({ ...base, now: saturdayMorning, currentPaise: 60_000, amountPaise: 55_000 })).toBe("too-late-to-lower");
    expect(bidChangeRefusal({ ...base, now: saturdayMorning, currentPaise: 60_000, amountPaise: null })).toBe("too-late-to-lower");
    expect(bidChangeRefusal({ ...base, currentPaise: 60_000, amountPaise: null })).toBeNull();
  });
});
