import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_TABS,
  FIXED_PAGE_TABS,
  OPTIONAL_PAGE_TABS,
  PAGE_TAB_LABELS,
  PAGE_TAB_LABEL_MAX_LENGTH,
  checkPageTabLabel,
  chosenPageTabLabels,
  isOptionalPageTab,
  normalisePageTabs,
  pageTabLabel,
} from "./page-tabs";

describe("page tabs", () => {
  it("fixes Overview, Location, Reviews and Gallery and turns nothing else on by default", () => {
    expect(FIXED_PAGE_TABS).toEqual(["overview", "location", "reviews", "gallery"]);
    expect(DEFAULT_PAGE_TABS).toEqual([]);
  });

  it("labels every tab and never lets a tab be both fixed and optional", () => {
    for (const tab of [...FIXED_PAGE_TABS, ...OPTIONAL_PAGE_TABS]) expect(PAGE_TAB_LABELS[tab]).not.toBe("");
    expect(OPTIONAL_PAGE_TABS.filter((tab) => (FIXED_PAGE_TABS as readonly string[]).includes(tab))).toEqual([]);
  });

  it("recognises only optional tabs", () => {
    expect(isOptionalPageTab("services")).toBe(true);
    expect(isOptionalPageTab("overview")).toBe(false);
    expect(isOptionalPageTab(7)).toBe(false);
  });

  it("keeps each chosen optional tab once, in the standard order, and drops the rest", () => {
    expect(normalisePageTabs(["faq", "trust", "offers", "trust", "gallery", "nope", 3])).toEqual(["offers", "trust", "faq"]);
    expect(normalisePageTabs(["appointment", "faq", "offers"])).toEqual(["offers", "faq", "appointment"]);
    expect(normalisePageTabs([])).toEqual([]);
  });

  describe("renaming a tab", () => {
    it("takes a short name, tidied", () => {
      expect(checkPageTabLabel("Menu")).toEqual({ ok: true, label: "Menu" });
      expect(checkPageTabLabel("  Our   Menu \n")).toEqual({ ok: true, label: "Our Menu" });
      expect(checkPageTabLabel("Tea & Snacks")).toEqual({ ok: true, label: "Tea & Snacks" });
      expect(checkPageTabLabel("Today\u2019s Specials")).toEqual({ ok: true, label: "Today\u2019s Specials" });
    });

    it("takes names in other scripts", () => {
      expect(checkPageTabLabel("मेनू")).toEqual({ ok: true, label: "मेनू" });
      expect(checkPageTabLabel("जेवणाची यादी")).toEqual({ ok: true, label: "जेवणाची यादी" });
    });

    it("reads a blank name as the usual word", () => {
      expect(checkPageTabLabel("")).toEqual({ ok: true, label: null });
      expect(checkPageTabLabel("   \t ")).toEqual({ ok: true, label: null });
    });

    it("refuses a long name, counting characters not bytes", () => {
      expect(checkPageTabLabel("x".repeat(PAGE_TAB_LABEL_MAX_LENGTH)).ok).toBe(true);
      expect(checkPageTabLabel("x".repeat(PAGE_TAB_LABEL_MAX_LENGTH + 1)).ok).toBe(false);
      expect(checkPageTabLabel("म".repeat(PAGE_TAB_LABEL_MAX_LENGTH)).ok).toBe(true);
    });

    it("refuses markup, symbols and emoji", () => {
      for (const bad of ["<b>Menu</b>", "Menu!", "Menu \u{1F355}", "$$$", "- Menu", "Menu;drop"]) {
        expect(checkPageTabLabel(bad).ok, bad).toBe(false);
      }
    });

    it("shows the owner's name or the usual word", () => {
      expect(pageTabLabel("services", { services: "Menu" })).toBe("Menu");
      expect(pageTabLabel("services", {})).toBe("Services");
      expect(pageTabLabel("products", { services: "Menu" })).toBe("Products");
      expect(pageTabLabel("faq", { services: "Menu" })).toBe("FAQ");
      expect(pageTabLabel("services", undefined)).toBe("Services");
    });

    it("collects only the names that were set", () => {
      expect(chosenPageTabLabels({ services: "Menu", products: null })).toEqual({ services: "Menu" });
      expect(chosenPageTabLabels({ services: "", products: undefined })).toBeUndefined();
      expect(chosenPageTabLabels({ services: "Treatments", products: "Medicines" })).toEqual({ services: "Treatments", products: "Medicines" });
    });
  });
});
