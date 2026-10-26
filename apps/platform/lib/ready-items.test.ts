import { describe, expect, it } from "vitest";
import { readyItemsFor, readyRows } from "@/lib/ready-items";

describe("readyItemsFor", () => {
  it("lists only the services bought, website first", () => {
    expect(readyItemsFor(["search", "website"]).map((item) => item.service)).toEqual(["website", "website", "website", "search"]);
    expect(readyItemsFor(["social"]).map((item) => item.key)).toEqual(["accounts", "offers", "budget"]);
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

  it("never marks Social or Search items done: they are collected on the call for now", () => {
    expect(readyRows(["social"], ["brand", "content", "domain"]).every((row) => !row.done)).toBe(true);
  });
});
