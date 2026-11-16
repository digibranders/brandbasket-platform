import { describe, expect, it } from "vitest";
import { DROPPED_ACTION_MESSAGE, guardAction, isRecoverableDrop } from "./guard-action";

describe("isRecoverableDrop", () => {
  it("treats a network failure and a server fault as recoverable", () => {
    expect(isRecoverableDrop(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRecoverableDrop(new Error("An error occurred in the Server Components render."))).toBe(true);
    expect(isRecoverableDrop("boom")).toBe(true);
  });

  it("lets redirects and not found through to the framework", () => {
    expect(isRecoverableDrop(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }))).toBe(false);
    expect(isRecoverableDrop(Object.assign(new Error("not found"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(false);
  });

  it("lets a request to an action the new deployment lacks reach the update notice", () => {
    expect(isRecoverableDrop(Object.assign(new Error("x"), { name: "UnrecognizedActionError" }))).toBe(false);
    expect(isRecoverableDrop(new Error('Server Action "abc" was not found on the server.'))).toBe(false);
  });
});

describe("guardAction", () => {
  const failure = (message: string): { readonly ok: false; readonly message: string } => ({ ok: false, message });

  it("returns the action's own answer untouched", async () => {
    const guarded = guardAction(async (value: string): Promise<{ ok: boolean; value?: string; message?: string }> => ({ ok: true, value }), failure);
    await expect(guarded("a")).resolves.toEqual({ ok: true, value: "a" });
  });

  it("turns a rejected request into the form's failure state", async () => {
    const guarded = guardAction(async (): Promise<{ ok: boolean; message?: string }> => {
      throw new TypeError("Failed to fetch");
    }, failure);
    await expect(guarded()).resolves.toEqual({ ok: false, message: DROPPED_ACTION_MESSAGE });
  });

  it("rethrows a redirect", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/x;307;" });
    const guarded = guardAction(async (): Promise<{ ok: boolean }> => {
      throw redirect;
    }, () => ({ ok: false }));
    await expect(guarded()).rejects.toBe(redirect);
  });
});
