import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/social/brand-actions", () => ({ addBrandAction: vi.fn(), archiveBrandAction: vi.fn(), selectBrandAction: vi.fn() }));

import { BrandSwitcher, ManageBrands } from "@/components/social/brand-switcher";
import type { BrandsView } from "@/lib/social/brands";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(element);
const B = "0192f3c4-0000-7000-8000-00000000000a";
const brand = (externalId: string, name: string, archived = false, website: string | null = null) => ({ externalId, name, website, archived });
const view = (over: Partial<BrandsView> = {}): BrandsView => ({ brands: [brand(B, "Om Sweets", false, "https://omsweets.in"), brand(`${B}:two`, "Om Snacks")], allowed: 3, used: 2, ...over });

describe("BrandSwitcher", () => {
  it("shows nothing for a business with one brand and no more allowed, so nothing changes for her", () => {
    expect(render(createElement(BrandSwitcher, { view: { brands: [brand(B, "Om Sweets")], allowed: 1, used: 1 }, current: B }))).toBe("");
  });

  it("shows nothing for one live brand when no more are allowed, even if another is archived", () => {
    expect(render(createElement(BrandSwitcher, { view: { brands: [brand(B, "Om Sweets"), brand(`${B}:old`, "Old", true)], allowed: 1, used: 1 }, current: B }))).toBe("");
  });

  it("shows a picker of the live brands with the current one chosen, and a way to manage them", () => {
    const html = render(createElement(BrandSwitcher, { view: view({ brands: [...view().brands, brand(`${B}:old`, "Old", true)] }), current: `${B}:two` }));
    expect(html).toContain("Om Sweets");
    expect(html).toMatch(/<option[^>]*value="[^"]*:two"[^>]*selected=""|<option[^>]*selected=""[^>]*value="[^"]*:two"/);
    expect(html).not.toContain(">Old<");
    expect(html).toContain(">Brands<");
  });

  it("shows the picker for a business that may have more, even with one brand so far", () => {
    expect(render(createElement(BrandSwitcher, { view: { brands: [brand(B, "Om Sweets")], allowed: 3, used: 1 }, current: B }))).toContain("Brands");
  });
});

describe("ManageBrands", () => {
  it("lists each brand with where it stands, how many are in use, and a way to add one while there is room", () => {
    const html = render(createElement(ManageBrands, { view: view(), current: B, onClose: vi.fn() }));
    expect(html).toContain("2 of 3 in use");
    expect(html).toContain("Looking at this one");
    expect(html).toContain("Archive");
    expect(html).toContain("Add a brand");
    expect(html).toContain("Add brand");
    expect(html).not.toMatch(/[–—]/);
  });

  it("says the plan is full instead of offering to add one, and offers to bring an archived brand back only when there is room", () => {
    const full = render(createElement(ManageBrands, { view: view({ allowed: 2, used: 2 }), current: B, onClose: vi.fn() }));
    expect(full).toContain("as many brands as your plan allows");
    expect(full).not.toContain("Add brand");
    const archived = view({ brands: [brand(B, "Om Sweets"), brand(`${B}:old`, "Old", true)], allowed: 2, used: 1 });
    expect(render(createElement(ManageBrands, { view: archived, current: B, onClose: vi.fn() }))).toContain("Bring back");
    expect(render(createElement(ManageBrands, { view: { ...archived, allowed: 1 }, current: B, onClose: vi.fn() }))).toMatch(/<button[^>]*disabled=""[^>]*>Bring back/);
  });

  it("offers no archive button for the only live brand", () => {
    const html = render(createElement(ManageBrands, { view: { brands: [brand(B, "Only"), brand(`${B}:old`, "Old", true)], allowed: 2, used: 1 }, current: B, onClose: vi.fn() }));
    expect(html).not.toContain(">Archive<");
  });
});
