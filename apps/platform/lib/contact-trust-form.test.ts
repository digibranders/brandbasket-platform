import { describe, expect, it } from "vitest";
import { OWNER_FORM_FIELDS_MESSAGE } from "./owner-form";
import { parseContactOptionsForm, parsePageTabsForm, parseTrustForm } from "./contact-trust-form";

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseContactOptionsForm", () => {
  it("keeps the chosen buttons once each, in the sheet's order", () => {
    expect(parseContactOptionsForm(form([["option", "website"], ["option", "call"], ["option", "call"]]))).toEqual({
      success: true,
      data: ["call", "website"],
    });
  });

  it("allows none, and refuses a button that does not exist", () => {
    expect(parseContactOptionsForm(form([]))).toEqual({ success: true, data: [] });
    expect(parseContactOptionsForm(form([["option", "telepathy"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
  });
});

describe("parseTrustForm", () => {
  it("returns payment methods and licences, one per line, trimmed and without repeats", () => {
    expect(
      parseTrustForm(form([["payment", "upi"], ["payment", "cash"], ["licences", " MCI 12345 \r\n\r\nISO 9001\nISO 9001 "]])),
    ).toEqual({ success: true, data: { paymentMethods: ["cash", "upi"], licences: ["MCI 12345", "ISO 9001"] } });
  });

  it("refuses too many licences, a long one and an unknown payment method", () => {
    const many = Array.from({ length: 11 }, (_, index) => `Licence ${String(index)}`).join("\n");
    expect(parseTrustForm(form([["licences", many]])).success).toBe(false);
    expect(parseTrustForm(form([["licences", "x".repeat(101)]])).success).toBe(false);
    expect(parseTrustForm(form([["payment", "barter"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
  });
});

describe("parsePageTabsForm", () => {
  const usual = { services: null, products: null };

  it("keeps each ticked optional tab once, in the standard order", () => {
    expect(parsePageTabsForm(form([["tab", "faq"], ["tab", "trust"], ["tab", "services"], ["tab", "services"]]))).toEqual({
      success: true,
      data: { tabs: ["services", "trust", "faq"], labels: usual },
    });
  });

  it("takes none ticked as a choice, and refuses a fixed tab, an unknown one or an extra field", () => {
    expect(parsePageTabsForm(form([]))).toEqual({ success: true, data: { tabs: [], labels: usual } });
    expect(parsePageTabsForm(form([["tab", "gallery"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
    expect(parsePageTabsForm(form([["tab", "reviews"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
    expect(parsePageTabsForm(form([["tab", "offers"], ["slug", "x"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
  });

  it("takes the owner's own word for Services and Products, tidied, and a blank as the usual word", () => {
    expect(parsePageTabsForm(form([["tab", "services"], ["label-services", "  Our   Menu "], ["label-products", ""]]))).toEqual({
      success: true,
      data: { tabs: ["services"], labels: { services: "Our Menu", products: null } },
    });
    expect(parsePageTabsForm(form([["label-products", "Medicines"]]))).toEqual({ success: true, data: { tabs: [], labels: { services: null, products: "Medicines" } } });
  });

  it("refuses a name that is too long or has symbols, saying why", () => {
    const long = parsePageTabsForm(form([["label-services", "x".repeat(25)]]));
    expect(long.success).toBe(false);
    expect(!long.success && long.message).toMatch(/24 characters/);
    const symbols = parsePageTabsForm(form([["label-products", "<b>Shop</b>"]]));
    expect(symbols.success).toBe(false);
  });

  it("refuses a name field for a tab that cannot be renamed", () => {
    expect(parsePageTabsForm(form([["label-faq", "Questions"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
    expect(parsePageTabsForm(form([["label-gallery", "Photos"]]))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
  });
});
