import { describe, expect, it } from "vitest";
import { openStart, sealStart } from "./start-token";

const SECRET = "k".repeat(40);
const PREFILL = { name: "Rahul Mehta", email: "rahul@mehta.in", phone: "9876543210" };
const NOW = 1_800_000_000_000;

describe("start token", () => {
  it("opens what it sealed", () => {
    expect(openStart(sealStart(PREFILL, SECRET, NOW), SECRET, NOW + 1000)).toEqual(PREFILL);
  });

  it("never shows the details in the token", () => {
    const token = sealStart(PREFILL, SECRET, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("rahul");
  });

  it("is refused after an hour", () => {
    const token = sealStart(PREFILL, SECRET, NOW);
    expect(openStart(token, SECRET, NOW + 60 * 60 * 1000 - 1)).toEqual(PREFILL);
    expect(openStart(token, SECRET, NOW + 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("is refused under another secret, when altered, and when it is not a token", () => {
    const token = sealStart(PREFILL, SECRET, NOW);
    expect(openStart(token, "z".repeat(40), NOW)).toBeNull();
    const flipped = Buffer.from(token, "base64url");
    flipped[flipped.length - 1] ^= 1;
    expect(openStart(flipped.toString("base64url"), SECRET, NOW)).toBeNull();
    for (const junk of ["", "abc", "not a token at all", "A".repeat(200)]) expect(openStart(junk, SECRET, NOW)).toBeNull();
  });
});
