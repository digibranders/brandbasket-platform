import { describe, expect, it } from "vitest";
import { safeExternalHref } from "./safe-link";

describe("safeExternalHref", () => {
  it("links an https URL, normalised", () => {
    expect(safeExternalHref("https://g.page/bloom")).toBe("https://g.page/bloom");
    expect(safeExternalHref("https://Example.com")).toBe("https://example.com/");
  });

  it("refuses every other scheme and anything that is not a URL", () => {
    for (const value of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com",
      "vbscript:msgbox(1)",
      "//evil.example",
      "/relative",
      "example.com",
      "",
    ]) {
      expect(safeExternalHref(value), value).toBeNull();
    }
  });
});
