import { describe, expect, it } from "vitest";
import type { DirectoryPaidTag } from "@brandbasket/db";
import { formatMoney } from "../money";
import {
  formatPromotionDay,
  parsePromotionTag,
  PROMOTION_CURRENCY,
  PROMOTION_TAG_LABELS,
  PROMOTION_TAGS,
  PROMOTION_TAX_BASIS_POINTS,
  PROMOTION_WEEK_CHARGED_PAISE,
  PROMOTION_WEEK_PRICE_PAISE,
  PROMOTION_WEEK_TAX_PAISE,
  promotionChargeDescription,
  promotionStatus,
  promotionTagDisplay,
} from "./promotion";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-01T06:30:00.000Z");

function week(tag: DirectoryPaidTag, startsAt: Date, visible = true) {
  return { tag, startsAt, endsAt: new Date(startsAt.getTime() + 7 * DAY_MS), visible };
}

describe("the week's price", () => {
  it("is ₹299 with the 18% GST inside it: ₹299 charged, ₹45.62 of it tax", () => {
    expect(PROMOTION_WEEK_PRICE_PAISE).toBe(29_900);
    expect(PROMOTION_TAX_BASIS_POINTS).toBe(1_800);
    expect(PROMOTION_WEEK_CHARGED_PAISE).toBe(29_900);
    expect(PROMOTION_WEEK_TAX_PAISE).toBe(4_562);
    expect(formatMoney(PROMOTION_WEEK_CHARGED_PAISE, PROMOTION_CURRENCY)).toBe("₹299");
    expect(formatMoney(PROMOTION_WEEK_TAX_PAISE, PROMOTION_CURRENCY)).toBe("₹45.62");
  });
});

describe("tag wording", () => {
  it("labels every tag, in the order the page offers them", () => {
    expect(PROMOTION_TAGS.map((tag) => tag.id)).toEqual(["hot_new", "most_searched", "popular_near_you"]);
    for (const tag of PROMOTION_TAGS) expect(PROMOTION_TAG_LABELS[tag.id]).toBe(tag.label);
  });

  it("always shows the Ad marker, and names the charge by its tag and length", () => {
    expect(promotionTagDisplay("hot_new")).toBe("Hot & New");
    expect(promotionChargeDescription("popular_near_you")).toBe("Popular Near You listing tag, 7 days");
  });

  it("reads only the three tag ids from a form", () => {
    expect(parsePromotionTag("most_searched")).toBe("most_searched");
    expect(parsePromotionTag("featured_gold")).toBeNull();
    expect(parsePromotionTag("")).toBeNull();
    expect(parsePromotionTag(null)).toBeNull();
    expect(parsePromotionTag(new File([], "hot_new"))).toBeNull();
  });

  it("writes the end day in Asia/Kolkata", () => {
    // 20:00 UTC on 5 October is already 6 October in India.
    expect(formatPromotionDay(new Date("2026-10-05T20:00:00.000Z"))).toBe("6 Oct");
  });
});

describe("promotionStatus", () => {
  it("offers a choice when nothing is running", () => {
    expect(promotionStatus([], NOW)).toEqual({
      running: null,
      booked: null,
      endsAt: null,
      daysLeft: 0,
      visible: true,
      remind: false,
      canRenew: false,
    });
  });

  it("shows a week just bought with seven days left and no reminder", () => {
    const running = week("hot_new", NOW);
    const status = promotionStatus([running], NOW);
    expect(status.running).toBe(running);
    expect(status.endsAt).toEqual(running.endsAt);
    expect(status.daysLeft).toBe(7);
    expect(status.remind).toBe(false);
    expect(status.canRenew).toBe(true);
  });

  it("reminds once two days or fewer are left", () => {
    const running = week("most_searched", new Date(NOW.getTime() - 5 * DAY_MS));
    const status = promotionStatus([running], NOW);
    expect(status.daysLeft).toBe(2);
    expect(status.remind).toBe(true);

    const earlier = promotionStatus([running], new Date(NOW.getTime() - DAY_MS));
    expect(earlier.daysLeft).toBe(3);
    expect(earlier.remind).toBe(false);
  });

  it("runs to the end of a booked renewal, without a reminder or another renewal", () => {
    const running = week("hot_new", new Date(NOW.getTime() - 6 * DAY_MS));
    const booked = week("hot_new", running.endsAt);
    const status = promotionStatus([running, booked], NOW);
    expect(status.running).toBe(running);
    expect(status.booked).toBe(booked);
    expect(status.endsAt).toEqual(booked.endsAt);
    expect(status.daysLeft).toBe(8);
    expect(status.remind).toBe(false);
    expect(status.canRenew).toBe(false);
  });

  it("reports the switch from the running week", () => {
    expect(promotionStatus([week("popular_near_you", NOW, false)], NOW).visible).toBe(false);
  });
});
