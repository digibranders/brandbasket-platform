import { describe, expect, it, vi } from "vitest";
import { openSecret, sealSecret } from "./secret-seal";

vi.mock("server-only", () => ({}));

const SECRET = "a-secret-of-at-least-thirty-two-characters!!";
const URL_TEXT = "https://prod-12.centralindia.logic.azure.com/workflows/abc?sig=hush";

describe("sealed secrets", () => {
  it("opens what was sealed, and never holds the text in the clear", () => {
    const sealed = sealSecret(SECRET, URL_TEXT);
    expect(sealed).not.toContain("logic.azure.com");
    expect(sealed).not.toContain("hush");
    expect(openSecret(SECRET, sealed)).toBe(URL_TEXT);
  });

  it("seals the same text differently every time", () => {
    expect(sealSecret(SECRET, URL_TEXT)).not.toBe(sealSecret(SECRET, URL_TEXT));
  });

  it("will not open with another secret, after a change, or for text that was never sealed", () => {
    const sealed = sealSecret(SECRET, URL_TEXT);
    expect(openSecret("another-secret-of-at-least-thirty-two-chars", sealed)).toBeNull();
    const [version, payload] = sealed.split(".");
    expect(openSecret(SECRET, `${version}.${payload?.slice(0, -2)}AA`)).toBeNull();
    expect(openSecret(SECRET, "https://prod-12.centralindia.logic.azure.com/x")).toBeNull();
    expect(openSecret(SECRET, "")).toBeNull();
    expect(openSecret(SECRET, "v1.")).toBeNull();
  });
});
