import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
import { CREATE_ACCOUNT_HREF, entryHrefForJoin, entryHrefForPlan, readEntryRequest as readFor } from "./account-entry";

type Params = Parameters<typeof readFor>[0];

/** The reading under a brand that sells the free listing, which is the one the tests until the Brandbasket block were written against. */
const readEntryRequest = (params: Params): ReturnType<typeof readFor> => readFor(params, LISTING_BRAND);

describe("readEntryRequest", () => {
  it("opens on Sign in by default", () => {
    expect(readEntryRequest({})).toEqual({ view: "sign-in", choice: null, preselected: null });
    expect(readEntryRequest({ notice: "password-changed" }).view).toBe("sign-in");
  });

  it("opens on Create account when the address asks for it", () => {
    expect(readEntryRequest({ new: "1" })).toEqual({ view: "create", choice: null, preselected: null });
  });

  it("opens Create account with Premium already chosen from the website's membership button", () => {
    expect(readEntryRequest({ plan: "premium" })).toEqual({ view: "create", choice: "premium", preselected: null });
  });

  it("opens Create account with the Care plan chosen when the address says so", () => {
    expect(readEntryRequest({ plan: "care" })).toEqual({ view: "create", choice: "care", preselected: null });
  });

  it("reads plan=free as the free listing, and still reads the database's own word", () => {
    expect(readEntryRequest({ new: "1", plan: "free" })).toEqual({ view: "create", choice: "listing_only", preselected: null });
    expect(readEntryRequest({ plan: "listing_only" }).choice).toBe("listing_only");
  });

  it("writes the address for a continued plan, and drops the plan on going back", () => {
    expect(entryHrefForPlan("?new=1", "listing_only")).toBe("/login?new=1&plan=free");
    expect(entryHrefForPlan("", "care")).toBe("/login?new=1&plan=care");
    expect(entryHrefForPlan("?new=1&plan=care&utm_source=website", "premium")).toBe("/login?new=1&plan=premium&utm_source=website");
    expect(entryHrefForPlan("?new=1&plan=premium", null)).toBe("/login?new=1");
  });

  it("ignores a plan it does not know, and asks the question", () => {
    expect(readEntryRequest({ new: "1", plan: "gold" })).toEqual({ view: "create", choice: null, preselected: null });
    expect(readEntryRequest({ plan: "gold" }).view).toBe("sign-in");
  });

  it("reads a repeated parameter as absent", () => {
    expect(readEntryRequest({ new: ["1", "1"], plan: ["premium"] })).toEqual({ view: "sign-in", choice: null, preselected: null });
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
      plan: "premium",
      next: "https://elsewhere.example",
    });
    const url = new URL(href, "http://app.localhost");
    expect(url.pathname).toBe("/login");
    expect(Object.fromEntries(url.searchParams)).toEqual({ new: "1", plan: "premium" });
  });
});

describe("readEntryRequest under Brandbasket, which sells Care only", () => {
  const brandbasket = (params: Params): ReturnType<typeof readFor> => readFor(params, BRAND);

  it("opens Sign in by default, and Create account with the plan the link names", () => {
    expect(brandbasket({})).toEqual({ view: "sign-in", choice: null, preselected: "care" });
    expect(brandbasket({ plan: "care" })).toEqual({ view: "create", choice: "care", preselected: "care" });
    // Premium is no longer sold: a link that names it opens the plan question with Care ticked.
    expect(brandbasket({ plan: "premium" })).toEqual({ view: "create", choice: null, preselected: "care" });
  });

  it("asks the question with Care ticked when nothing is named", () => {
    expect(brandbasket({ new: "1" })).toEqual({ view: "create", choice: null, preselected: "care" });
  });

  it("never lets the address choose the free listing: plan=free and plans it does not know fall back to Care", () => {
    for (const plan of ["free", "listing_only", "gold", "own_website"]) {
      const request = brandbasket({ plan });
      expect(request.view, plan).toBe("create");
      expect(request.choice, plan).toBeNull();
      expect(request.preselected, plan).toBe("care");
    }
  });

  it("no longer reads a directory claim link at all: it opens Sign in like any other address with nothing to say", () => {
    expect(brandbasket({ listing: "dentists/thane/naupada/smile-dental", name: "Smile Dental", sig: "abc" })).toEqual({
      view: "sign-in",
      choice: null,
      preselected: "care",
    });
  });
});
