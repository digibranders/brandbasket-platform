import { LAUNCH_CHECK_KEYS } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { LAUNCH_CHECK_LABELS } from "./launch-checks";

describe("LAUNCH_CHECK_LABELS", () => {
  it("has exactly one non-empty label for every launch check key", () => {
    expect(Object.keys(LAUNCH_CHECK_LABELS).sort()).toEqual([...LAUNCH_CHECK_KEYS].sort());
    for (const key of LAUNCH_CHECK_KEYS) {
      expect(LAUNCH_CHECK_LABELS[key].trim(), key).not.toBe("");
    }
  });
});
