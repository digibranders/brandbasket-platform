import { describe, expect, it } from "vitest";
import { changesView, detailRows, inProgressRow, recentChanges, stageChip, versionRows, type RecentChangeSource, type SentChanges, type SentVersion } from "@/lib/website/history";

// Version 1 went out Mon 2 Nov 3:57 pm in India; the customer asked for changes at 4:05 pm; version 2 followed on Wed 4 Nov.
const V1: SentVersion = { version: 1, url: "https://www.example.com/preview", sentAt: new Date("2026-11-02T10:27:00.000Z") };
const V2: SentVersion = { version: 2, url: "https://www.example.com/preview-2", sentAt: new Date("2026-11-04T05:50:00.000Z") };
const ASKED: SentChanges = { ticketId: "ticket-1", round: 1, body: "Update the hero heading", sentAt: new Date("2026-11-02T10:35:00.000Z") };

describe("versionRows", () => {
  it("lists the versions newest first whatever order they arrive in", () => {
    expect(versionRows([V1, V2], [], "preview").map((row) => row.version)).toEqual([2, 1]);
  });

  it("says when each version went out, in India's time, and where it points", () => {
    const [row] = versionRows([V1], [], "preview");
    expect(row).toMatchObject({ version: 1, host: "www.example.com", href: "https://www.example.com/preview", sent: "Mon 2 Nov, 3:57 pm", newest: true });
  });

  it("gives a version the changes were asked on the outcome 'You asked for changes'", () => {
    const rows = versionRows([V1, V2], [ASKED], "preview");
    expect(rows.map((row) => row.outcome)).toEqual([null, "You asked for changes"]);
  });

  it("says the newest version was answered with changes while changes are being made, even when the request cannot be read", () => {
    expect(versionRows([V1], [], "revisions")[0]?.outcome).toBe("You asked for changes");
  });

  it("says the newest version was approved once approved or live, and marks only the live one as live", () => {
    expect(versionRows([V1, V2], [ASKED], "approved").map((row) => [row.outcome, row.live])).toEqual([
      ["You approved it", false],
      ["You asked for changes", false],
    ]);
    expect(versionRows([V1, V2], [ASKED], "live").map((row) => [row.outcome, row.live])).toEqual([
      ["You approved it", true],
      ["You asked for changes", false],
    ]);
  });

  it("gives a version waiting for the customer, or on hold, no outcome", () => {
    expect(versionRows([V1], [], "preview")[0]?.outcome).toBeNull();
    expect(versionRows([V1], [], "on_hold")[0]?.outcome).toBeNull();
  });

  it("gives no link for an address that is not https", () => {
    const [row] = versionRows([{ ...V1, url: "javascript:alert(1)" }], [], "preview");
    expect(row?.href).toBeNull();
    expect(row?.host).toBeNull();
  });

  it("is empty before any preview was sent", () => {
    expect(versionRows([], [], "building")).toEqual([]);
  });
});

describe("inProgressRow", () => {
  it("is the next version number, with the day it is due, only while changes are made", () => {
    expect(inProgressRow([V1], "revisions", "2026-11-04")).toEqual({ version: 2, readyBy: "Wed 4 Nov" });
    expect(inProgressRow([V1, V2], "revisions", null)).toEqual({ version: 3, readyBy: null });
    expect(inProgressRow([], "revisions", null)).toEqual({ version: 1, readyBy: null });
    for (const status of ["building", "preview", "approved", "live", "on_hold", null] as const) expect(inProgressRow([V1], status, "2026-11-04")).toBeNull();
  });
});

describe("changesView", () => {
  it("is null when the customer has sent no changes", () => {
    expect(changesView([], [V1], 2)).toBeNull();
  });

  it("shows the last round of the included rounds, when it was asked, what was written and where to see the request", () => {
    expect(changesView([ASKED], [V1], 2)).toEqual({
      round: 1,
      of: 2,
      asked: "Mon 2 Nov, 4:05 pm",
      text: "Update the hero heading",
      requestHref: "/requests?open=ticket-1",
      doneIn: null,
    });
  });

  it("says which version it was done in once a version was sent after the request", () => {
    expect(changesView([ASKED], [V1, V2], 2)?.doneIn).toBe(2);
  });

  it("takes the newest round when there are several", () => {
    const second: SentChanges = { ticketId: "ticket-2", round: 2, body: "Change the logo", sentAt: new Date("2026-11-05T05:00:00.000Z") };
    expect(changesView([ASKED, second], [V1, V2], 2)).toMatchObject({ round: 2, text: "Change the logo", doneIn: null });
  });

  it("never shows a round beyond the rounds included, and leaves out text that could not be read", () => {
    expect(changesView([{ ...ASKED, round: 3, body: null }], [], 2)).toMatchObject({ round: 3, of: 3, text: null });
  });
});

