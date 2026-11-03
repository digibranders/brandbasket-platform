import { describe, expect, it } from "vitest";
import { emailHint } from "./email-hint";

describe("emailHint", () => {
  it("keeps the first letter and the domain, and hides the rest of the name", () => {
    expect(emailHint("meera.shah@example.com")).toBe("m•••@example.com");
  });

  it("hides a very short name entirely", () => {
    expect(emailHint("ab@example.com")).toBe("•••@example.com");
  });

  it("splits at the last @, so the domain is always the real one", () => {
    expect(emailHint('"a@b"@example.com')).toBe('"•••@example.com');
  });

  it("shows nothing of an address that is not one", () => {
    expect(emailHint("no-at-sign")).toBe("•••");
  });
});
