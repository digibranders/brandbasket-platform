import { describe, expect, it, vi } from "vitest";
import { accountLabel } from "./account-label";

vi.mock("server-only", () => ({}));

describe("accountLabel", () => {
  it("shows the number an account signs in with, laid out for reading, never its placeholder address", () => {
    expect(accountLabel({ email: "919820011223@phone.fynix.invalid", phone: "+919820011223" })).toBe("+91 98200 11223");
  });

  it("shows the email of an account that signs in with one", () => {
    expect(accountLabel({ email: "owner@example.com", phone: null })).toBe("owner@example.com");
  });
});