describe("detailRows", () => {
  const base = { live: false, address: null, plannedLaunch: null, launchedAt: null, roundsUsed: 1, roundsIncluded: 2, versionsSent: 2 };

  it("before launch: the plan, an address set before launch, the planned day and the changes used", () => {
    expect(detailRows({ ...base, plannedLaunch: "2026-11-09" })).toEqual([
      { label: "Plan", value: "Managed Website" },
      { label: "Address", value: "Set before launch" },
      { label: "Planned launch", value: "Mon 9 Nov" },
      { label: "Changes used", value: "1 of 2" },
    ]);
  });

  it("leaves out the planned day when there is none to promise", () => {
    expect(detailRows(base).map((row) => row.label)).toEqual(["Plan", "Address", "Changes used"]);
  });

  it("once live: the plan, the address, the day it went live and the versions sent", () => {
    expect(detailRows({ ...base, live: true, address: "www.example.com", launchedAt: new Date("2026-11-09T05:00:00.000Z") })).toEqual([
      { label: "Plan", value: "Managed Website" },
      { label: "Address", value: "www.example.com" },
      { label: "Live since", value: "Mon 9 Nov" },
      { label: "Versions sent", value: "2" },
    ]);
  });
});

describe("stageChip", () => {
  it("gives every stage a word, and the page with nothing to follow none", () => {
    expect(stageChip("revising")).toEqual({ label: "Changes in progress", tone: "info" });
    expect(stageChip("preview")?.label).toBe("Ready to check");
    expect(stageChip("live")).toEqual({ label: "Live", tone: "ok" });
    expect(stageChip("none")).toBeNull();
    for (const kind of ["setup", "kickoff", "building", "paused", "approved"] as const) expect(stageChip(kind)?.label).toBeTruthy();
  });
});

describe("recentChanges", () => {
  const source = (over: Partial<RecentChangeSource> & { readonly kind?: string; readonly state?: string; readonly page?: string | null } = {}): RecentChangeSource => {
    const { kind = "website", state = "in_progress", page = null, ...rest } = over;
    return { ticketId: "t", subject: "Change the heading", ticketStatus: "in_progress", createdAt: new Date("2026-11-02T10:35:00.000Z"), change: { kind, state, page }, ...rest };
  };

  it("words the request's status as Received, In progress or Done", () => {
    const words = (["new", "triaged", "in_progress", "waiting_on_you", "resolved", "closed"] as const).map((ticketStatus) => recentChanges([source({ ticketStatus })])[0]?.word);
    expect(words).toEqual(["Received", "Received", "In progress", "In progress", "Done", "Done"]);
  });

  it("lists only website changes, leaving out questions, other services, and requests that were declined or withdrawn", () => {
    const rows = recentChanges([
      source({ ticketId: "a" }),
      source({ ticketId: "q", change: null }),
      source({ ticketId: "s", kind: "social" }),
      source({ ticketId: "d", state: "declined", ticketStatus: "closed" }),
      source({ ticketId: "w", state: "withdrawn", ticketStatus: "closed" }),
    ]);
    expect(rows.map((row) => row.ticketId)).toEqual(["a"]);
  });

  it("puts the newest asked first, keeps five, and gives the asked time in India", () => {
    const items = Array.from({ length: 7 }, (_, index) => source({ ticketId: `t${index}`, createdAt: new Date(Date.UTC(2026, 10, 1 + index, 4, 35)) }));
    const rows = recentChanges(items);
    expect(rows.map((row) => row.ticketId)).toEqual(["t6", "t5", "t4", "t3", "t2"]);
    expect(rows[0]?.asked).toBe("Sat 7 Nov, 10:05 am");
  });

  it("gives the page the customer named, or null when there is none or it is blank", () => {
    expect(recentChanges([source({ page: " Home " })])[0]?.page).toBe("Home");
    expect(recentChanges([source({ page: "  " })])[0]?.page).toBeNull();
    expect(recentChanges([source({ page: null })])[0]?.page).toBeNull();
  });
});
