import { describe, expect, it } from "vitest";
import {
  formatTimingWindow,
  isCalendlyUrl,
  kickoffMeetingLink,
  readInviteeUri,
  readSetupCallUrl,
  SETUP_CALL_URL_PROBLEMS,
} from "./setup-call-link";

describe("readSetupCallUrl", () => {
  it("keeps a secure booking address, trimmed", () => {
    expect(readSetupCallUrl("  https://calendly.com/brandbasket/setup-call  ")).toEqual({ ok: true, url: "https://calendly.com/brandbasket/setup-call" });
    expect(readSetupCallUrl("https://cal.com/team/brandbasket?month=2026-11")).toEqual({ ok: true, url: "https://cal.com/team/brandbasket?month=2026-11" });
  });

  it("clears the link when nothing is typed", () => {
    expect(readSetupCallUrl("")).toEqual({ ok: true, url: null });
    expect(readSetupCallUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("refuses text that is not a web address", () => {
    for (const text of ["calendly", "calendly.com/brandbasket", "not a link", "https://localhost/x"]) {
      expect(readSetupCallUrl(text)).toEqual({ ok: false, problem: "not-a-web-address" });
    }
  });

  it("refuses an address that is not https, or that runs a script", () => {
    expect(readSetupCallUrl("http://calendly.com/brandbasket")).toEqual({ ok: false, problem: "not-secure" });
    expect(readSetupCallUrl("javascript:alert(1)")).toEqual({ ok: false, problem: "not-a-web-address" });
    expect(readSetupCallUrl("ftp://calendly.com/brandbasket")).toEqual({ ok: false, problem: "not-a-web-address" });
  });

  it("refuses a link with a login in it, and one that is too long", () => {
    expect(readSetupCallUrl("https://user:pass@calendly.com/brandbasket")).toEqual({ ok: false, problem: "has-a-login" });
    expect(readSetupCallUrl(`https://calendly.com/${"a".repeat(300)}`)).toEqual({ ok: false, problem: "too-long" });
  });

  it("says what is wrong in plain words, with no dashes or exclamation marks", () => {
    for (const message of Object.values(SETUP_CALL_URL_PROBLEMS)) expect(message).not.toMatch(/[!\u2014\u2013]/);
  });
});

describe("isCalendlyUrl", () => {
  it.each(["https://calendly.com/steve-brandbasket/30min", "https://www.calendly.com/steve-brandbasket/30min", "https://team.calendly.com/x"])("accepts %s", (address) => {
    expect(isCalendlyUrl(address)).toBe(true);
  });

  it.each(["http://calendly.com/x", "https://calendly.com.evil.example/x", "https://evilcalendly.com/x", "https://cal.com/x", "calendly.com/x", ""])("refuses %s", (address) => {
    expect(isCalendlyUrl(address)).toBe(false);
  });
});

describe("readInviteeUri", () => {
  it("keeps a Calendly API address", () => {
    expect(readInviteeUri("https://api.calendly.com/scheduled_events/AB/invitees/CD")).toBe("https://api.calendly.com/scheduled_events/AB/invitees/CD");
  });

  it.each([null, undefined, 42, "", "http://api.calendly.com/x", "https://calendly.com/x", "https://api.calendly.com.evil.example/x", "https://user:pw@api.calendly.com/x", `https://api.calendly.com/${"a".repeat(300)}`])(
    "drops %s",
    (value) => {
      expect(readInviteeUri(value)).toBeNull();
    },
  );
});

describe("kickoffMeetingLink", () => {
  it("resolves Cal.com booking API link to Cal.com video URL", () => {
    expect(kickoffMeetingLink("https://api.cal.com/v2/bookings/cal_uid_123")).toBe("https://app.cal.com/video/cal_uid_123");
    expect(kickoffMeetingLink("https://api.cal.com/v1/bookings/legacy_456")).toBe("https://app.cal.com/video/legacy_456");
    expect(kickoffMeetingLink("https://api.cal.com/bookings/simple_789")).toBe("https://app.cal.com/video/simple_789");
  });

  it("preserves direct video meeting links", () => {
    expect(kickoffMeetingLink("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(kickoffMeetingLink("https://us04web.zoom.us/j/123456789")).toBe("https://us04web.zoom.us/j/123456789");
    expect(kickoffMeetingLink("https://zoom.us/j/987654321")).toBe("https://zoom.us/j/987654321");
    expect(kickoffMeetingLink("https://app.cal.com/video/live_room")).toBe("https://app.cal.com/video/live_room");
    expect(kickoffMeetingLink("https://teams.microsoft.com/l/meetup-join/19%3ameeting")).toBe("https://teams.microsoft.com/l/meetup-join/19%3ameeting");
    expect(kickoffMeetingLink("https://company.whereby.com/team-room")).toBe("https://company.whereby.com/team-room");
  });

  it("uses fallbackUrl when inviteeUri is not a video link", () => {
    expect(kickoffMeetingLink("https://api.calendly.com/scheduled_events/123/invitees/456", "https://meet.google.com/fallback-room")).toBe("https://meet.google.com/fallback-room");
    expect(kickoffMeetingLink(null, "https://meet.google.com/fallback-room")).toBe("https://meet.google.com/fallback-room");
    expect(kickoffMeetingLink("", "https://meet.google.com/fallback-room")).toBe("https://meet.google.com/fallback-room");
    expect(kickoffMeetingLink(undefined, "https://api.cal.com/v2/bookings/from_fallback")).toBe("https://app.cal.com/video/from_fallback");
  });

  it("returns null when neither inviteeUri nor fallbackUrl yields a video link", () => {
    expect(kickoffMeetingLink(null)).toBeNull();
    expect(kickoffMeetingLink("")).toBeNull();
    expect(kickoffMeetingLink("https://api.calendly.com/scheduled_events/123/invitees/456")).toBeNull();
    expect(kickoffMeetingLink("https://api.calendly.com/scheduled_events/123/invitees/456", null)).toBeNull();
    expect(kickoffMeetingLink("not-a-link", "not-a-fallback")).toBeNull();
  });

  it("refuses links with credentials or insecure protocols", () => {
    expect(kickoffMeetingLink("http://meet.google.com/abc-defg-hij")).toBeNull();
    expect(kickoffMeetingLink("https://user:pass@meet.google.com/abc")).toBeNull();
    expect(kickoffMeetingLink(null, "http://meet.google.com/abc")).toBeNull();
  });
});

describe("formatTimingWindow", () => {
  it("formats start and end moments into exact timing window", () => {
    const startsAt = new Date("2026-11-14T10:00:00.000Z"); // 3:30 PM IST
    const endsAt = new Date("2026-11-14T10:30:00.000Z"); // 4:00 PM IST
    expect(formatTimingWindow(startsAt, endsAt)).toBe("3:30 PM to 4:00 PM");
  });

  it("formats single moment when endsAt is null", () => {
    const startsAt = new Date("2026-11-14T10:00:00.000Z"); // 3:30 PM IST
    expect(formatTimingWindow(startsAt, null)).toBe("3:30 PM");
  });

  it("handles invalid dates gracefully", () => {
    expect(formatTimingWindow(new Date("invalid"), null)).toBe("");
  });
});

