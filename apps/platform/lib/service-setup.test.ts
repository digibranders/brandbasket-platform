import { describe, expect, it } from "vitest";
import { doneSetupKeys, parseSetupItem, SETUP_FIELDS, SETUP_KEYS } from "@/lib/service-setup";

describe("parseSetupItem accounts", () => {
  it("accepts a page link with or without the scheme and keeps the answer an admin choice", () => {
    const result = parseSetupItem("accounts", { instagramUrl: "instagram.com/saidental", facebookUrl: "", adminAccess: "added" });
    expect(result).toEqual({ success: true, answers: { instagramUrl: "https://instagram.com/saidental", facebookUrl: "", adminAccess: "added" } });
  });

  it("needs at least one page", () => {
    expect(parseSetupItem("accounts", { instagramUrl: "", facebookUrl: "", adminAccess: "not_yet" })).toEqual({
      success: false,
      field: "instagramUrl",
      message: "Add at least one of your Instagram or Facebook pages.",
    });
  });

  it("refuses a link on the wrong site and one with a login in it", () => {
    expect(parseSetupItem("accounts", { instagramUrl: "https://example.com/x", facebookUrl: "", adminAccess: "added" })).toMatchObject({ success: false, field: "instagramUrl" });
    expect(parseSetupItem("accounts", { instagramUrl: "", facebookUrl: "https://me:pw@facebook.com/x", adminAccess: "added" })).toMatchObject({ success: false, field: "facebookUrl" });
  });

  it("refuses a long link, a bare host, a port, and keeps only the host and path", () => {
    const parse = (instagramUrl: string) => parseSetupItem("accounts", { instagramUrl, facebookUrl: "", adminAccess: "added" });
    expect(parse(`instagram.com/${"a".repeat(5000)}`)).toMatchObject({ success: false, field: "instagramUrl" });
    expect(parse("instagram.com")).toMatchObject({ success: false, field: "instagramUrl" });
    expect(parse("l.instagram.com/?u=x")).toMatchObject({ success: false, field: "instagramUrl" });
    expect(parse("http://instagram.com:8080/x")).toMatchObject({ success: false, field: "instagramUrl" });
    expect(parse("instagram.com/saidental?utm=1#top")).toMatchObject({ success: true, answers: { instagramUrl: "https://instagram.com/saidental" } });
  });

  it("refuses an admin answer that is not one of the three", () => {
    expect(parseSetupItem("accounts", { instagramUrl: "instagram.com/a", facebookUrl: "", adminAccess: "yes" })).toMatchObject({ success: false, field: "adminAccess" });
  });
});

describe("parseSetupItem offers, budget and areas", () => {
  it("needs a line about offers and trims it", () => {
    expect(parseSetupItem("offers", { offers: "  Free check-up in December  " })).toEqual({ success: true, answers: { offers: "Free check-up in December" } });
    expect(parseSetupItem("offers", { offers: "   " })).toMatchObject({ success: false, field: "offers" });
    expect(parseSetupItem("offers", { offers: "x".repeat(501) })).toMatchObject({ success: false, field: "offers" });
  });

  it("reads the budget in rupees with commas and the rupee sign, and needs an area", () => {
    expect(parseSetupItem("budget", { adBudgetRupees: "₹10,000", adArea: "4 km around your business" })).toEqual({
      success: true,
      answers: { adBudgetRupees: 10000, adArea: "4 km around your business" },
    });
    expect(parseSetupItem("budget", { adBudgetRupees: "ten", adArea: "Thane" })).toMatchObject({ success: false, field: "adBudgetRupees" });
    expect(parseSetupItem("budget", { adBudgetRupees: "0", adArea: "Thane" })).toMatchObject({ success: false, field: "adBudgetRupees" });
    expect(parseSetupItem("budget", { adBudgetRupees: "5000", adArea: "" })).toMatchObject({ success: false, field: "adArea" });
  });

  it("needs the areas, takes competitors as optional and a Google link that is https", () => {
    expect(parseSetupItem("areas", { areas: "Naupada and Thane West", competitors: "", googleBusinessUrl: "" })).toEqual({
      success: true,
      answers: { areas: "Naupada and Thane West", competitors: "", googleBusinessUrl: "" },
    });
    expect(parseSetupItem("areas", { areas: "", competitors: "", googleBusinessUrl: "" })).toMatchObject({ success: false, field: "areas" });
    expect(parseSetupItem("areas", { areas: "Thane", competitors: "", googleBusinessUrl: "http://g.page/x" })).toMatchObject({ success: false, field: "googleBusinessUrl" });
  });

  it("takes a Google link only from Google's own hosts, without a login in it, and stores it normalised", () => {
    const parse = (googleBusinessUrl: string) => parseSetupItem("areas", { areas: "Thane", competitors: "", googleBusinessUrl });
    expect(parse("https://user:pw@g.page/x")).toMatchObject({ success: false, field: "googleBusinessUrl" });
    expect(parse("https://evil.com/x")).toMatchObject({ success: false, field: "googleBusinessUrl" });
    expect(parse("https://maps.google.com/?cid=1")).toMatchObject({ success: true, answers: { googleBusinessUrl: "https://maps.google.com/?cid=1" } });
    expect(parse("HTTPS://G.PAGE/saidental")).toMatchObject({ success: true, answers: { googleBusinessUrl: "https://g.page/saidental" } });
  });

  it("says the limit is allowed in the too-long messages", () => {
    expect(parseSetupItem("offers", { offers: "x".repeat(501) })).toMatchObject({ message: "Keep it to 500 characters or fewer." });
    expect(parseSetupItem("budget", { adBudgetRupees: "5000", adArea: "x".repeat(121) })).toMatchObject({ message: "Keep it to 120 characters or fewer." });
    expect(parseSetupItem("areas", { areas: "x".repeat(301), competitors: "", googleBusinessUrl: "" })).toMatchObject({ message: "Keep it to 300 characters or fewer." });
    expect(parseSetupItem("areas", { areas: "Thane", competitors: "x".repeat(301), googleBusinessUrl: "" })).toMatchObject({ message: "Keep it to 300 characters or fewer." });
  });
});

