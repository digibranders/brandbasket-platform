import { describe, expect, it } from "vitest";
import { protectionLines } from "./protection-status";

describe("protectionLines", () => {
  it("says the console is protected when Access is required and this request was verified", () => {
    expect(protectionLines({ required: true, verified: { ok: true, email: "owner@example.test" } })).toEqual({
      tone: "done",
      headline: "Protected by Cloudflare Access",
      detail: "This request was verified for owner@example.test.",
    });
  });

  it("says so without an address when Access gave none", () => {
    expect(protectionLines({ required: true, verified: { ok: true } }).detail).toBe("This request was verified.");
  });

  it("is a problem when Access is required but this request did not pass", () => {
    expect(protectionLines({ required: true, verified: { ok: false, status: 401, reason: "Cloudflare Access assertion is missing." } })).toEqual({
      tone: "problem",
      headline: "Cloudflare Access did not verify this request",
      detail: "Cloudflare Access assertion is missing.",
    });
  });

  it("is a warning, not a pass, when Access is not required", () => {
    expect(protectionLines({ required: false, verified: { ok: true } })).toEqual({
      tone: "wait",
      headline: "Cloudflare Access is not required here",
      detail: "Only the staff sign-in protects this console. This is expected on a local machine and a problem on the live site.",
    });
  });
});
