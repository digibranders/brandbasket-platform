import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUSINESS_URL_CODE_LENGTH,
  INTERIM_DIRECTORY_URL_KEY,
  PLACE_ID_ALPHABET,
  PLACE_URL_SLUG_MAX,
  businessPagePathParts,
  businessUrlCode,
  businessUrlCodeWith,
  directoryUrlKeyFrom,
  isBusinessUrlCode,
  isPlaceCitySlug,
  isPlaceId,
  isPlaceUrlChangeReason,
  isPlaceUrlSlug,
  isPlatformPlaceId,
  newPlatformPlaceId,
  placeUrlPath,
  toPlaceUrlSlug,
} from "./place-id";

describe("place ids", () => {
  it("uses 31 characters with no 0, o, 1, l or i", () => {
    expect(PLACE_ID_ALPHABET).toHaveLength(31);
    expect(PLACE_ID_ALPHABET).not.toMatch(/[01ilo]/);
  });

  it("accepts 7 characters from the alphabet with at least one digit", () => {
    expect(isPlaceId("k7m2q9a")).toBe(true);
    expect(isPlaceId("2bcdefg")).toBe(true);
    expect(isPlaceId("abcdefg")).toBe(false); // no digit
    expect(isPlaceId("k7m2q9")).toBe(false); // 6 long
    expect(isPlaceId("k7m2q9o")).toBe(false); // "o" is not in the alphabet
    expect(isPlaceId("K7M2Q9A")).toBe(false); // lowercase only
    expect(isPlaceId("naupada")).toBe(false);
  });

  it("makes platform ids that start with a digit and are valid", () => {
    for (let n = 0; n < 2000; n += 1) {
      const id = newPlatformPlaceId();
      expect(isPlaceId(id)).toBe(true);
      expect(isPlatformPlaceId(id)).toBe(true);
    }
  });

  it("tells open-data ids (letter first) from platform ids (digit first)", () => {
    expect(isPlatformPlaceId("k7m2q9a")).toBe(false);
    expect(isPlatformPlaceId("7km2q9a")).toBe(true);
  });

  it("rejects non-platform shapes even when the first character is a digit", () => {
    expect(isPlatformPlaceId("7km2q9o")).toBe(false); // "o" is not in the alphabet
    expect(isPlatformPlaceId("")).toBe(false);
  });

  it("draws a digit first and only alphabet characters after, across 5000 ids", () => {
    for (let n = 0; n < 5000; n += 1) {
      const id = newPlatformPlaceId();
      expect("23456789").toContain(id.charAt(0));
      for (const char of id) expect(PLACE_ID_ALPHABET).toContain(char);
    }
  });

  it("2000 ids are distinct", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newPlatformPlaceId()));
    expect(ids.size).toBe(2000);
  });
});

describe("place URL labels", () => {
  it("accepts a kebab-case name part of at most 70 characters", () => {
    expect(PLACE_URL_SLUG_MAX).toBe(70);
    expect(isPlaceUrlSlug("smile-dental")).toBe(true);
    expect(isPlaceUrlSlug("a".repeat(70))).toBe(true);
    expect(isPlaceUrlSlug("a".repeat(71))).toBe(false);
    expect(isPlaceUrlSlug("Smile-Dental")).toBe(false);
    expect(isPlaceUrlSlug("smile--dental")).toBe(false);
    expect(isPlaceUrlSlug("-smile")).toBe(false);
    expect(isPlaceUrlSlug("")).toBe(false);
  });

  it("accepts a kebab-case city", () => {
    expect(isPlaceCitySlug("mira-bhayander")).toBe(true);
    expect(isPlaceCitySlug("Thane")).toBe(false);
    expect(isPlaceCitySlug("thane/naupada")).toBe(false);
  });

  it("wants a URL change reason of 3 to 300 characters that is not just spaces", () => {
    expect(isPlaceUrlChangeReason("Rebranded")).toBe(true);
    expect(isPlaceUrlChangeReason("abc")).toBe(true);
    expect(isPlaceUrlChangeReason("ab")).toBe(false);
    expect(isPlaceUrlChangeReason("   ")).toBe(false);
    expect(isPlaceUrlChangeReason("x".repeat(300))).toBe(true);
    expect(isPlaceUrlChangeReason("x".repeat(301))).toBe(false);
  });

  it("counts a URL change reason in characters, as Postgres char_length does, not UTF-16 units", () => {
    // Each emoji is one character but two UTF-16 units.
    expect(isPlaceUrlChangeReason("🙂🙂")).toBe(false);
    expect(isPlaceUrlChangeReason("🙂🙂🙂")).toBe(true);
    expect(isPlaceUrlChangeReason("🙂".repeat(300))).toBe(true);
    expect(isPlaceUrlChangeReason("🙂".repeat(301))).toBe(false);
  });
});

