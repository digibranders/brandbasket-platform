import { describe, expect, it } from "vitest";
import { codeFromForm, initialVerifyBusinessState, verifyMessage } from "./verify-business-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

describe("codeFromForm", () => {
  it("reads the step's id and a six-digit code, ignoring spaces", () => {
    const otpId = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(codeFromForm(form({ otpId, code: " 123 456 " }))).toEqual({ ok: true, value: { otpId, code: "123456" } });
  });

  it("refuses a code that is not six digits, and a missing or malformed step id", () => {
    const otpId = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(codeFromForm(form({ otpId, code: "12345" })).ok).toBe(false);
    expect(codeFromForm(form({ otpId, code: "12ab56" })).ok).toBe(false);
    expect(codeFromForm(form({ code: "123456" })).ok).toBe(false);
    expect(codeFromForm(form({ otpId: "nope", code: "123456" })).ok).toBe(false);
  });
});

describe("verifyMessage", () => {
  it("words each way a code can go wrong, with the tries left", () => {
    expect(verifyMessage({ kind: "wrong_code", triesLeft: 3 })).toContain("3");
    expect(verifyMessage({ kind: "wrong_code", triesLeft: 1 })).toMatch(/1 try/);
    expect(verifyMessage({ kind: "wrong_code", triesLeft: null })).toMatch(/6 digits/);
    expect(verifyMessage({ kind: "expired" })).toMatch(/new code/i);
    expect(verifyMessage({ kind: "limited" })).toMatch(/later|while/i);
    expect(verifyMessage({ kind: "unavailable" }).length).toBeGreaterThan(10);
    expect(verifyMessage({ kind: "failed" }).length).toBeGreaterThan(10);
    expect(verifyMessage({ kind: "invalid", message: "We only text Indian numbers." })).toBe("We only text Indian numbers.");
  });
});

describe("initialVerifyBusinessState", () => {
  it("starts idle", () => {
    expect(initialVerifyBusinessState).toEqual({ status: "idle" });
  });
});
