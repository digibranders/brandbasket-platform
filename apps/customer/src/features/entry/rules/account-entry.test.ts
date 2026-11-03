import { describe, expect, it } from "vitest";
import { readEntryRequest, signUpHrefForJoin, signUpHrefFromLogin } from "./account-entry";

describe("readEntryRequest", () => {
  it("opens Sign in by default, and Create account with the plan the link names", () => {
    expect(readEntryRequest({})).toEqual({ view: "sign-in", choice: null, services: ["managed-website"] });
    expect(readEntryRequest({ notice: "password-changed" }).view).toBe("sign-in");
    expect(readEntryRequest({ plan: "managed" })).toEqual({ view: "create", choice: "managed", services: ["managed-website"] });
    expect(readEntryRequest({ new: "1" })).toEqual({ view: "create", choice: null, services: ["managed-website"] });
  });

  it("never lets the address choose the free listing: plan=free and plans it does not know create an account with no plan named", () => {
    for (const plan of ["free", "listing_only", "gold", "own_website", "care", "premium"]) {
      expect(readEntryRequest({ plan }), plan).toEqual({ view: "create", choice: null, services: ["managed-website"] });
    }
  });

  it("reads a repeated parameter as absent", () => {
    expect(readEntryRequest({ new: ["1", "1"], plan: ["managed"] })).toEqual({ view: "sign-in", choice: null, services: ["managed-website"] });
  });

  it("no longer reads a directory claim link at all: it opens Sign in", () => {
    expect(readEntryRequest({ listing: "dentists/thane/naupada/smile-dental", name: "Smile Dental", sig: "abc", claim: "1" }).view).toBe("sign-in");
  });

  it("reads an ad's start token or older addons as a sign-up link", () => {
    expect(readEntryRequest({ start: "abc" }).view).toBe("create");
    expect(readEntryRequest({ addons: "local-seo-aeo" }).view).toBe("create");
  });
});

describe("the basket the website's link carries", () => {
  it("reads the website's services from the plan the link names, in the catalogue's order", () => {
    expect(readEntryRequest({ plan: "website,growth" }).services).toEqual(["managed-website", "digital-growth"]);
    expect(readEntryRequest({ plan: "search,growth" }).services).toEqual(["digital-growth", "local-seo-aeo"]);
    expect(readEntryRequest({ plan: "growth,search,website" }).services).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
  });

  it("ignores spaces and capitals around each service the link names", () => {
    expect(readEntryRequest({ plan: "website, growth" }).services).toEqual(["managed-website", "digital-growth"]);
    expect(readEntryRequest({ plan: " Search ,GROWTH " }).services).toEqual(["digital-growth", "local-seo-aeo"]);
    expect(readEntryRequest({ plan: "website, growth" })).toMatchObject({ view: "create", choice: "managed" });
  });

  it("sells the website alone when the link names nothing it knows, or nothing at all", () => {
    expect(readEntryRequest({ plan: "nonsense" }).services).toEqual(["managed-website"]);
    expect(readEntryRequest({ plan: "constructor,toString" }).services).toEqual(["managed-website"]);
    expect(readEntryRequest({}).services).toEqual(["managed-website"]);
  });

  it("still reads the older link: the website, plus the add-ons it lists, catalogue ids only", () => {
    expect(readEntryRequest({ plan: "managed", addons: "local-seo-aeo,nonsense,digital-growth" }).services).toEqual([
      "managed-website",
      "digital-growth",
      "local-seo-aeo",
    ]);
    expect(readEntryRequest({ plan: "managed", addons: ["local-seo-aeo"] }).services).toEqual(["managed-website", "local-seo-aeo"]);
    expect(readEntryRequest({ plan: "managed", addons: "social-media,advertising" }).services).toEqual(["managed-website"]);
  });
});

describe("signUpHrefFromLogin", () => {
  it("leaves a sign-in address alone", () => {
    expect(signUpHrefFromLogin({})).toBeNull();
    expect(signUpHrefFromLogin({ notice: "account-closed" })).toBeNull();
  });

  it("sends a sign-up link to /signup with its parameters, dropping new=1", () => {
    expect(signUpHrefFromLogin({ new: "1" })).toBe("/signup");
    expect(signUpHrefFromLogin({ new: "1", plan: "website,growth", start: "tok" })).toBe("/signup?plan=website%2Cgrowth&start=tok");
    expect(signUpHrefFromLogin({ plan: "managed", addons: ["local-seo-aeo", "digital-growth"] })).toBe("/signup?plan=managed&addons=local-seo-aeo&addons=digital-growth");
  });
});

describe("signUpHrefForJoin", () => {
  it("sends a bare /join to /signup", () => {
    expect(signUpHrefForJoin({})).toBe("/signup");
  });

  it("keeps every parameter", () => {
    expect(signUpHrefForJoin({ plan: "managed", utm_source: "website" })).toBe("/signup?plan=managed&utm_source=website");
  });
});
