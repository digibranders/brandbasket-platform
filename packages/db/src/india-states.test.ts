import { describe, expect, it } from "vitest";
import { INDIA_STATES, isIndiaStateCode, stateCodeOfIndiaPostName, stateName } from "./india-states";

describe("india states", () => {
  it("has the 36 states and union territories, codes unique and lower-case", () => {
    expect(INDIA_STATES).toHaveLength(36);
    expect(new Set(INDIA_STATES.map((s) => s.code)).size).toBe(36);
    for (const state of INDIA_STATES) expect(state.code).toMatch(/^[a-z]{2}$/);
  });

  it.each([
    ["MAHARASHTRA", "mh"],
    ["WEST BENGAL", "wb"],
    ["  West  Bengal ", "wb"],
    ["THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "dh"],
    ["DELHI", "dl"],
    ["ODISHA", "od"],
    ["TELANGANA", "tg"],
    ["JAMMU AND KASHMIR", "jk"],
    ["ANDAMAN AND NICOBAR ISLANDS", "an"],
    ["Andaman & Nicobar Islands", "an"],
    ["CHATTISGARH", "cg"],
    ["PONDICHERRY", "py"],
    ["ORISSA", "od"],
    ["UTTARANCHAL", "uk"],
    ["DADRA AND NAGAR HAVELI", "dh"],
    ["DAMAN AND DIU", "dh"],
    ["NCT OF DELHI", "dl"],
    ["JAMMU & KASHMIR", "jk"],
  ])("reads India Post's %j as %s", (name, code) => {
    expect(stateCodeOfIndiaPostName(name)).toBe(code);
  });

  it("returns null for a name it does not know", () => {
    expect(stateCodeOfIndiaPostName("ATLANTIS")).toBeNull();
  });

  it("names a state by code", () => {
    expect(stateName("wb")).toBe("West Bengal");
    expect(stateName("xx")).toBeNull();
    expect(isIndiaStateCode("mh")).toBe(true);
    expect(isIndiaStateCode("xx")).toBe(false);
  });
});
