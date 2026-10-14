import { afterEach, describe, expect, it, vi } from "vitest";
import { isStaleDeployError, reloadForDeploymentUpdate } from "./stale-deploy";

afterEach(() => { vi.unstubAllGlobals(); });

describe("deployment recovery", () => {
  it("recognizes missing actions without treating other failures as deployment changes", () => {
    expect(isStaleDeployError({ name: "UnrecognizedActionError" })).toBe(true);
    expect(isStaleDeployError({ message: 'Server Action "old" was not found on the server.' })).toBe(true);
    expect(isStaleDeployError({ name: "TypeError", message: "Failed to fetch" })).toBe(false);
    expect(isStaleDeployError({})).toBe(false);
  });

  it("performs an explicit full reload without accessing browser storage", () => {
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload }, get sessionStorage(): never { throw new Error("Storage blocked"); } });
    reloadForDeploymentUpdate();
    expect(reload).toHaveBeenCalledExactlyOnceWith();
  });
});
