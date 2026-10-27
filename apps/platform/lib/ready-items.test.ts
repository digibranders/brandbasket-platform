import { describe, expect, it } from "vitest";
import { READY_ITEMS, readyItemsFor, readyRows } from "@/lib/ready-items";
import { SETUP_KEYS, SETUP_SERVICE } from "@/lib/service-setup";

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

describe("READY_ITEMS", () => {
  it("gives each item exactly one of a website step or a setup answer, on the matching service", () => {
    for (const item of READY_ITEMS) {
      expect((item.step === null) !== (item.setup === null)).toBe(true);
      if (item.setup !== null) expect(SETUP_SERVICE[item.setup]).toBe(item.service);
    }
  });

  it("covers every setup key", () => {
    const covered = READY_ITEMS.map((item) => item.setup);
    for (const key of SETUP_KEYS) expect(covered).toContain(key);
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
