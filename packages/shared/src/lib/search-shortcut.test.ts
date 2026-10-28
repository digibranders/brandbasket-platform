import { describe, expect, it } from "vitest";
import { isSearchShortcut } from "./search-shortcut";

describe("isSearchShortcut", () => {
  it("opens search on Command K and Control K, in either case", () => {
    expect(isSearchShortcut({ metaKey: true, ctrlKey: false, key: "k" })).toBe(true);
    expect(isSearchShortcut({ metaKey: false, ctrlKey: true, key: "k" })).toBe(true);
    expect(isSearchShortcut({ metaKey: true, ctrlKey: false, key: "K" })).toBe(true);
  });

  it("ignores K on its own and other letters with a modifier", () => {
    expect(isSearchShortcut({ metaKey: false, ctrlKey: false, key: "k" })).toBe(false);
    expect(isSearchShortcut({ metaKey: true, ctrlKey: false, key: "j" })).toBe(false);
  });
});
