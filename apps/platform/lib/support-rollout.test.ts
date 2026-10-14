import { describe, expect, it } from "vitest";
import { supportSubmissionsEnabled } from "./support-rollout";

describe("support rollout", () => {
  it("supports enabled, rollback and internal-account rollout", () => {
    expect(supportSubmissionsEnabled(undefined, undefined, null)).toBe(true);
    expect(supportSubmissionsEnabled("off", "allowed", "allowed")).toBe(false);
    expect(supportSubmissionsEnabled("internal", "allowed, second ", "second")).toBe(true);
    expect(supportSubmissionsEnabled("internal", "allowed", "other")).toBe(false);
    expect(supportSubmissionsEnabled("internal", "allowed", null)).toBe(false);
    expect(supportSubmissionsEnabled("mistyped", undefined, "allowed")).toBe(false);
  });
});
