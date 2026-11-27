import { describe, expect, it } from "vitest";
import { isWrittenPostId } from "./new-post";

describe("isWrittenPostId", () => {
  it("accepts a post we wrote, and a network's own part of it", () => {
    expect(isWrittenPostId("brandbasket-01a1e91a-w01-d1")).toBe(true);
    expect(isWrittenPostId("brandbasket-01a1e91a-w01-d1~linkedin")).toBe(true);
  });

  it("refuses a part of an unknown network, a bare mark, and anything else", () => {
    for (const bad of ["b-w01-d1~tiktok", "b-w01-d1~", "~linkedin", "b-w01-d1~linkedin~google", "b w01", "", 42, null]) expect(isWrittenPostId(bad)).toBe(false);
  });
});
