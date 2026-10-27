import { describe, expect, it } from "vitest";
import { containsPattern } from "./like";

describe("containsPattern", () => {
  it("wraps the term for ILIKE and takes its wildcards literally", () => {
    expect(containsPattern("setup")).toBe("%setup%");
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
