import { describe, expect, it } from "vitest";
import { isBusinessModule, suggestedModules } from "./business-modules";

describe("isBusinessModule", () => {
  it("accepts only published modules", () => {
    expect(isBusinessModule("appointments")).toBe(true);
    expect(isBusinessModule("loyalty")).toBe(false);
    expect(isBusinessModule("")).toBe(false);
  });
});

describe("suggestedModules", () => {
  it("suggests appointments for trades that usually take bookings", () => {
    expect(suggestedModules("clinic")).toEqual(["appointments"]);
    expect(suggestedModules("salon")).toEqual(["appointments"]);
    expect(suggestedModules("fitness")).toEqual(["appointments"]);
  });

  it("suggests nothing for a trade with no hint", () => {
    expect(suggestedModules("restaurant")).toEqual([]);
  });

  it("suggests nothing when the business type is null", () => {
    expect(suggestedModules(null)).toEqual([]);
  });

  it("suggests nothing for an unknown slug", () => {
    expect(suggestedModules("space-station")).toEqual([]);
  });
});
