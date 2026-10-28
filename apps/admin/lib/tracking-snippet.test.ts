import { describe, expect, it } from "vitest";
import { trackingSnippet } from "./tracking-snippet";

describe("trackingSnippet", () => {
  it("is one deferred script tag naming the script on the app's address and the business's key", () => {
    expect(trackingSnippet({ appOrigin: "https://app.brandbasket.in", key: "bbk_abcdefghijklmnop" })).toBe(
      '<script defer src="https://app.brandbasket.in/t/v1.js" data-key="bbk_abcdefghijklmnop"></script>',
    );
  });

  it("copes with a trailing slash on the address", () => {
    expect(trackingSnippet({ appOrigin: "https://app.brandbasket.in/", key: "bbk_abcdefghijklmnop" })).toContain('src="https://app.brandbasket.in/t/v1.js"');
  });

  it("can mark a site whose forms the server counts", () => {
    expect(trackingSnippet({ appOrigin: "https://app.brandbasket.in", key: "bbk_abcdefghijklmnop", serverForms: true })).toBe(
      '<script defer src="https://app.brandbasket.in/t/v1.js" data-key="bbk_abcdefghijklmnop" data-bb-forms="server"></script>',
    );
  });

  it("refuses a key that is not a site key, so nothing odd is ever pasted into a page", () => {
    expect(() => trackingSnippet({ appOrigin: "https://app.brandbasket.in", key: '"><script>x' })).toThrow(RangeError);
  });
});
