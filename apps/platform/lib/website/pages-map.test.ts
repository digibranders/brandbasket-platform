import { describe, expect, it } from "vitest";
import { askAboutHref } from "@/lib/website/tabs";
import { PRODUCT_ROWS, SITE_PAGES } from "@/lib/website/pages-map";

describe("SITE_PAGES", () => {
  it("lists the four pages the template is assumed to have", () => {
    expect(SITE_PAGES.map((page) => page.name)).toEqual(["Home", "About", "Services", "Contact"]);
    expect(SITE_PAGES.map((page) => page.path)).toEqual(["/", "/about", "/services", "/contact"]);
  });

  it("has no duplicate names or paths", () => {
    expect(new Set(SITE_PAGES.map((page) => page.name)).size).toBe(SITE_PAGES.length);
    expect(new Set(SITE_PAGES.map((page) => page.path)).size).toBe(SITE_PAGES.length);
  });

  it("gives every page a path on the site and a line about what it shows", () => {
    for (const page of SITE_PAGES) {
      expect(page.path.startsWith("/") && !page.path.startsWith("//")).toBe(true);
      expect(page.line.trim()).not.toBe("");
    }
  });

  it("builds each Change link with askAboutHref, Website chosen and the page filled in", () => {
    for (const page of SITE_PAGES) {
      const url = new URL(askAboutHref(page.name), "https://app.brandbasket.in");
      expect(url.pathname).toBe("/requests/new");
      expect(url.searchParams.get("kind")).toBe("website");
      expect(url.searchParams.get("page")).toBe(page.name);
    }
  });
});

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

  it("does not repeat a page name", () => {
    const names = new Set(SITE_PAGES.map((page) => page.name));
    for (const row of PRODUCT_ROWS) expect(names.has(row.label)).toBe(false);
  });
});
