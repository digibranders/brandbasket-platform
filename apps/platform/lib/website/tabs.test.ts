import { describe, expect, it } from "vitest";
import { askAboutHref, currentTab } from "@/lib/website/tabs";
import { readWebsiteNotice, websiteNoticeHref, WEBSITE_NOTICES } from "@/lib/website/notices";

describe("currentTab", () => {
  it("marks Overview only on /website itself", () => {
    expect(currentTab("/website")?.label).toBe("Overview");
    expect(currentTab("/website/x")).toBeNull();
  });

  it("marks Pages on /website/pages and not Overview", () => {
    expect(currentTab("/website/pages")?.label).toBe("Pages");
  });

  it("marks Blog on the blog's own pages", () => {
    expect(currentTab("/content/blog/new")?.label).toBe("Blog");
  });

  it("marks Blog on the authors and categories pages, which are blog settings", () => {
    for (const path of ["/content/authors", "/content/authors/new", "/content/categories", "/content/categories/abc"]) {
      expect(currentTab(path)?.label).toBe("Blog");
    }
  });

  it("marks Enquiries on the website chat's page", () => {
    expect(currentTab("/website/enquiries")?.label).toBe("Enquiries");
  });

  it("marks no tab on pages the tabs do not cover", () => {
    expect(currentTab("/content/authorship")).toBeNull();
    expect(currentTab("/billing")).toBeNull();
  });
});

describe("askAboutHref", () => {
  it("opens the Website request with the page filled in and encoded", () => {
    expect(askAboutHref("Home & About")).toBe("/requests/new?kind=website&page=Home%20%26%20About");
  });
});

describe("website notices", () => {
  it("has a fixed text for every notice", () => {
    for (const copy of Object.values(WEBSITE_NOTICES)) expect(copy.text.length).toBeGreaterThan(0);
  });

  it("builds the Progress address for a notice", () => {
    expect(websiteNoticeHref("approved")).toBe("/website?response=approved");
  });

  it("reads only the known notices", () => {
    expect(readWebsiteNotice("approved")).toBe("approved");
    expect(readWebsiteNotice("not-ready")).toBe("not-ready");
    expect(readWebsiteNotice("constructor")).toBeNull();
    expect(readWebsiteNotice("anything")).toBeNull();
    expect(readWebsiteNotice(undefined)).toBeNull();
    expect(readWebsiteNotice(["approved"])).toBeNull();
  });
});
