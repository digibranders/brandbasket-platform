import { homeMarket, type DirectoryAdPrice, type DirectoryAdSpotPrice } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { buildPriceBoard, HOME_PRICE_SCOPE, openCategoryCount } from "./ad-prices";

const UPDATED = new Date("2026-10-07T00:00:00Z");
const CATEGORIES = [
  { slug: "dentists", label: "Dentists" },
  { slug: "gyms", label: "Gyms" },
] as const;

describe("HOME_PRICE_SCOPE", () => {
  it("is the slug the database keeps a home page auction under", () => {
    expect(HOME_PRICE_SCOPE).toBe(homeMarket("thane").categorySlug);
  });
});

describe("buildPriceBoard", () => {
  it("reads a placement with no price as closed, per category", () => {
    const list: DirectoryAdPrice[] = [{ categorySlug: "dentists", topWeekPaise: 99_900, sideWeekPaise: 49_900, updatedAt: UPDATED }];
    const spots: DirectoryAdSpotPrice[] = [{ scopeSlug: "gyms", placement: "profile", weekPaise: 29_900, updatedAt: UPDATED }];
    const board = buildPriceBoard(CATEGORIES, list, spots);
    expect(board.homeWeekPaise).toBeNull();
    expect(board.rows).toEqual([
      { categorySlug: "dentists", label: "Dentists", topWeekPaise: 99_900, sideWeekPaise: 49_900, profileWeekPaise: null },
      { categorySlug: "gyms", label: "Gyms", topWeekPaise: null, sideWeekPaise: null, profileWeekPaise: 29_900 },
    ]);
    expect(openCategoryCount(board)).toBe(2);
  });

  it("keeps the home page's price apart from any category's", () => {
    const board = buildPriceBoard(CATEGORIES, [], [{ scopeSlug: HOME_PRICE_SCOPE, placement: "home", weekPaise: 500_000, updatedAt: UPDATED }]);
    expect(board.homeWeekPaise).toBe(500_000);
    expect(board.rows.every((row) => row.profileWeekPaise === null)).toBe(true);
    expect(openCategoryCount(board)).toBe(0);
  });
});
