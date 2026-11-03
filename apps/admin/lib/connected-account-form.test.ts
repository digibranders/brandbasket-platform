import { describe, expect, it } from "vitest";
import { parseAccountForm } from "@/lib/connected-account-form";

const TODAY = "2026-11-03";
const GOOD = { platform: "instagram", handle: " @apex ", url: "https://instagram.com/apex", status: "connected", checkedOn: "2026-11-02" };

describe("parseAccountForm", () => {
  it("reads a full account, trimming the handle and putting the check at noon in India", () => {
    expect(parseAccountForm(GOOD, TODAY)).toEqual({
      success: true,
      data: { platform: "instagram", handle: "@apex", url: "https://instagram.com/apex", status: "connected", checkedAt: new Date("2026-11-02T06:30:00.000Z") },
    });
  });

  it("keeps blank handle, link and date as null", () => {
    expect(parseAccountForm({ platform: "x", handle: "  ", url: "", status: "not_connected", checkedOn: "" }, TODAY)).toEqual({
      success: true,
      data: { platform: "x", handle: null, url: null, status: "not_connected", checkedAt: null },
    });
  });

  it("refuses an unknown platform or status", () => {
    expect(parseAccountForm({ ...GOOD, platform: "tiktok" }, TODAY)).toMatchObject({ success: false, field: "platform" });
    expect(parseAccountForm({ ...GOOD, status: "fine" }, TODAY)).toMatchObject({ success: false, field: "status" });
  });

  it("refuses a link that is not https, or javascript", () => {
    expect(parseAccountForm({ ...GOOD, url: "http://instagram.com/apex" }, TODAY)).toMatchObject({ success: false, field: "url" });
    expect(parseAccountForm({ ...GOOD, url: "javascript:alert(1)" }, TODAY)).toMatchObject({ success: false, field: "url" });
    expect(parseAccountForm({ ...GOOD, url: `https://example.com/${"a".repeat(500)}` }, TODAY)).toMatchObject({ success: false, field: "url" });
  });

  it("refuses a handle over 120 characters, a date that is not real and a date in the future", () => {
    expect(parseAccountForm({ ...GOOD, handle: "h".repeat(121) }, TODAY)).toMatchObject({ success: false, field: "handle" });
    expect(parseAccountForm({ ...GOOD, checkedOn: "2026-02-30" }, TODAY)).toMatchObject({ success: false, field: "checkedOn" });
    expect(parseAccountForm({ ...GOOD, checkedOn: "1999-01-01" }, TODAY)).toMatchObject({ success: false, field: "checkedOn" });
    expect(parseAccountForm({ ...GOOD, checkedOn: "2026-11-04" }, TODAY)).toEqual({ success: false, field: "checkedOn", message: "That date is in the future." });
    expect(parseAccountForm({ ...GOOD, checkedOn: TODAY }, TODAY)).toMatchObject({ success: true });
  });
});
