import { describe, expect, it } from "vitest";
import { firstName, initialsOf } from "./names";

describe("firstName", () => {
  it("returns the first word of a full name", () => {
    expect(firstName("  Riley   Owner ")).toBe("Riley");
  });

  it("skips a leading title when a name follows it", () => {
    expect(firstName("Dr Neha Kulkarni")).toBe("Neha");
    expect(firstName("Dr. Anil Mehta")).toBe("Anil");
    expect(firstName("prof Rao")).toBe("Rao");
  });

  it("keeps a name that is only a title, and names that merely start like one", () => {
    expect(firstName("Dr")).toBe("Dr");
    expect(firstName("Drew Parker")).toBe("Drew");
  });

  it("falls back to a neutral greeting for blank names", () => {
    expect(firstName("   ")).toBe("there");
  });
});

describe("initialsOf", () => {
  it("takes the first and last initial", () => {
    expect(initialsOf("Steve Jason")).toBe("SJ");
    expect(initialsOf("  riley   anne   owner ")).toBe("RO");
  });

  it("takes one initial from a single name", () => {
    expect(initialsOf("Steve")).toBe("S");
  });

  it("falls back to a dash when there is no name", () => {
    expect(initialsOf("   ")).toBe("\u2013");
  });
});
