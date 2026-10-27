import { describe, expect, it } from "vitest";
import { resendNotice } from "./deliveries-notices";

describe("resendNotice", () => {
  it("says what happened to one resend", () => {
    expect(resendNotice({ resent: "sent" })).toEqual({ tone: "ok", text: "Sent again." });
    expect(resendNotice({ resent: "failed" })).toEqual({ tone: "problem", text: "It still did not go. The reason is on the row." });
    expect(resendNotice({ resent: "refused" })).toEqual({ tone: "problem", text: "This one cannot be sent again: it went already, or the copy kept leaves out a sign-in link." });
    expect(resendNotice({ resent: "unavailable" })).toEqual({ tone: "problem", text: "Email sending is not set up here, so nothing was sent." });
  });

  it("says what happened to resend all, and nothing for an unknown value", () => {
    expect(resendNotice({ resentAll: "2-1" })).toEqual({ tone: "problem", text: "Sent 2 again; 1 still did not go." });
    expect(resendNotice({ resentAll: "3-0" })).toEqual({ tone: "ok", text: "Sent 3 again." });
    expect(resendNotice({ resent: "x" })).toBeNull();
    expect(resendNotice({ resentAll: "a-b" })).toBeNull();
  });
});
