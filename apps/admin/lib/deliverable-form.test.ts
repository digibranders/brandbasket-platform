import { describe, expect, it } from "vitest";
import { canSendForApproval, parseDeliverableForm } from "@/lib/deliverable-form";

// 20:00 UTC on 27 October is already 28 October in India.
const NOW = new Date("2026-10-27T20:00:00Z");
const POST = { kind: "post", title: "  Diwali offer  ", caption: " Sweets for all ", dueOn: "2026-11-02", linkUrl: "https://example.com/offer" };

describe("parseDeliverableForm", () => {
  it("reads a post, trims the text and takes the service from the kind", () => {
    expect(parseDeliverableForm(POST, NOW)).toEqual({
      success: true,
      data: { kind: "post", service: "social", title: "Diwali offer", caption: "Sweets for all", dueOn: "2026-11-02", linkUrl: "https://example.com/offer" },
    });
  });

  it("ignores the caption of a page, belongs to Search, and defaults the date to today in India", () => {
    expect(parseDeliverableForm({ ...POST, kind: "page", dueOn: "", linkUrl: "" }, NOW)).toEqual({
      success: true,
      data: { kind: "page", service: "search", title: "Diwali offer", caption: null, dueOn: "2026-10-28", linkUrl: null },
    });
    expect(parseDeliverableForm({ ...POST, kind: "listing", dueOn: "2026-12-01" }, NOW)).toMatchObject({ success: true, data: { service: "search", caption: null, dueOn: "2026-12-01" } });
  });

  it("refuses an unknown kind", () => {
    expect(parseDeliverableForm({ ...POST, kind: "video" }, NOW)).toMatchObject({ success: false });
    expect(parseDeliverableForm({ ...POST, kind: undefined as unknown as string }, NOW)).toMatchObject({ success: false });
  });

  it("holds the title to 3 to 140 characters after trimming", () => {
    expect(parseDeliverableForm({ ...POST, title: " ab " }, NOW)).toMatchObject({ success: false, message: expect.stringContaining("title") });
    expect(parseDeliverableForm({ ...POST, title: "x".repeat(141) }, NOW)).toMatchObject({ success: false, message: expect.stringContaining("title") });
    expect(parseDeliverableForm({ ...POST, title: "x".repeat(140) }, NOW)).toMatchObject({ success: true });
  });

  it("holds the caption of a post to 600 characters, and an empty one becomes null", () => {
    expect(parseDeliverableForm({ ...POST, caption: "x".repeat(601) }, NOW)).toMatchObject({ success: false, message: expect.stringContaining("caption") });
    expect(parseDeliverableForm({ ...POST, caption: "x".repeat(600) }, NOW)).toMatchObject({ success: true });
    expect(parseDeliverableForm({ ...POST, caption: "  " }, NOW)).toMatchObject({ success: true, data: { caption: null } });
  });

  it("needs a real date for a post and refuses an impossible one for any kind", () => {
    expect(parseDeliverableForm({ ...POST, dueOn: "" }, NOW)).toMatchObject({ success: false, message: expect.stringContaining("date") });
    expect(parseDeliverableForm({ ...POST, dueOn: "2026-02-30" }, NOW)).toMatchObject({ success: false });
    expect(parseDeliverableForm({ ...POST, dueOn: "02/11/2026" }, NOW)).toMatchObject({ success: false });
    expect(parseDeliverableForm({ ...POST, kind: "page", dueOn: "2026-13-01" }, NOW)).toMatchObject({ success: false });
  });

  it("takes an empty link or an https one up to 500 characters", () => {
    expect(parseDeliverableForm({ ...POST, linkUrl: "http://example.com" }, NOW)).toMatchObject({ success: false, message: expect.stringContaining("https://") });
    expect(parseDeliverableForm({ ...POST, linkUrl: "https://exa mple.com" }, NOW)).toMatchObject({ success: false });
    expect(parseDeliverableForm({ ...POST, linkUrl: `https://example.com/${"x".repeat(481)}` }, NOW)).toMatchObject({ success: false });
    expect(parseDeliverableForm({ ...POST, linkUrl: `https://example.com/${"x".repeat(480)}` }, NOW)).toMatchObject({ success: true });
  });
});

describe("canSendForApproval", () => {
  const GOOD = { caption: "Sweets for all", hasPicture: false, dueOn: "2026-10-28" };

  it("passes a post with a caption and today or a later date, or with a picture alone", () => {
    expect(canSendForApproval(GOOD, NOW)).toBeNull();
    expect(canSendForApproval({ caption: null, hasPicture: true, dueOn: "2026-12-01" }, NOW)).toBeNull();
  });

  it("gives a reason for no content, no date and a date that has passed", () => {
    expect(canSendForApproval({ ...GOOD, caption: "  " }, NOW)).toMatch(/caption or a picture/);
    expect(canSendForApproval({ ...GOOD, dueOn: null }, NOW)).toMatch(/due date/);
    expect(canSendForApproval({ ...GOOD, dueOn: "2026-10-27" }, NOW)).toMatch(/passed/);
  });
});
