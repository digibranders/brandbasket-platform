import { describe, expect, it } from "vitest";
import { parseListingWebsite } from "./listing-website";

describe("parseListingWebsite", () => {
  it.each([
    ["sunrisebakery.in", "https://sunrisebakery.in/"],
    ["  www.sunrisebakery.in/menu  ", "https://www.sunrisebakery.in/menu"],
    ["http://sunrisebakery.in", "http://sunrisebakery.in/"],
    ["HTTPS://SunriseBakery.in/Cakes?x=1", "https://sunrisebakery.in/Cakes?x=1"],
  ])("reads %j as %s", (typed, url) => {
    expect(parseListingWebsite(typed)).toEqual({ ok: true, url });
  });

  it("clears the website when the box is emptied", () => {
    expect(parseListingWebsite("   ")).toEqual({ ok: true, url: null });
  });

  it.each([
    "javascript:alert(1)",
    "mailto:me@sunrisebakery.in",
    "ftp://sunrisebakery.in",
    "sunrise bakery.in",
    "localhost",
    "sunrisebakery",
    "https://firstfold.io@evil.example",
    "https://",
  ])("refuses %j", (typed) => {
    expect(parseListingWebsite(typed).ok).toBe(false);
  });

  it("refuses an address too long to store", () => {
    expect(parseListingWebsite(`sunrisebakery.in/${"a".repeat(300)}`)).toEqual({ ok: false, message: "That address is too long." });
  });
});
