import { describe, expect, it } from "vitest";
import { securityTxt } from "./security-txt";

const NOW = new Date("2026-09-16T12:00:00.000Z");

describe("securityTxt", () => {
  it("names the contact, an expiry six months out and the language, one field per line", () => {
    expect(securityTxt({ email: "security@example.com", now: NOW })).toBe(
      [
        "Contact: mailto:security@example.com",
        "Expires: 2027-03-15T12:00:00.000Z",
        "Preferred-Languages: en",
        "",
      ].join("\n"),
    );
  });

  it.each(["", "not-an-email", "a@b.com\nContact: mailto:evil@example.com", "a b@example.com"])(
    "refuses a contact that isn't a single plain address (%j)",
    (email) => {
      expect(() => securityTxt({ email, now: NOW })).toThrow(RangeError);
    },
  );
});
