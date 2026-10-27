import { describe, expect, it } from "vitest";
import { sentHeading } from "./review-copy";

describe("sentHeading", () => {
  it("only says payment was received when nothing is missing", () => {
    expect(sentHeading(0)).toBe("Payment received");
  });

  it("counts what is missing in plain words", () => {
    expect(sentHeading(1)).toBe("Payment received, one thing is missing before we can start");
    expect(sentHeading(5)).toBe("Payment received, 5 things are missing before we can start");
  });

  it("uses no em or en dashes", () => {
    expect([0, 1, 5].map(sentHeading).join(" ")).not.toMatch(/[–—]/);
  });
});
