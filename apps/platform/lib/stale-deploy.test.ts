import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "./stale-deploy";

describe("isStaleDeployError", () => {
  it("recognises the refusal a page from an older build gets", () => {
    expect(isStaleDeployError({ name: "UnrecognizedActionError", message: "x" })).toBe(true);
    expect(isStaleDeployError({ message: 'Server Action "6062" was not found on the server.' })).toBe(true);
  });

  it("leaves every other error alone", () => {
    expect(isStaleDeployError({ name: "Error", message: "Something else failed" })).toBe(false);
    expect(isStaleDeployError({})).toBe(false);
  });
});
