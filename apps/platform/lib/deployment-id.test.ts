import { describe, expect, it } from "vitest";
import { deploymentIdOf } from "./deployment-id";

describe("deploymentIdOf", () => {
  it("is the commit of the release directory the app was built and runs in", () => {
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b/apps/platform", undefined)).toBe("58120e1a9b");
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b", undefined)).toBe("58120e1a9b");
  });

  it("prefers NEXT_DEPLOYMENT_ID when it is set", () => {
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b/apps/platform", " build-42 ")).toBe("build-42");
  });

  it("distinguishes rebuilds of the same commit", () => {
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b+1/apps/platform", undefined)).toBe("58120e1a9b-1");
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b+12/apps/admin", undefined)).toBe("58120e1a9b-12");
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b+oops/apps/platform", undefined)).toBeUndefined();
  });

  it("is none outside a release directory", () => {
    expect(deploymentIdOf("/Users/someone/brandbasket-platform/apps/platform", undefined)).toBeUndefined();
    expect(deploymentIdOf("/srv/brandbasket/releases/not-a-commit/apps/platform", undefined)).toBeUndefined();
    expect(deploymentIdOf("/srv/brandbasket/releases/58120e1a9b/apps/platform", "")).toBe("58120e1a9b");
  });
});
