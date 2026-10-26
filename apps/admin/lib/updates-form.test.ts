import { describe, expect, it } from "vitest";
import { occurredAtFor, parseUpdateForm } from "@/lib/updates-form";

const TODAY = "2026-11-27";

describe("parseUpdateForm", () => {
  it("takes a service, a title and a date", () => {
    expect(parseUpdateForm({ service: "social", title: "  Ads narrowed to 4 km around the clinic ", date: "2026-11-24" }, TODAY)).toEqual({
      success: true,
      data: { service: "social", title: "Ads narrowed to 4 km around the clinic", occurredOn: "2026-11-24" },
    });
  });

  it("treats a blank service as general and a blank date as today", () => {
    expect(parseUpdateForm({ service: "", title: "Blog post published", date: "" }, TODAY)).toEqual({
      success: true,
      data: { service: null, title: "Blog post published", occurredOn: TODAY },
    });
  });

  it("refuses a short or long title, an unknown service and a bad or future date", () => {
    expect(parseUpdateForm({ service: "", title: "ab", date: "" }, TODAY)).toMatchObject({ success: false });
    expect(parseUpdateForm({ service: "", title: "x".repeat(141), date: "" }, TODAY)).toMatchObject({ success: false });
    expect(parseUpdateForm({ service: "billing", title: "Something happened", date: "" }, TODAY)).toMatchObject({ success: false });
    expect(parseUpdateForm({ service: "", title: "Something happened", date: "2026-02-30" }, TODAY)).toMatchObject({ success: false });
    expect(parseUpdateForm({ service: "", title: "Something happened", date: "2026-11-28" }, TODAY)).toEqual({ success: false, message: "That date is in the future." });
  });
});

describe("occurredAtFor", () => {
  it("is midday in India on that date", () => {
    expect(occurredAtFor("2026-11-24").toISOString()).toBe("2026-11-24T06:30:00.000Z");
  });
});
