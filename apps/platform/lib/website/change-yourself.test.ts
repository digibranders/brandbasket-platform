import { describe, expect, it } from "vitest";
import { CHANGE_YOURSELF_ITEMS } from "@/lib/website/change-yourself";

describe("CHANGE_YOURSELF_ITEMS", () => {
  it("points the two items inside the product", () => {
    expect(CHANGE_YOURSELF_ITEMS.map((item) => [item.label, item.href])).toEqual([
      ["Opening hours, holidays and the announcement", "/details"],
      ["Blog", "/content/blog"],
    ]);
  });

  it("uses relative paths and no duplicate labels", () => {
    for (const item of CHANGE_YOURSELF_ITEMS) expect(item.href.startsWith("/") && !item.href.startsWith("//")).toBe(true);
    expect(new Set(CHANGE_YOURSELF_ITEMS.map((item) => item.label)).size).toBe(CHANGE_YOURSELF_ITEMS.length);
  });
});
