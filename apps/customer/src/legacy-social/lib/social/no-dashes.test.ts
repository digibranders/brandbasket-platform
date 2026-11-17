import { describe, expect, it } from "vitest";
import { plainWords, withoutDashes } from "./no-dashes";

// Written as escapes: no source file may contain the dash characters themselves.
const EM = "\u2014";
const EN = "\u2013";

describe("withoutDashes", () => {
  it("turns a dash between words into a comma", () => {
    expect(withoutDashes(`Fresh ${EM} every day`)).toBe("Fresh, every day");
    expect(withoutDashes(`Fresh${EM}every day`)).toBe("Fresh, every day");
    expect(withoutDashes(`Fresh ${EN} every day`)).toBe("Fresh, every day");
  });

  it("keeps a range as a hyphen", () => {
    expect(withoutDashes(`Save 10${EN}20% today`)).toBe("Save 10-20% today");
    expect(withoutDashes(`Open 9 ${EM} 5`)).toBe("Open 9-5");
  });

  it("ends a sentence with a full stop when the dash closes it", () => {
    expect(withoutDashes(`Ready when you are ${EM}`)).toBe("Ready when you are.");
    expect(withoutDashes(`Ready ${EM}. Next`)).toBe("Ready. Next");
  });

  it("leaves hyphens and clean text as they are", () => {
    expect(withoutDashes("Well-known, easy-to-use")).toBe("Well-known, easy-to-use");
  });
});

describe("plainWords", () => {
  it("does not change words the customer wrote or edited", () => {
    expect(plainWords(`Mine ${EM} mine`, true)).toBe(`Mine ${EM} mine`);
    expect(plainWords(`Mine ${EM} mine`, false)).toBe("Mine, mine");
  });
});
