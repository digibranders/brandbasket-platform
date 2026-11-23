import { describe, expect, it } from "vitest";
import type { ReportForReview } from "@brandbasket/db";
import { monthLabel, reportNotice, reportPreview, reportReviewWindowOpen, REPORT_STATE_LABELS, sendReportCopy, serviceTitle, toReportRow } from "./reports-view";

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

describe("reports list rows", () => {
  const base = { id: "r-1", businessName: "Green Leaf Cafe", service: "website", month: "2026-10-01", state: "draft", content: { headline: "Visits are up." } } as unknown as ReportForReview;

  it("makes a draft a Review row and an approved report a Retry send row", () => {
    expect(toReportRow(base, null)).toMatchObject({ month: "October 2026", stateLabel: "Draft", chip: "waiting", retry: false, opening: "Visits are up." });
    expect(toReportRow({ ...base, state: "approved" } as ReportForReview, "owner@example.com")).toMatchObject({ stateLabel: "Approved, not sent", chip: "failed", retry: true, ownerEmail: "owner@example.com" });
  });

  it("treats a phone sign-up address as nobody to email, and cuts a long opening line", () => {
    expect(toReportRow({ ...base, state: "approved" } as ReportForReview, "919800000000@phone.brandbasket.invalid").ownerEmail).toBeNull();
    expect(reportPreview({ headline: "x".repeat(200) })).toHaveLength(113);
  });

  it("names the address in the retry confirm, and says when nobody is emailed", () => {
    const named = sendReportCopy({ month: "October 2026", ownerEmail: "owner@example.com", retry: true });
    expect(named.title).toBe("Try sending the October 2026 report to owner@example.com again?");
    expect(named.consequence).toContain("owner@example.com is emailed the PDF now");
    expect(sendReportCopy({ month: "October 2026", ownerEmail: "owner@example.com", retry: false }).title).toBe("Send the October 2026 report to owner@example.com?");
    expect(sendReportCopy({ month: "October 2026", ownerEmail: null, retry: false }).consequence).toContain("nobody is emailed");
    expect(`${named.title}${named.consequence}`).not.toMatch(/[–—]/);
  });
});

describe("reportReviewWindowOpen", () => {
  it("is open from the 1st to the 5th in India time, and whenever a report is unsent", () => {
    expect(reportReviewWindowOpen(new Date("2026-11-01T00:30:00+05:30"), 0)).toBe(true);
    expect(reportReviewWindowOpen(new Date("2026-11-05T23:00:00+05:30"), 0)).toBe(true);
    expect(reportReviewWindowOpen(new Date("2026-11-06T00:10:00+05:30"), 0)).toBe(false);
    expect(reportReviewWindowOpen(new Date("2026-11-20T12:00:00+05:30"), 2)).toBe(true);
  });
});
