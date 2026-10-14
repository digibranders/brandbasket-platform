import { describe, expect, it } from "vitest";
import { EMAIL_FORMAT_MESSAGE, optionalEmail, requiredEmail } from "./contact";

function firstMessage(result: { success: boolean; error?: { issues: readonly { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message;
}

describe("requiredEmail", () => {
  const email = requiredEmail("Enter an email address.");

  it("says what is missing when blank", () => {
    expect(firstMessage(email.safeParse(""))).toBe("Enter an email address.");
  });

  it("normalises case and spacing", () => {
    expect(email.parse(" Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("rejects addresses that only look like addresses", () => {
    expect(firstMessage(email.safeParse("owner@example"))).toBe(EMAIL_FORMAT_MESSAGE);
  });
});

describe("optionalEmail", () => {
  it("turns a blank into null", () => {
    expect(optionalEmail.parse("")).toBeNull();
  });

  it("still checks anything typed", () => {
    expect(optionalEmail.parse("Hello@Shop.in")).toBe("hello@shop.in");
    expect(optionalEmail.safeParse("hello@").success).toBe(false);
  });
});
