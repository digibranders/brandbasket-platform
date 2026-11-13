import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * The v4 seed writes the text customers read in their reports and calls (E2E-17): an amount there is written with the rupee
 * sign, never "Rs", as the app writes every rupee amount (plan 60, section 12).
 */
describe("the v4 seed's copy", () => {
  it("writes rupee amounts with the rupee sign", () => {
    const seed = readFileSync(new URL("../scripts/seed-v4-states.ts", import.meta.url), "utf8");
    const lines = seed.split("\n").flatMap((line, index) => (/\bRs\.? ?\d/.test(line) ? [`${index + 1}: ${line.trim()}`] : []));
    expect(lines).toEqual([]);
  });
});
