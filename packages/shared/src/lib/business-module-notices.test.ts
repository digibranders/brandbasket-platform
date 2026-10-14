import { describe, expect, it } from "vitest";
import {
  BUSINESS_MODULE_NOTICES,
  businessModuleNoticeHref,
  readBusinessModuleNotice,
  type BusinessModuleNotice,
} from "./business-module-notices";

describe("business module notices", () => {
  it("round-trips every notice through the page's query string, and points at the Features section", () => {
    for (const notice of Object.keys(BUSINESS_MODULE_NOTICES) as BusinessModuleNotice[]) {
      const href = businessModuleNoticeHref("0192f3c4-1111-7000-8000-000000000001", notice);
      expect(href.endsWith("#features")).toBe(true);
      const url = new URL(href, "http://admin.localhost");
      expect(readBusinessModuleNotice(url.searchParams.get("features") ?? undefined)).toBe(notice);
      expect(url.hash).toBe("#features");
    }
  });

  it.each([undefined, "", "toString", "__proto__", "<script>", ["zone-saved", "zone-saved"]])(
    "ignores anything else (%s)",
    (value) => {
      expect(readBusinessModuleNotice(value)).toBeNull();
    },
  );

  it("marks the module and zone changes as successes, and the problem notices as failures", () => {
    expect(Object.entries(BUSINESS_MODULE_NOTICES).filter(([, notice]) => notice.ok).map(([key]) => key)).toEqual([
      "zone-saved",
      "zone-cleared",
      "module-on",
      "module-off",
    ]);
  });

  it("refuses to clear the time zone while a module is on with a dedicated notice", () => {
    expect(BUSINESS_MODULE_NOTICES["zone-in-use"]).toEqual({
      text: "Switch appointments off before clearing the time zone.",
      ok: false,
    });
  });
});
