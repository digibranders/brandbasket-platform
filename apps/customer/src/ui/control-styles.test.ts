import { describe, expect, it } from "vitest";
import { controlWidth } from "./control-styles";

describe("controlWidth", () => {
  it("fills the row unless the caller sets a width", () => {
    expect(controlWidth(undefined)).toBe("w-full");
    expect(controlWidth("min-w-0 flex-1")).toBe("w-full");
    expect(controlWidth("w-32")).toBe("");
    expect(controlWidth("shrink-0 w-40")).toBe("");
    expect(controlWidth("max-w-64")).toBe("");
  });
});
