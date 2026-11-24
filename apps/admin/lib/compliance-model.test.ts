import type { StoredBreach, StoredPrivacyRequest } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { breachRow, closureRows, complianceClocks, privacyCounts, privacyRow, privacySteps, sortBreaches, sortPrivacy } from "./compliance-model";
import { clockTone } from "./deadline-clock";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const HOUR = 3_600_000;
const at = (hours: number): Date => new Date(NOW.getTime() + hours * HOUR);

function request(over: Partial<StoredPrivacyRequest>): StoredPrivacyRequest {
  return {
    id: "r1",
    reference: "PR-1",
    kind: "access",
    channel: "email",
    subjectName: null,
    subjectContact: "a@example.com",
    subjectUserId: null,
    details: null,
    status: "received",
    identityVerifiedAt: null,
    receivedAt: at(-24),
    dueAt: at(24 * 29),
    handledBy: null,
    closedAt: null,
    outcome: null,
    resolution: null,
    reminderStage: 0,
    ...over,
  } as StoredPrivacyRequest;
}

function breach(over: Partial<StoredBreach>): StoredBreach {
  return { id: "b1", detectedAt: at(-1), reportedCertInAt: null, reportedBoardAt: null, peopleNotifiedAt: null, summary: "s", dataCategories: [], status: "open", recordedBy: "u", createdAt: at(-1), ...over };
}

const labels = { access: "Access" };
const outcomes = { fulfilled: "Done as asked", refused: "Refused", withdrawn: "Withdrawn by the person" } as const;
const row = (over: Partial<StoredPrivacyRequest>) => privacyRow(request(over), NOW, labels, outcomes);

describe("clockTone", () => {
  it("is late at the deadline, soon inside 72 hours, ok beyond", () => {
    expect(clockTone(at(0), NOW)).toBe("late");
    expect(clockTone(at(-5), NOW)).toBe("late");
    expect(clockTone(at(71), NOW)).toBe("soon");
    expect(clockTone(at(72), NOW)).toBe("ok");
  });
});

describe("sortPrivacy", () => {
  it("puts the most overdue first, then later ones, then closed ones", () => {
    const rows = [
      row({ id: "later", dueAt: at(100) }),
      row({ id: "closed", status: "closed", closedAt: at(-2), dueAt: at(50), outcome: "fulfilled", resolution: "done" }),
      row({ id: "overdue", dueAt: at(-48) }),
      row({ id: "soon", dueAt: at(10) }),
    ];
    expect(sortPrivacy(rows).map((entry) => entry.id)).toEqual(["overdue", "soon", "later", "closed"]);
  });
});

describe("privacyRow and privacyCounts", () => {
  it("words the clock and counts late and soon among the open ones", () => {
    const rows = [row({ id: "a", dueAt: at(-52) }), row({ id: "b", dueAt: at(30) }), row({ id: "c", status: "closed", closedAt: at(-1), dueAt: at(5), outcome: "refused", resolution: "x" })];
    expect(rows[0]?.clockText).toBe("02d 04h overdue");
    expect(rows[2]).toMatchObject({ clockText: "Closed in time", tone: null, outcomeText: "Refused" });
    expect(privacyCounts(rows)).toEqual({ open: 2, closed: 1, late: 1, soon: 1 });
  });

  it("marks a request closed after its due date as closed late", () => {
    expect(row({ status: "closed", dueAt: at(-10), closedAt: at(-1) })).toMatchObject({ clockText: "Closed late", closedLate: true });
  });
});

describe("privacySteps", () => {
  it("offers the next moves and never an owner step", () => {
    expect(privacySteps({ status: "received", identityVerifiedAt: null }).map((step) => step.doValue)).toEqual(["verifying", "identity_checked"]);
    expect(privacySteps({ status: "verifying", identityVerifiedAt: at(-1) }).map((step) => step.doValue)).toEqual(["in_progress"]);
    expect(privacySteps({ status: "in_progress", identityVerifiedAt: at(-1) })).toEqual([]);
    expect(privacySteps({ status: "closed", identityVerifiedAt: null })).toEqual([]);
  });
});

describe("breaches", () => {
  it("shows an overdue CERT-In report and its clock, and puts it first", () => {
    const late = breachRow(breach({ id: "late", detectedAt: at(-7) }), NOW);
    const fresh = breachRow(breach({ id: "fresh", detectedAt: at(-1) }), NOW);
    const closed = breachRow(breach({ id: "closed", status: "closed", detectedAt: at(-200) }), NOW);
    expect(late.duties[0]).toMatchObject({ stateWord: "Overdue", worry: true, clockText: "1h 00m overdue", tone: "late" });
    expect(fresh.duties[0]).toMatchObject({ stateWord: "Due", clockText: "5h 00m left", tone: "soon" });
    expect(late.duties[2]).toMatchObject({ stateWord: "Owed without delay", clockText: null });
    expect(sortBreaches([closed, fresh, late]).map((entry) => entry.id)).toEqual(["late", "fresh", "closed"]);
  });
});

describe("complianceClocks", () => {
  it("lists running clocks across both registers, the most overdue first, and skips reported and closed ones", () => {
    const strip = complianceClocks(
      [request({ id: "p", reference: "PR-9", dueAt: at(-52) }), request({ id: "done", status: "closed", closedAt: at(-1) })],
      [breach({ id: "x", detectedAt: at(-7) }), breach({ id: "y", detectedAt: at(-1), reportedCertInAt: at(-0.5) }), breach({ id: "z", status: "closed" })],
      NOW,
    );
    expect(strip.items.map((item) => item.label)).toEqual(["Privacy request PR-9", "Breach, CERT-In report", "Breach, Board report", "Breach, Board report"]);
    expect(strip.items[0]).toMatchObject({ text: "02d 04h overdue", tone: "late" });
    expect(strip.running).toBe(4);
  });

  it("is empty when nothing is running", () => {
    expect(complianceClocks([], [], NOW)).toEqual({ items: [], running: 0 });
  });
});

describe("closureRows", () => {
  it("sorts by erase date, names the business and counts whole days left", () => {
    const names = new Map([["b2", { name: "Asha Sweets", ownerName: "Asha" }]]);
    const rows = closureRows(
      [
        { businessId: "b1", requestedAt: at(-24), eraseAfter: at(24 * 20) },
        { businessId: "b2", requestedAt: at(-24), eraseAfter: at(24 * 4 - 2) },
      ],
      names,
      NOW,
    );
    expect(rows.map((entry) => [entry.name, entry.daysLeft])).toEqual([["Asha Sweets", 4], ["b1", 20]]);
    expect(rows[0]?.ownerName).toBe("Asha");
  });
});
