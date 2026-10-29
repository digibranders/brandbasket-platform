import { describe, expect, it } from "vitest";
import { PRODUCT_ROWS } from "@/lib/website/pages-map";

describe("PRODUCT_ROWS", () => {
  it("points the two rows inside the product", () => {
    expect(PRODUCT_ROWS.map((row) => [row.label, row.href])).toEqual([
      ["Opening hours, holidays and the announcement", "/details"],
      ["Blog", "/content/blog"],
    ]);
  });

  it("uses relative paths and no duplicate labels", () => {
    for (const row of PRODUCT_ROWS) expect(row.href.startsWith("/") && !row.href.startsWith("//")).toBe(true);
    expect(new Set(PRODUCT_ROWS.map((row) => row.label)).size).toBe(PRODUCT_ROWS.length);
  });
});
