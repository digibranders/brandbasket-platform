import { describe, expect, it } from "vitest";
import { BRANDS } from "./brand";
import { CREATE_ACCOUNT_HREF, entryHrefForJoin, entryHrefForPlan, readEntryRequest as readFor } from "./account-entry";

type Params = Parameters<typeof readFor>[0];

/** Firstfold's reading, which is the one every test below this line was written against. */
const readEntryRequest = (params: Params): ReturnType<typeof readFor> => readFor(params, BRANDS.firstfold);

const NO_CLAIM = { listing: "", id: "", name: "", signature: "" };

describe("readEntryRequest", () => {
  it("opens on Sign in by default", () => {
    expect(readEntryRequest({})).toEqual({ view: "sign-in", choice: null, preselected: null, claim: NO_CLAIM });
    expect(readEntryRequest({ notice: "password-changed" }).view).toBe("sign-in");
  });

  it("opens on Create account when the address asks for it", () => {
    expect(readEntryRequest({ new: "1" })).toEqual({ view: "create", choice: null, preselected: null, claim: NO_CLAIM });
  });

  it("opens Create account with Premium already chosen from the website's membership button", () => {
    expect(readEntryRequest({ plan: "premium" })).toEqual({ view: "create", choice: "premium", preselected: null, claim: NO_CLAIM });
  });

  it("opens Create account with the Care plan chosen when the address says so", () => {
    expect(readEntryRequest({ plan: "care" })).toEqual({ view: "create", choice: "care", preselected: null, claim: NO_CLAIM });
  });

  it("reads plan=free as the free listing, and still reads the database's own word", () => {
    expect(readEntryRequest({ new: "1", plan: "free" })).toEqual({ view: "create", choice: "listing_only", preselected: null, claim: NO_CLAIM });
    expect(readEntryRequest({ plan: "listing_only" }).choice).toBe("listing_only");
  });

  it("writes the address for a continued plan, keeps a claim, and drops the plan on going back", () => {
    expect(entryHrefForPlan("?new=1", "listing_only")).toBe("/login?new=1&plan=free");
    expect(entryHrefForPlan("", "care")).toBe("/login?new=1&plan=care");
    expect(entryHrefForPlan("?new=1&plan=care&listing=a%2Fb&name=X", "premium")).toBe("/login?new=1&plan=premium&listing=a%2Fb&name=X");
    expect(entryHrefForPlan("?new=1&plan=premium", null)).toBe("/login?new=1");
  });

  it("ignores a plan it does not know, and asks the question", () => {
    expect(readEntryRequest({ new: "1", plan: "gold" })).toEqual({ view: "create", choice: null, preselected: null, claim: NO_CLAIM });
    expect(readEntryRequest({ plan: "gold" }).view).toBe("sign-in");
  });

  it("opens Create account for a claim link, and hands its parts on unchecked", () => {
    expect(readEntryRequest({ listing: "dentists/thane/naupada/smile-dental", name: "Smile Dental", sig: "abc" })).toEqual({
      view: "create",
      choice: null,
      preselected: null,
      claim: { listing: "dentists/thane/naupada/smile-dental", id: "", name: "Smile Dental", signature: "abc" },
    });
  });

  it("opens Create account for a claim link that names the business by id", () => {
    expect(readEntryRequest({ id: "k7m2q9a", name: "Smile Dental", sig: "abc" })).toEqual({
      view: "create",
      choice: null,
      preselected: null,
      claim: { listing: "", id: "k7m2q9a", name: "Smile Dental", signature: "abc" },
    });
  });

  it("reads a repeated parameter as absent", () => {
    expect(readEntryRequest({ new: ["1", "1"], plan: ["premium"] })).toEqual({ view: "sign-in", choice: null, preselected: null, claim: NO_CLAIM });
  });
});

describe("entryHrefForJoin", () => {
  it("sends a bare /join to Create account", () => {
    expect(entryHrefForJoin({})).toBe(CREATE_ACCOUNT_HREF);
    expect(CREATE_ACCOUNT_HREF).toBe("/login?new=1");
  });

  it("carries a claim link's parts and the plan over, and nothing else", () => {
    const href = entryHrefForJoin({
      listing: "dentists/thane/naupada/smile-dental",
      name: "Smile & Co Dental",
      sig: "c2ln",
      plan: "premium",
      next: "https://elsewhere.example",
    });
    const url = new URL(href, "http://app.localhost");
    expect(url.pathname).toBe("/login");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      new: "1",
      listing: "dentists/thane/naupada/smile-dental",
      name: "Smile & Co Dental",
      sig: "c2ln",
      plan: "premium",
    });
  });

  it("carries an id claim link's parts over the same way", () => {
    const url = new URL(entryHrefForJoin({ id: "k7m2q9a", name: "Smile Dental", sig: "c2ln", other: "x" }), "http://app.localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ new: "1", id: "k7m2q9a", name: "Smile Dental", sig: "c2ln" });
  });
});

describe("readEntryRequest under Fynix, which sells Care and Premium only", () => {
  const fynix = (params: Params): ReturnType<typeof readFor> => readFor(params, BRANDS.fynix);

  it("opens Sign in by default, and Create account with the plan the link names", () => {
    expect(fynix({})).toEqual({ view: "sign-in", choice: null, preselected: "care", claim: NO_CLAIM });
    expect(fynix({ plan: "care" })).toEqual({ view: "create", choice: "care", preselected: "care", claim: NO_CLAIM });
    expect(fynix({ plan: "premium" })).toEqual({ view: "create", choice: "premium", preselected: "care", claim: NO_CLAIM });
  });

  it("asks the question with Care ticked when nothing is named", () => {
    expect(fynix({ new: "1" })).toEqual({ view: "create", choice: null, preselected: "care", claim: NO_CLAIM });
  });

  it("never lets the address choose the free listing: plan=free and plans it does not know fall back to Care", () => {
    for (const plan of ["free", "listing_only", "gold", "own_website"]) {
      const request = fynix({ plan });
      expect(request.view, plan).toBe("create");
      expect(request.choice, plan).toBeNull();
      expect(request.preselected, plan).toBe("care");
    }
  });

  it("reads a claim link as someone new, and drops the claim", () => {
    expect(fynix({ listing: "dentists/thane/naupada/smile-dental", name: "Smile Dental", sig: "abc" })).toEqual({
      view: "create",
      choice: null,
      preselected: "care",
      claim: NO_CLAIM,
    });
    expect(fynix({ id: "k7m2q9a", name: "Smile Dental", sig: "abc", plan: "premium" }).claim).toEqual(NO_CLAIM);
  });
});
