import { describe, expect, it } from "vitest";
import { buildTodo, openCount } from "@/lib/todo";

describe("buildTodo", () => {
  it("links website items to their setup step and makes Social and Search items forms", () => {
    const items = buildTodo(["website", "social"], [], []);
    expect(items.map((item) => [item.key, item.kind])).toEqual([
      ["brand", "link"],
      ["services", "link"],
      ["domain", "link"],
      ["accounts", "form"],
      ["offers", "form"],
      ["budget", "form"],
    ]);
    const brand = items.find((item) => item.key === "brand");
    expect(brand).toMatchObject({ kind: "link", href: "/onboarding/brand", service: "website", done: false });
    const accounts = items.find((item) => item.key === "accounts");
    expect(accounts).toMatchObject({ kind: "form", setup: "accounts", service: "social" });
  });

  it("puts open items first and counts them", () => {
    const items = buildTodo(["website", "search"], ["brand", "content"], ["areas"]);
    expect(items.map((item) => [item.key, item.done])).toEqual([
      ["domain", false],
      ["brand", true],
      ["services", true],
      ["areas", true],
    ]);
    expect(openCount(items)).toBe(1);
  });

  it("is empty for a plan with nothing to ask", () => {
    expect(buildTodo([], [], [])).toEqual([]);
    expect(openCount([])).toBe(0);
  });
});
