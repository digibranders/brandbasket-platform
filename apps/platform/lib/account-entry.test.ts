import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
import { CREATE_ACCOUNT_HREF, entryHrefForJoin, entryHrefForPlan, readEntryRequest as readFor } from "./account-entry";

type Params = Parameters<typeof readFor>[0];

/** The reading under a brand that sells the free listing, which is the one the tests until the Brandbasket block were written against. */
const readEntryRequest = (params: Params): ReturnType<typeof readFor> => readFor(params, LISTING_BRAND);

describe("readEntryRequest", () => {
  it("opens on Sign in by default", () => {
    expect(readEntryRequest({})).toEqual({ view: "sign-in", choice: null, preselected: null, addOns: [] });
    expect(readEntryRequest({ notice: "password-changed" }).view).toBe("sign-in");
  });

  it("opens on Create account when the address asks for it", () => {
    expect(readEntryRequest({ new: "1" })).toEqual({ view: "create", choice: null, preselected: null, addOns: [] });
  });

  it("opens Create account with Managed Website already chosen from the website's plan button", () => {
    expect(readEntryRequest({ plan: "managed" })).toEqual({ view: "create", choice: "managed", preselected: null, addOns: [] });
  });

  it("reads the retired plan names care and premium like any other plan it does not know", () => {
    for (const plan of ["care", "premium"]) {
      expect(readEntryRequest({ new: "1", plan }), plan).toEqual({ view: "create", choice: null, preselected: null, addOns: [] });
      expect(readEntryRequest({ plan }).view, plan).toBe("sign-in");
    }
  });

  it("reads plan=free as the free listing, and still reads the database's own word", () => {
    expect(readEntryRequest({ new: "1", plan: "free" })).toEqual({ view: "create", choice: "listing_only", preselected: null, addOns: [] });
    expect(readEntryRequest({ plan: "listing_only" }).choice).toBe("listing_only");
  });

  it("writes the address for a continued plan, and drops the plan on going back", () => {
    expect(entryHrefForPlan("?new=1", "listing_only")).toBe("/login?new=1&plan=free");
    expect(entryHrefForPlan("", "managed")).toBe("/login?new=1&plan=managed");
    expect(entryHrefForPlan("?new=1&plan=free&utm_source=website", "managed")).toBe("/login?new=1&plan=managed&utm_source=website");
    expect(entryHrefForPlan("?new=1&plan=managed", null)).toBe("/login?new=1");
  });

  it("ignores a plan it does not know, and asks the question", () => {
    expect(readEntryRequest({ new: "1", plan: "gold" })).toEqual({ view: "create", choice: null, preselected: null, addOns: [] });
    expect(readEntryRequest({ plan: "gold" }).view).toBe("sign-in");
  });

  it("reads a repeated parameter as absent", () => {
    expect(readEntryRequest({ new: ["1", "1"], plan: ["managed"] })).toEqual({ view: "sign-in", choice: null, preselected: null, addOns: [] });
  });
});

describe("entryHrefForJoin", () => {
  it("sends a bare /join to Create account", () => {
    expect(entryHrefForJoin({})).toBe(CREATE_ACCOUNT_HREF);
    expect(CREATE_ACCOUNT_HREF).toBe("/login?new=1");
  });

  it("carries the plan over, and nothing else", () => {
    const href = entryHrefForJoin({
      listing: "dentists/thane/naupada/smile-dental",
      name: "Smile & Co Dental",
      sig: "c2ln",
      plan: "managed",
      next: "https://elsewhere.example",
    });
    const url = new URL(href, "http://app.localhost");
    expect(url.pathname).toBe("/login");
    expect(Object.fromEntries(url.searchParams)).toEqual({ new: "1", plan: "managed" });
  });
});

describe("readEntryRequest under Brandbasket, which sells Managed Website only", () => {
  const brandbasket = (params: Params): ReturnType<typeof readFor> => readFor(params, BRAND);

  it("opens Sign in by default, and Create account with the plan the link names", () => {
    expect(brandbasket({})).toEqual({ view: "sign-in", choice: null, preselected: "managed", addOns: [] });
    expect(brandbasket({ plan: "managed" })).toEqual({ view: "create", choice: "managed", preselected: "managed", addOns: [] });
    // The retired plan names are not read: a link that names one opens the plan question with Managed Website ticked.
    expect(brandbasket({ plan: "care" })).toEqual({ view: "create", choice: null, preselected: "managed", addOns: [] });
    expect(brandbasket({ plan: "premium" })).toEqual({ view: "create", choice: null, preselected: "managed", addOns: [] });
  });

  it("asks the question with Managed Website ticked when nothing is named", () => {
    expect(brandbasket({ new: "1" })).toEqual({ view: "create", choice: null, preselected: "managed", addOns: [] });
  });

  it("never lets the address choose the free listing: plan=free and plans it does not know fall back to Managed Website", () => {
    for (const plan of ["free", "listing_only", "gold", "own_website"]) {
      const request = brandbasket({ plan });
      expect(request.view, plan).toBe("create");
      expect(request.choice, plan).toBeNull();
      expect(request.preselected, plan).toBe("managed");
    }
  });

  it("no longer reads a directory claim link at all: it opens Sign in like any other address with nothing to say", () => {
    expect(brandbasket({ listing: "dentists/thane/naupada/smile-dental", name: "Smile Dental", sig: "abc" })).toEqual({
      view: "sign-in",
      choice: null,
      preselected: "managed",
      addOns: [],
    });
  });
});

describe("the basket the website's link carries", () => {
  it("keeps the add-ons the website named, catalogue ids only, in the catalogue's order", () => {
    expect(readFor({ plan: "managed", addons: "local-seo-aeo,nonsense,digital-growth" }, BRAND).addOns).toEqual(["digital-growth", "local-seo-aeo"]);
    expect(readFor({ plan: "managed", addons: ["local-seo-aeo"] }, BRAND).addOns).toEqual(["local-seo-aeo"]);
  });

  it("is empty when the link names none, or only ids Brandbasket does not sell", () => {
    expect(readFor({ plan: "managed" }, BRAND).addOns).toEqual([]);
    expect(readFor({ plan: "managed", addons: "social-media,advertising" }, BRAND).addOns).toEqual([]);
  });
});
