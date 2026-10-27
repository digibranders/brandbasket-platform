import { describe, expect, it, vi } from "vitest";
import { quietly } from "./quietly";

vi.mock("server-only", () => ({}));

describe("quietly", () => {
  it("returns what the read returns", async () => {
    await expect(quietly("scope", "things", 0, async () => 5)).resolves.toBe(5);
  });

  it("logs a failed read and returns the fallback", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(quietly("scope", "things", 0, () => Promise.reject(new Error("db down")))).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith("[scope] could not read things", expect.anything());
    log.mockRestore();
  });

  it("passes on a redirect instead of treating it as a failure", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(quietly("scope", "things", 0, () => Promise.reject(redirect))).rejects.toBe(redirect);
  });
});
