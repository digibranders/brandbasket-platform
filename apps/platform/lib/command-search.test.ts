import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CommandSearch } from "@/components/v2/command-search";
import { railSections, railTargets } from "@/lib/rail";

const sections = railSections({ hasAccess: true, hasWebsite: true, hasSocial: true });
const html = renderToStaticMarkup(createElement(CommandSearch, { sections, open: false, onClose: () => undefined })).replaceAll("<!-- -->", "");

describe("the search popup", () => {
  it("is a dialog with one search box that controls a list of options", () => {
    expect(html).toContain('aria-label="Search"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html.match(/role="option"/g)?.length).toBe(railTargets(sections).length);
  });

  it("highlights the first page only, and says which one it is for assistive technology", () => {
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-activedescendant="[^"]+-0"/);
  });

  it("names a page inside a group by the page first and the group after it, instead of 'Website: Authors'", () => {
    expect(html).not.toContain("Blog: Authors");
    expect(html).toMatch(/Authors<\/span><span[^>]*>Blog</);
  });

  it("keeps every row at least 44px tall and never uses a dash in what it says", () => {
    expect(html.match(/min-h-11/g)?.length).toBe(railTargets(sections).length);
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
  });
});

describe("railTargets icons", () => {
  it("gives each page the icon of the sidebar link it sits under, and New request none", () => {
    const targets = railTargets(sections);
    expect(targets[0]).toEqual({ href: "/requests/new", label: "New request" });
    expect(targets.find((target) => target.label === "Website: Enquiries")?.icon).toBe("website");
    expect(targets.find((target) => target.label === "Business")?.icon).toBe("business");
    for (const target of targets.slice(1)) expect(target.icon).toBeDefined();
  });
});
