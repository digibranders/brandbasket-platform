import { describe, expect, it } from "vitest";
import { practitionerInitials } from "./initials";

describe("practitionerInitials", () => {
  it("skips a leading Dr", () => {
    expect(practitionerInitials("Dr Meera Iyer")).toBe("MI");
  });

  it("skips a leading Dr. with a full stop, in any case", () => {
    expect(practitionerInitials("dr. rahul menon")).toBe("RM");
    expect(practitionerInitials("DR Rahul Menon")).toBe("RM");
  });

  it("uses the first and last word of a longer name", () => {
    expect(practitionerInitials("Dr Anil Kumar Rao")).toBe("AR");
  });

  it("gives one letter for a one-word name", () => {
    expect(practitionerInitials("Dr Meera")).toBe("M");
    expect(practitionerInitials("Meera")).toBe("M");
  });

  it("keeps a name that only starts with the letters dr", () => {
    expect(practitionerInitials("Drishti Shah")).toBe("DS");
  });

  it("falls back to the name itself when it is only a title", () => {
    expect(practitionerInitials("Dr")).toBe("D");
  });

  it("gives a dash for an empty name", () => {
    expect(practitionerInitials("   ")).toBe("–");
  });
});
