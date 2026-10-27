import { describe, expect, it } from "vitest";
import { formSnapshot } from "./form-snapshot";

describe("formSnapshot", () => {
  it("is the same for the same fields in the same order, and different once a value changes", () => {
    const before = formSnapshot([["message", "Closed for Diwali"], ["startsOn", "2026-11-01"]]);
    expect(formSnapshot([["message", "Closed for Diwali"], ["startsOn", "2026-11-01"]])).toBe(before);
    expect(formSnapshot([["message", "Closed for Diwali!"], ["startsOn", "2026-11-01"]])).not.toBe(before);
  });

  it("tells an empty form from one with a field in it", () => {
    expect(formSnapshot([])).not.toBe(formSnapshot([["message", ""]]));
  });

  it("does not confuse a value that holds a separator with two fields", () => {
    expect(formSnapshot([["a", "b,c"]])).not.toBe(formSnapshot([["a", "b"], ["c", ""]]));
  });

  it("counts a file by its name", () => {
    expect(formSnapshot([["photo", new File(["x"], "logo.png")]])).toBe(formSnapshot([["photo", new File(["yy"], "logo.png")]]));
  });
});