describe("parseSetupItem limits", () => {
  it("refuses a 10,000 character answer in every text field", () => {
    const long = "x".repeat(10_000);
    const cases = [
      { key: "accounts", input: { instagramUrl: `instagram.com/${long}`, facebookUrl: "", adminAccess: "added" }, field: "instagramUrl" },
      { key: "accounts", input: { instagramUrl: "", facebookUrl: `facebook.com/${long}`, adminAccess: "added" }, field: "facebookUrl" },
      { key: "offers", input: { offers: long }, field: "offers" },
      { key: "budget", input: { adBudgetRupees: long, adArea: "Thane" }, field: "adBudgetRupees" },
      { key: "budget", input: { adBudgetRupees: "5000", adArea: long }, field: "adArea" },
      { key: "areas", input: { areas: long, competitors: "", googleBusinessUrl: "" }, field: "areas" },
      { key: "areas", input: { areas: "Thane", competitors: long, googleBusinessUrl: "" }, field: "competitors" },
      { key: "areas", input: { areas: "Thane", competitors: "", googleBusinessUrl: `https://g.page/${long}` }, field: "googleBusinessUrl" },
    ] as const;
    for (const { key, input, field } of cases) expect(parseSetupItem(key, input)).toMatchObject({ success: false, field });
  });
});

describe("doneSetupKeys", () => {
  it("is empty when nothing is saved", () => {
    expect(doneSetupKeys({ social: undefined, search: undefined })).toEqual([]);
  });

  it("reads each item from its own answers", () => {
    expect(
      doneSetupKeys({
        social: { instagramUrl: "https://instagram.com/a", facebookUrl: "", offers: "", adBudgetRupees: 8000, adArea: "Thane" },
        search: { areas: "Thane" },
      }),
    ).toEqual(["accounts", "budget", "areas"]);
  });

  it("does not count a budget without an area, or a blank offer", () => {
    expect(doneSetupKeys({ social: { adBudgetRupees: 8000, adArea: "", offers: "  " }, search: undefined })).toEqual([]);
  });
});

describe("SETUP_FIELDS", () => {
  it("has fields for every key, each field named once", () => {
    for (const key of SETUP_KEYS) {
      const names = SETUP_FIELDS[key].map((field) => field.name);
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("example text", () => {
  it("suits any business, not one kind", () => {
    const text = JSON.stringify(SETUP_FIELDS);
    expect(text).not.toMatch(/clinic/i);
    const fields = Object.values(SETUP_FIELDS).flat();
    expect(fields.find((field) => field.name === "instagramUrl")?.placeholder).toBe("instagram.com/yourbusiness");
    expect(fields.find((field) => field.name === "facebookUrl")?.placeholder).toBe("facebook.com/yourbusiness");
    expect(fields.find((field) => field.name === "adArea")?.placeholder).toBe("4 km around your business");
    expect(parseSetupItem("budget", { adBudgetRupees: "5000", adArea: "" })).toMatchObject({ message: expect.stringContaining("4 km around your business") });
  });
});
