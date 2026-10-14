import { describe, expect, it } from "vitest";
import { isPrintableOnInvoice, normaliseInvoiceText } from "./invoice-text";

describe("isPrintableOnInvoice", () => {
  it("accepts printable ASCII, punctuation included", () => {
    expect(isPrintableOnInvoice("Sharma & Rao, #12 (3rd Cross)")).toBe(true);
    expect(isPrintableOnInvoice("")).toBe(true);
  });

  it("refuses a Devanagari name, an emoji and a tab", () => {
    expect(isPrintableOnInvoice("शर्मा")).toBe(false);
    expect(isPrintableOnInvoice("Rao \u{1F600}")).toBe(false);
    expect(isPrintableOnInvoice("Rao\tSons")).toBe(false);
  });

  it("refuses a line break and an accented letter", () => {
    expect(isPrintableOnInvoice("Line one\nLine two")).toBe(false);
    expect(isPrintableOnInvoice("Café")).toBe(false);
  });
});

describe("normaliseInvoiceText", () => {
  it("turns the middle dot of an upgrade description into a comma", () => {
    expect(normaliseInvoiceText("Upgrade to Premium \u00B7 31 days left")).toBe("Upgrade to Premium, 31 days left");
  });

  it("treats a bullet and a hyphenation point like the middle dot", () => {
    expect(normaliseInvoiceText("Spot \u2022 Mumbai")).toBe("Spot, Mumbai");
    expect(normaliseInvoiceText("Spot \u2027 Mumbai")).toBe("Spot, Mumbai");
  });

  it("straightens curly single and double quotes", () => {
    expect(normaliseInvoiceText("Dr. Rao\u2019s Dental")).toBe("Dr. Rao's Dental");
    expect(normaliseInvoiceText("\u2018A\u2019 \u201BB\u2019 5\u2032")).toBe("'A' 'B' 5'");
    expect(normaliseInvoiceText("\u201CRao\u201D \u201FSons\u201D 6\u2033")).toBe('"Rao" "Sons" 6"');
  });

  it("turns dashes and the minus sign into a hyphen", () => {
    expect(normaliseInvoiceText("Jan\u2013Feb \u2014 sale")).toBe("Jan-Feb - sale");
    expect(normaliseInvoiceText("\u22125 \u2010 \u2011 \u2012 \u2015")).toBe("-5 - - - -");
  });

  it("spells out an ellipsis", () => {
    expect(normaliseInvoiceText("Wait\u2026")).toBe("Wait...");
  });

  it("turns no-break, thin and other Unicode spaces into one plain space", () => {
    expect(normaliseInvoiceText("A\u00A0B\u2007C\u2009D\u202FE\u200AF\u2002G\u2006H\u2008I")).toBe("A B C D E F G H I");
  });

  it("removes zero-width characters", () => {
    expect(normaliseInvoiceText("Ra\u200Bo\u200C \u200DSons\uFEFF")).toBe("Rao Sons");
  });

  it("collapses runs of spaces and trims", () => {
    expect(normaliseInvoiceText("  Rao   \u00A0 Sons  ")).toBe("Rao Sons");
  });

  it("leaves plain ASCII and the empty string alone", () => {
    expect(normaliseInvoiceText("Sharma & Rao, #12 (3rd Cross)")).toBe("Sharma & Rao, #12 (3rd Cross)");
    expect(normaliseInvoiceText("")).toBe("");
  });

  it("leaves letters of other scripts alone, so they are still refused", () => {
    const hindi = "\u0936\u0930\u094D\u092E\u093E \u0921\u0947\u0902\u091F\u0932";
    expect(normaliseInvoiceText(hindi)).toBe(hindi);
    expect(isPrintableOnInvoice(normaliseInvoiceText(hindi))).toBe(false);
    expect(isPrintableOnInvoice(normaliseInvoiceText("Caf\u00E9"))).toBe(false);
  });

  it("makes typographic punctuation printable", () => {
    expect(isPrintableOnInvoice("Upgrade to Premium \u00B7 31 days left")).toBe(false);
    expect(isPrintableOnInvoice(normaliseInvoiceText("Upgrade to Premium \u00B7 31 days left"))).toBe(true);
  });
});
