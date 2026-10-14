import { describe, expect, it } from "vitest";
import { biddersLabel } from "./advertise-spots";

describe("biddersLabel", () => {
  it("counts the owner as you", () => {
    expect(biddersLabel(1, true)).toBe("Only you have bid so far");
    expect(biddersLabel(2, true)).toBe("You and 1 other have bid");
    expect(biddersLabel(3, true)).toBe("You and 2 others have bid");
  });

  it("counts businesses when the owner has not bid", () => {
    expect(biddersLabel(0, false)).toBe("Nobody has bid yet");
    expect(biddersLabel(1, false)).toBe("1 business has bid");
    expect(biddersLabel(4, false)).toBe("4 businesses have bid");
  });
});
