import { describe, expect, it } from "vitest";
import { BLOCKING_SETUP_KEYS, isBlockingSetup } from "./service-setup";
import { setupAsks, setupPageHref } from "./setup-asks";
import type { TodoItem } from "./todo";

const item = (setup: "accounts" | "offers" | "budget" | "areas", service: "social" | "search", done = false): TodoItem => ({ key: setup, label: `About ${setup}`, hint: "Two minutes", service, done, kind: "form", setup });
const ANSWERS = { social: { accounts: "x" }, search: { areas: "Thane" } };

describe("isBlockingSetup", () => {
  it("asks for the accounts, the ad budget and the areas, and no longer for what to promote", () => {
    expect(BLOCKING_SETUP_KEYS).toEqual(["accounts", "budget", "areas"]);
    expect(isBlockingSetup("offers")).toBe(false);
    expect(isBlockingSetup("budget")).toBe(true);
  });
});

describe("setupAsks", () => {
  const items = [item("accounts", "social"), item("offers", "social"), item("budget", "social", true), item("areas", "search")];

  it("lists a service's open questions that block delivery, in order, with what was saved for it", () => {
    expect(setupAsks(items, ANSWERS, "social")).toEqual([{ key: "accounts", setup: "accounts", label: "About accounts", hint: "Two minutes", saved: { accounts: "x" } }]);
    expect(setupAsks(items, ANSWERS, "search").map((ask) => ask.key)).toEqual(["areas"]);
  });

  it("leaves out an answered question and the question about what to promote", () => {
    expect(setupAsks(items, ANSWERS, "social").map((ask) => ask.key)).not.toContain("budget");
    expect(setupAsks(items, ANSWERS, "social").map((ask) => ask.key)).not.toContain("offers");
  });

  it("leaves out a website checklist item, which is not asked here", () => {
    const link: TodoItem = { key: "business", label: "Your business", hint: "", service: "website", done: false, kind: "link", href: "/onboarding/business" };
    expect(setupAsks([link], ANSWERS, "social")).toEqual([]);
  });

  it("is empty when every blocking question is answered", () => {
    expect(setupAsks([item("accounts", "social", true), item("budget", "social", true)], ANSWERS, "social")).toEqual([]);
  });
});

describe("setupPageHref", () => {
  it("opens the service's own page at its card", () => {
    expect(setupPageHref("social")).toBe("/social#setup");
    expect(setupPageHref("search")).toBe("/search#setup");
  });
});
