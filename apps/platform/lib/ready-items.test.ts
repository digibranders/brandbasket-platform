import { describe, expect, it } from "vitest";
import { readyItemsFor, readyRows } from "@/lib/ready-items";

describe("readyItemsFor", () => {
  it("lists only the services bought, website first", () => {
    expect(readyItemsFor(["search", "website"]).map((item) => item.service)).toEqual(["website", "website", "website", "search"]);
    expect(readyItemsFor(["social"]).map((item) => item.key)).toEqual(["accounts", "offers", "budget"]);
  });

  it("names the Instagram and Facebook item for the pages, never a login", () => {
    const accounts = readyItemsFor(["social"]).find((item) => item.key === "accounts");
    expect(accounts?.label).toBe("Instagram and Facebook pages");
    expect(accounts?.setup).toBe("accounts");
    expect(accounts?.step).toBeNull();
  });
});

describe("readyRows", () => {
  it("marks website items done from the setup steps, and puts open items first", () => {
    const rows = readyRows(["website"], ["brand"]);
    expect(rows.map((row) => [row.item.key, row.done])).toEqual([
      ["services", false],
      ["domain", false],
      ["brand", true],
    ]);
  });

  it("marks Social and Search items done from the saved answers", () => {
    const rows = readyRows(["social", "search"], [], ["offers", "areas"]);
    expect(rows.map((row) => [row.item.key, row.done])).toEqual([
      ["accounts", false],
      ["budget", false],
      ["offers", true],
      ["areas", true],
    ]);
  });

  it("leaves Social items open when no answers are given", () => {
    expect(readyRows(["social"], ["brand", "content", "domain"]).every((row) => !row.done)).toBe(true);
  });
});
