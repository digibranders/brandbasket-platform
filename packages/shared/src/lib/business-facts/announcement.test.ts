import { describe, expect, it } from "vitest";
import { activeAnnouncement, type Announcement } from "./announcement";

const announcement: Announcement = { message: "Closed for Diwali", startsOn: "2026-11-08", endsOn: "2026-11-10" };

describe("activeAnnouncement", () => {
  it("is null when there is no announcement", () => {
    expect(activeAnnouncement(null, "2026-11-09")).toBeNull();
  });

  it("shows on the day it starts", () => {
    expect(activeAnnouncement(announcement, "2026-11-08")).toBe(announcement);
  });

  it("shows on the day it ends", () => {
    expect(activeAnnouncement(announcement, "2026-11-10")).toBe(announcement);
  });

  it("shows on a day inside the range", () => {
    expect(activeAnnouncement(announcement, "2026-11-09")).toBe(announcement);
  });

  it("is null the day before it starts", () => {
    expect(activeAnnouncement(announcement, "2026-11-07")).toBeNull();
  });

  it("is null the day after it ends", () => {
    expect(activeAnnouncement(announcement, "2026-11-11")).toBeNull();
  });
});
