import fontkit from "@pdf-lib/fontkit";
import { describe, expect, it } from "vitest";
import {
  HANKEN_BOLD,
  HANKEN_REGULAR,
  HANKEN_SEMIBOLD,
  RUPEE_ADVANCE,
  RUPEE_PATH,
  RUPEE_UNITS_PER_EM,
} from "./tax-invoice-fonts.generated";

const WEIGHTS = [
  ["regular", HANKEN_REGULAR],
  ["semibold", HANKEN_SEMIBOLD],
  ["bold", HANKEN_BOLD],
] as const;

/** The first four bytes of a TrueType file: 0x00010000, "true" or (for CFF outlines) "OTTO". */
const SFNT_TAGS = ["00010000", "74727565", "4f54544f"];

describe("embedded Hanken Grotesk", () => {
  it.each(WEIGHTS)("%s decodes to a font file", (_weight, base64) => {
    const bytes = Buffer.from(base64, "base64");
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(SFNT_TAGS).toContain(bytes.subarray(0, 4).toString("hex"));
  });

  it.each(WEIGHTS)("%s opens in fontkit and has the Hanken Grotesk family name", (_weight, base64) => {
    const font = fontkit.create(new Uint8Array(Buffer.from(base64, "base64")));
    expect(font.familyName?.startsWith("Hanken Grotesk")).toBe(true);
  });

  it.each(WEIGHTS)("%s can print every printable ASCII character", (_weight, base64) => {
    const font = fontkit.create(new Uint8Array(Buffer.from(base64, "base64")));
    const missing: string[] = [];
    for (let code = 0x20; code < 0x7f; code += 1) {
      if (!font.hasGlyphForCodePoint(code)) missing.push(String.fromCharCode(code));
    }
    expect(missing).toEqual([]);
  });

  it("ships three different weights", () => {
    expect(new Set([HANKEN_REGULAR, HANKEN_SEMIBOLD, HANKEN_BOLD]).size).toBe(3);
  });
});

describe("rupee sign", () => {
  it("is a vector path with the metrics of its source font", () => {
    expect(RUPEE_PATH).toMatch(/^M[-\d. ]/);
    expect(RUPEE_PATH.length).toBeGreaterThan(100);
    expect(RUPEE_ADVANCE).toBeGreaterThan(0);
    expect(RUPEE_UNITS_PER_EM).toBe(1000);
  });
});
