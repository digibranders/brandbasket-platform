import { describe, expect, it } from "vitest";
import { readPersonProfileLink, readProfileLink } from "./profile-link";

describe("readProfileLink, Instagram", () => {
  it("cleans a profile link and reads the account name", () => {
    expect(readProfileLink("instagram", "https://www.instagram.com/acme_foods/?utm_source=ig_web&igsh=abc")).toEqual({ ok: true, url: "https://www.instagram.com/acme_foods", handle: "acme_foods" });
    expect(readProfileLink("instagram", " instagram.com/Acme.Foods ")).toEqual({ ok: true, url: "https://www.instagram.com/Acme.Foods", handle: "Acme.Foods" });
    expect(readProfileLink("instagram", "m.instagram.com/acme_foods")).toMatchObject({ ok: true, handle: "acme_foods" });
  });

  it("refuses a post, a reel, the explore page and a deeper path", () => {
    for (const link of ["instagram.com/p/Cxyz123", "https://www.instagram.com/reel/abc/", "instagram.com/explore", "instagram.com/acme_foods/tagged"]) {
      expect(readProfileLink("instagram", link)).toMatchObject({ ok: false });
    }
  });

  it("refuses another site, a plain word, other schemes and the home page", () => {
    for (const link of ["facebook.com/acmefoods", "acme foods", "javascript:alert(1)", "", "https://instagram.com/", "instagram.com.evil.test/acme"]) {
      expect(readProfileLink("instagram", link)).toMatchObject({ ok: false });
    }
  });

  it("refuses a name Instagram does not allow", () => {
    expect(readProfileLink("instagram", "instagram.com/a name!")).toMatchObject({ ok: false });
    expect(readProfileLink("instagram", `instagram.com/${"a".repeat(31)}`)).toMatchObject({ ok: false });
  });
});

describe("readProfileLink, Facebook", () => {
  it("cleans a page link, the address with an id, and the m. and fb.com forms", () => {
    expect(readProfileLink("facebook", "https://www.facebook.com/acmefoods?mibextid=x")).toEqual({ ok: true, url: "https://www.facebook.com/acmefoods", handle: "acmefoods" });
    expect(readProfileLink("facebook", "facebook.com/profile.php?id=100012345678901")).toEqual({ ok: true, url: "https://www.facebook.com/profile.php?id=100012345678901", handle: "100012345678901" });
    expect(readProfileLink("facebook", "fb.com/acmefoods")).toMatchObject({ ok: true, handle: "acmefoods" });
  });

  it("refuses a share link, a reel, a group and a profile.php with no id", () => {
    for (const link of ["facebook.com/share/abc", "facebook.com/acmefoods/reel/123", "facebook.com/groups/acme", "facebook.com/profile.php", "facebook.com/watch"]) {
      expect(readProfileLink("facebook", link)).toMatchObject({ ok: false });
    }
  });

  it("refuses another site and the home page", () => {
    expect(readProfileLink("facebook", "instagram.com/acmefoods")).toMatchObject({ ok: false });
    expect(readProfileLink("facebook", "https://facebook.com/")).toMatchObject({ ok: false });
  });
});

describe("readPersonProfileLink", () => {
  it("reads a personal profile link and speaks of the person, not the page", () => {
    expect(readPersonProfileLink("https://www.facebook.com/asha.mehta?mibextid=x")).toEqual({ ok: true, url: "https://www.facebook.com/asha.mehta", handle: "asha.mehta" });
    expect(readPersonProfileLink("instagram.com/asha")).toMatchObject({ ok: false, message: expect.stringContaining("your own Facebook profile") });
    expect(readPersonProfileLink("facebook.com/share/abc")).toMatchObject({ ok: false, message: expect.stringContaining("own profile") });
  });
});
