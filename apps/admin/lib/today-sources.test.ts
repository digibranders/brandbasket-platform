import type { ClientSummary, OpenClosure, StoredBreach, StoredPrivacyRequest } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { breachReportsDue, closuresErasingSoon, privacyRequestsDue, reportsToReview, silentPreviews } from "./today-sources";

// 11:30 on Monday 30 November 2026 in India.
const NOW = new Date("2026-11-30T06:00:00.000Z");

const breach = (values: Partial<StoredBreach>): StoredBreach =>
  ({ id: "b1", status: "open", summary: "s", detectedAt: new Date("2026-11-30T00:00:00.000Z"), reportedCertInAt: null, reportedBoardAt: null, ...values }) as StoredBreach;

describe("privacyRequestsDue", () => {
  it("keeps open requests with their kind in words and drops closed ones", () => {
    const due = new Date("2026-12-20T00:00:00.000Z");
    const open = { id: "p1", reference: "PR-1", kind: "access", status: "received", dueAt: due } as StoredPrivacyRequest;
    const closed = { ...open, id: "p2", status: "closed" } as StoredPrivacyRequest;
    expect(privacyRequestsDue([open, closed])).toEqual([{ id: "p1", reference: "PR-1", kindLabel: expect.any(String), dueAt: due }]);
    expect(privacyRequestsDue([open])[0]?.kindLabel).not.toBe("");
  });
});

describe("breachReportsDue", () => {
  it("owes CERT-In first, six hours after detection", () => {
    expect(breachReportsDue([breach({})])).toEqual([{ id: "b1", summary: "s", duty: "CERT-In", deadline: new Date("2026-11-30T06:00:00.000Z") }]);
  });

  it("owes the Board next, 72 hours after detection, once CERT-In is told", () => {
    const rows = breachReportsDue([breach({ reportedCertInAt: NOW })]);
    expect(rows).toEqual([{ id: "b1", summary: "s", duty: "Data Protection Board", deadline: new Date("2026-12-03T00:00:00.000Z") }]);
  });

  it("owes nothing once both are reported, or when the breach is closed", () => {
    expect(breachReportsDue([breach({ reportedCertInAt: NOW, reportedBoardAt: NOW }), breach({ status: "closed" })])).toEqual([]);
  });
});

describe("closuresErasingSoon", () => {
  const closure = (businessId: string, eraseAfter: string): OpenClosure => ({ businessId, requestedAt: NOW, eraseAfter: new Date(eraseAfter) });

  it("keeps accounts erased within 7 days or already due, with the client's name when it is known", () => {
    const rows = closuresErasingSoon(
      [closure("a", "2026-12-04T00:00:00.000Z"), closure("b", "2026-12-20T00:00:00.000Z"), closure("c", "2026-11-29T00:00:00.000Z")],
      [{ businessId: "a", businessName: "Asha Cafe" }],
      NOW,
    );
    expect(rows.map((row) => [row.businessId, row.businessName])).toEqual([
      ["a", "Asha Cafe"],
      ["c", "An account"],
    ]);
  });
});

describe("reportsToReview", () => {
  it("counts drafts and approved reports, not held ones, and is due at the end of the 5th", () => {
    expect(reportsToReview([{ state: "draft" }, { state: "approved" }, { state: "held" }], NOW)).toEqual({ count: 2, dueAt: new Date("2026-11-05T18:30:00.000Z") });
  });

  it("is null when nothing waits", () => {
    expect(reportsToReview([{ state: "held" }], NOW)).toBeNull();
    expect(reportsToReview([], NOW)).toBeNull();
  });
});

describe("silentPreviews", () => {
  const client = (id: string, status: string, sentAt: string | null): ClientSummary =>
    ({ businessId: id, businessName: id, project: { status, previewSentAt: sentAt === null ? null : new Date(sentAt) } }) as unknown as ClientSummary;

  it("needs a preview waiting on the customer, sent 5 or more whole days ago", () => {
    const rows = silentPreviews(
      [client("silent", "preview", "2026-11-25T06:00:00.000Z"), client("fresh", "preview", "2026-11-26T06:00:00.000Z"), client("revising", "revisions", "2026-11-01T06:00:00.000Z"), client("unsent", "preview", null)],
      NOW,
    );
    expect(rows).toEqual([{ businessId: "silent", businessName: "silent", sentAt: new Date("2026-11-25T06:00:00.000Z"), days: 5 }]);
  });
});
