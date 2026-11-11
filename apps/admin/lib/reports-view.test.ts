import { describe, expect, it } from "vitest";
import { monthLabel, reportNotice, REPORT_STATE_LABELS, serviceTitle } from "./reports-view";

describe("reports view", () => {
  it("words a month and leaves a stray value alone", () => {
    expect(monthLabel("2026-10-01")).toBe("October 2026");
    expect(monthLabel("2026-10-15")).toBe("2026-10-15");
  });

  it("names the services as the customer app does", () => {
    expect(serviceTitle("social")).toBe("Social & Ads");
    expect(serviceTitle("search")).toBe("Local SEO + AEO");
  });

  it("marks an approved report that was never sent as a problem", () => {
    expect(REPORT_STATE_LABELS.approved.tone).toBe("problem");
    expect(REPORT_STATE_LABELS.sent.label).toBe("Sent");
  });

  it("tells staff what happened to the owner's email", () => {
    expect(reportNotice("sent.sent")).toEqual({ tone: "ok", text: "The report is sent. The owner has been emailed." });
    expect(reportNotice("sent.owner-turned-off")?.text).toContain("turned off report emails");
    expect(reportNotice("sent.failed")?.tone).toBe("problem");
    expect(reportNotice("held")?.tone).toBe("ok");
    expect(reportNotice("nonsense")).toBeNull();
    expect(reportNotice(undefined)).toBeNull();
  });

  it("has no em or en dash in anything staff read", () => {
    const words = ["sent.sent", "sent.owner-turned-off", "sent.already-sent", "sent.no-address", "sent.failed", "held", "released", "not-allowed", "changed", "not-found", "send-failed"].map((done) => reportNotice(done)?.text ?? "");
    expect(words.join(" ")).not.toMatch(/[–—]/);
  });
});
