import { describe, expect, it } from "vitest";
import { parseSitemap } from "./sitemap";

describe("parseSitemap", () => {
  it("reads the pages of a urlset, decoding entities and dropping duplicates and fragments", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://cafe.example.com/</loc><lastmod>2026-10-01</lastmod></url>
        <url><loc> https://cafe.example.com/menu?a=1&amp;b=2 </loc></url>
        <url><loc>https://cafe.example.com/#top</loc></url>
        <url><loc><![CDATA[https://cafe.example.com/about]]></loc></url>
      </urlset>`;

    expect(parseSitemap(xml)).toEqual({
      kind: "urlset",
      urls: ["https://cafe.example.com/", "https://cafe.example.com/menu?a=1&b=2", "https://cafe.example.com/about"],
    });
  });

  it("reads the child sitemaps of an index", () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://cafe.example.com/sitemap-pages.xml</loc></sitemap>
      <sitemap><loc>https://cafe.example.com/sitemap-blog.xml</loc></sitemap>
    </sitemapindex>`;

    expect(parseSitemap(xml)).toEqual({
      kind: "index",
      sitemaps: ["https://cafe.example.com/sitemap-pages.xml", "https://cafe.example.com/sitemap-blog.xml"],
    });
  });

  it("accepts prefixed tags", () => {
    const xml = `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>https://a.example/x</sm:loc></sm:url></sm:urlset>`;

    expect(parseSitemap(xml)).toEqual({ kind: "urlset", urls: ["https://a.example/x"] });
  });

  it("drops locations that are not http(s) URLs", () => {
    const xml = `<urlset><url><loc>javascript:alert(1)</loc></url><url><loc>/relative</loc></url><url><loc>http://a.example/ok</loc></url></urlset>`;

    expect(parseSitemap(xml)).toEqual({ kind: "urlset", urls: ["http://a.example/ok"] });
  });

  it("calls anything else invalid, an HTML error page included", () => {
    expect(parseSitemap("<!doctype html><html><body>Not found</body></html>")).toEqual({ kind: "invalid" });
    expect(parseSitemap("")).toEqual({ kind: "invalid" });
  });
});