describe("a business's URL", () => {
  it("cuts a listing slug to the URL's name part without leaving a trailing hyphen", () => {
    expect(toPlaceUrlSlug("smile-dental")).toBe("smile-dental");
    expect(toPlaceUrlSlug(`${"a".repeat(69)}-bcd`)).toBe("a".repeat(69));
    expect(toPlaceUrlSlug("b".repeat(80))).toBe("b".repeat(70));
    expect(isPlaceUrlSlug(toPlaceUrlSlug(`${"word-".repeat(20)}end`))).toBe(true);
  });

});

describe("business URL codes", () => {
  // The website's vectors (website-listing lib/business-url-code.test.ts): both must build the same URLs.
  const TEST_KEY = "test-key-never-used-in-production";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches the website's code for the same key and id", () => {
    expect(businessUrlCodeWith(TEST_KEY, "k7m2q9a")).toBe("9f94ykmdjp");
    // Exercises the rejection of digest bytes at or above 248.
    expect(businessUrlCodeWith(TEST_KEY, "a2345bc")).toBe("pe42qzwh4p");
  });

  it("is ten characters of the place-id alphabet, and differs from the id", () => {
    const code = businessUrlCodeWith(TEST_KEY, "k7m2q9a");
    expect(code).toHaveLength(BUSINESS_URL_CODE_LENGTH);
    expect([...code].every((char) => PLACE_ID_ALPHABET.includes(char))).toBe(true);
    expect(isBusinessUrlCode(code)).toBe(true);
    expect(isBusinessUrlCode("k7m2q9a")).toBe(false);
  });

  it("uses the website's interim key until DIRECTORY_URL_KEY is set, and refuses a short one", () => {
    expect(directoryUrlKeyFrom({})).toBe(INTERIM_DIRECTORY_URL_KEY);
    expect(directoryUrlKeyFrom({ DIRECTORY_URL_KEY: "   " })).toBe(INTERIM_DIRECTORY_URL_KEY);
    expect(directoryUrlKeyFrom({ DIRECTORY_URL_KEY: "k".repeat(32) })).toBe("k".repeat(32));
    expect(() => directoryUrlKeyFrom({ DIRECTORY_URL_KEY: "too-short" })).toThrow(/shorter than 32/);
  });

  it("builds /in/<state>/business/<name>/<code> with this process's key", () => {
    vi.stubEnv("DIRECTORY_URL_KEY", TEST_KEY.padEnd(32, "-"));
    const code = businessUrlCode("k7m2q9a");
    expect(code).toBe(businessUrlCodeWith(TEST_KEY.padEnd(32, "-"), "k7m2q9a"));
    expect(placeUrlPath({ id: "k7m2q9a", stateCode: "mh", urlSlug: "smile-dental" })).toBe(`/in/mh/business/smile-dental/${code}`);
  });

  it("reads a business page's name and code from its path, and nothing else", () => {
    expect(businessPagePathParts("/in/mh/business/smile-dental/9f94ykmdjp")).toEqual({ urlSlug: "smile-dental", code: "9f94ykmdjp" });
    expect(businessPagePathParts("in/mh/business/smile-dental/9f94ykmdjp/")).toEqual({ urlSlug: "smile-dental", code: "9f94ykmdjp" });
    expect(businessPagePathParts("/in/mh/thane/business/smile-dental/k7m2q9a")).toBeNull();
    expect(businessPagePathParts("/in/mh/business/smile-dental/k7m2q9a")).toBeNull();
    expect(businessPagePathParts("/in/mh/thane/naupada/dentists")).toBeNull();
  });
});
