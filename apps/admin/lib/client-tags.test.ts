import { describe, expect, it } from "vitest";
import {
  CLIENT_TAG_NOTICE_KEYS,
  CLIENT_TAG_NOTICES,
  clientListingKey,
  clientTagsHref,
  readClientTagNotice,
} from "./client-tags";

describe("clientListingKey", () => {
  it("joins category, city, area and name the way the directory keys a listing", () => {
    expect(clientListingKey({ categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", slug: "smile-dental" })).toBe(
      "dentists/thane/naupada/smile-dental",
    );
  });
});

describe("readClientTagNotice", () => {
  it("only knows the fixed notices", () => {
    expect(readClientTagNotice("trusted")).toBe("trusted");
    expect(readClientTagNotice(["untrusted", "trusted"])).toBe("untrusted");
    expect(readClientTagNotice("constructor")).toBeNull();
    expect(readClientTagNotice(undefined)).toBeNull();
  });

  it("has a message for every notice, and says plainly when nothing happened", () => {
    for (const key of CLIENT_TAG_NOTICE_KEYS) expect(CLIENT_TAG_NOTICES[key].text.length).toBeGreaterThan(10);
    expect(CLIENT_TAG_NOTICES.unchanged.ok).toBe(false);
    expect(CLIENT_TAG_NOTICES.no_listing.ok).toBe(false);
  });
});

describe("clientTagsHref", () => {
  it("returns to the client's Listing section with the notice", () => {
    expect(clientTagsHref("0192f3c4-0000-7000-8000-000000000001", "trusted")).toBe(
      "/clients/0192f3c4-0000-7000-8000-000000000001?tags=trusted#listing",
    );
  });
});
