/**
 * The directory contract (lib/directory-api.ts, copied byte for byte into the website) cannot import from the
 * packages, and packages/db and packages/shared cannot import from the apps, so the highlight list and the limits are
 * written in each place. These checks keep the copies in step: the database's CHECK and tie-break order, the staff
 * console's labels, the ratings key limit, and the Trending tag's event kinds and rule.
 */
import {
  DIRECTORY_AD_EVENT_KINDS as DB_DIRECTORY_AD_EVENT_KINDS,
  DIRECTORY_COMMENTS_SHOWN_PER_REVIEW,
  DIRECTORY_AD_PLACEMENTS as DB_DIRECTORY_AD_PLACEMENTS,
  DIRECTORY_AD_SPOTS,
  DIRECTORY_EVENT_KINDS as DB_DIRECTORY_EVENT_KINDS,
  DIRECTORY_PAID_TAG_IDS,
  DIRECTORY_PROMOTION_DAYS,
  DIRECTORY_REVIEW_HIGHLIGHT_IDS,
  DIRECTORY_TRENDING_CONTACT_WEIGHT,
  DIRECTORY_TRENDING_MIN_GROWTH,
  DIRECTORY_TRENDING_MIN_SCORE,
  HOME_AD_SCOPE_SLUG,
  isPlaceId,
  MAX_DIRECTORY_RATING_KEYS,
  MAX_DIRECTORY_SIGNAL_KEYS,
  newPlatformPlaceId,
  PLACE_ID_ALPHABET,
} from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { DIRECTORY_HIGHLIGHT_LABELS, directoryHighlightLabel } from "@firstfold/shared/lib/directory-highlights";
import {
  PROMOTION_DAYS,
  PROMOTION_MARKER,
  PROMOTION_TAG_LABELS,
  PROMOTION_TAGS,
} from "@firstfold/shared/lib/directory/promotion";
import {
  COMMENTS_SHOWN_PER_REVIEW,
  DIRECTORY_AD_EVENT_KINDS,
  DIRECTORY_AD_PLACEMENTS,
  DIRECTORY_EVENT_KINDS,
  DIRECTORY_HOME_AD_SPOTS,
  DIRECTORY_SIDE_AD_SPOTS,
  HOME_AD_MARKET_SLUG,
  MAX_RATING_KEYS,
  PAID_TAG_IDS,
  PAID_TAG_MARKER,
  PAID_TAGS,
  PLACE_ID_PATTERN,
  REVIEW_HIGHLIGHTS,
  TRENDING_CONTACT_WEIGHT,
  TRENDING_MIN_GROWTH,
  TRENDING_MIN_SCORE,
} from "./directory-api";

describe("directory contract parity", () => {
  it("lists the same highlight ids, in the same order, as the database", () => {
    expect(REVIEW_HIGHLIGHTS.map((highlight) => highlight.id)).toEqual([...DIRECTORY_REVIEW_HIGHLIGHT_IDS]);
  });

  it("gives the staff console the same labels as the website", () => {
    expect(DIRECTORY_HIGHLIGHT_LABELS).toEqual(
      Object.fromEntries(REVIEW_HIGHLIGHTS.map((highlight) => [highlight.id, highlight.label])),
    );
    expect(directoryHighlightLabel("constructor")).toBe("constructor");
  });

  it("allows the same number of listing keys per ratings request", () => {
    expect(MAX_DIRECTORY_RATING_KEYS).toBe(MAX_RATING_KEYS);
  });

  it("shows as many comments under a review as the database reads", () => {
    expect(COMMENTS_SHOWN_PER_REVIEW).toBe(DIRECTORY_COMMENTS_SHOWN_PER_REVIEW);
  });

  it("counts the same event kinds as the database", () => {
    expect([...DIRECTORY_EVENT_KINDS]).toEqual([...DB_DIRECTORY_EVENT_KINDS]);
  });

  it("places and counts ads by the same placements, kinds and spots as the database", () => {
    expect([...DIRECTORY_AD_PLACEMENTS]).toEqual([...DB_DIRECTORY_AD_PLACEMENTS]);
    expect([...DIRECTORY_AD_EVENT_KINDS]).toEqual([...DB_DIRECTORY_AD_EVENT_KINDS]);
    expect(DIRECTORY_HOME_AD_SPOTS).toBe(DIRECTORY_AD_SPOTS.home);
    expect(DIRECTORY_SIDE_AD_SPOTS).toBe(DIRECTORY_AD_SPOTS.side);
    expect(HOME_AD_MARKET_SLUG).toBe(HOME_AD_SCOPE_SLUG);
  });

  it("scores Trending by the same rule, over the same number of keys, as the database", () => {
    expect(DIRECTORY_TRENDING_MIN_SCORE).toBe(TRENDING_MIN_SCORE);
    expect(DIRECTORY_TRENDING_MIN_GROWTH).toBe(TRENDING_MIN_GROWTH);
    expect(DIRECTORY_TRENDING_CONTACT_WEIGHT).toBe(TRENDING_CONTACT_WEIGHT);
    expect(MAX_DIRECTORY_SIGNAL_KEYS).toBe(MAX_RATING_KEYS);
  });

  it("sells the same paid tags, labels and Ad marker as the website shows", () => {
    expect([...PAID_TAG_IDS]).toEqual([...DIRECTORY_PAID_TAG_IDS]);
    expect(PROMOTION_TAGS.map((tag) => tag.id)).toEqual([...PAID_TAG_IDS]);
    expect(PROMOTION_TAG_LABELS).toEqual(Object.fromEntries(PAID_TAGS.map((tag) => [tag.id, tag.label])));
    expect(PROMOTION_TAGS.map((tag) => tag.label)).toEqual(PAID_TAGS.map((tag) => tag.label));
    expect(PROMOTION_MARKER).toBe(PAID_TAG_MARKER);
    expect(PROMOTION_DAYS).toBe(DIRECTORY_PROMOTION_DAYS);
  });

  it("accepts exactly the place ids the database issues", () => {
    const samples = [
      "k7m2q9a",
      "b3cdefg",
      "2bcdefg",
      "abcdefg",
      "k7m2q9",
      "k7m2q9ab",
      "K7M2Q9A",
      "k7m2q9o",
      "k7m2q9l",
      "k7m2q91",
      "k7m-q9a",
      "",
      ...Array.from({ length: 50 }, () => newPlatformPlaceId()),
      ...[...PLACE_ID_ALPHABET].map((letter) => `${letter}${letter}${letter}${letter}${letter}${letter}${letter}`),
    ];
    for (const sample of samples) expect(PLACE_ID_PATTERN.test(sample), sample).toBe(isPlaceId(sample));
  });
});
