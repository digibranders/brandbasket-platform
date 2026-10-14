import { describe, expect, it } from "vitest";
import { PRIVACY_REQUEST_FORM_MESSAGES, parsePrivacyRequestClose, parsePrivacyRequestForm, parsePrivacyRequestProgress } from "./privacy-request-form";

const NOW = new Date("2026-11-10T06:00:00.000Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parsePrivacyRequestForm", () => {
  const valid = { kind: "erasure", contact: " meera@example.com ", name: " Meera ", details: " Delete my account. ", channel: "email" };

  it("trims the fields, counts the days from now when no date is given, and sets the due date 30 days on", () => {
    const parsed = parsePrivacyRequestForm(form(valid), NOW);
    expect(parsed).toEqual({
      ok: true,
      input: {
        kind: "erasure",
        channel: "email",
        subjectName: "Meera",
        subjectContact: "meera@example.com",
        details: "Delete my account.",
        receivedAt: NOW,
        dueAt: new Date("2026-12-10T06:00:00.000Z"),
      },
    });
  });

  it("counts the days from the date the request arrived, read as India time", () => {
    const parsed = parsePrivacyRequestForm(form({ ...valid, receivedAt: "2026-11-03T09:30" }), NOW);
    expect(parsed.ok && parsed.input.receivedAt).toEqual(new Date("2026-11-03T04:00:00.000Z"));
    expect(parsed.ok && parsed.input.dueAt).toEqual(new Date("2026-12-03T04:00:00.000Z"));
  });

  it("falls back to the staff channel for anything but email, and leaves empty optional fields null", () => {
    const parsed = parsePrivacyRequestForm(form({ kind: "grievance", contact: "9876543210", channel: "carrier pigeon" }), NOW);
    expect(parsed).toMatchObject({ ok: true, input: { channel: "staff", subjectName: null, details: null } });
  });

  it("says the one thing to put right, and every message it can say is one the page will show", () => {
    const problems = [
      parsePrivacyRequestForm(form({ ...valid, kind: "sell" }), NOW),
      parsePrivacyRequestForm(form({ ...valid, contact: "ab" }), NOW),
      parsePrivacyRequestForm(form({ ...valid, contact: "a".repeat(321) }), NOW),
      parsePrivacyRequestForm(form({ ...valid, name: "n".repeat(201) }), NOW),
      parsePrivacyRequestForm(form({ ...valid, details: "d".repeat(4001) }), NOW),
      parsePrivacyRequestForm(form({ ...valid, receivedAt: "yesterday" }), NOW),
      parsePrivacyRequestForm(form({ ...valid, receivedAt: "2026-11-11T09:30" }), NOW),
    ];
    for (const problem of problems) {
      expect(problem.ok).toBe(false);
      expect(!problem.ok && PRIVACY_REQUEST_FORM_MESSAGES.includes(problem.message)).toBe(true);
    }
    expect(new Set(problems.map((problem) => !problem.ok && problem.message)).size).toBe(7);
  });
});

describe("parsePrivacyRequestProgress", () => {
  it("turns each button into the progress it records, stamping an identity check with the time pressed", () => {
    expect(parsePrivacyRequestProgress(form({ do: "take" }), NOW, "staff-asha")).toEqual({ ok: true, progress: { handledBy: "staff-asha" } });
    expect(parsePrivacyRequestProgress(form({ do: "verifying" }), NOW, "staff-asha")).toEqual({ ok: true, progress: { status: "verifying" } });
    expect(parsePrivacyRequestProgress(form({ do: "identity_checked" }), NOW, "staff-asha")).toEqual({ ok: true, progress: { identityVerifiedAt: NOW, status: "in_progress" } });
    expect(parsePrivacyRequestProgress(form({ do: "in_progress" }), NOW, "staff-asha")).toEqual({ ok: true, progress: { status: "in_progress" } });
  });

  it("refuses closing here, which has its own form, and anything unknown", () => {
    expect(parsePrivacyRequestProgress(form({ do: "closed" }), NOW, "staff-asha")).toEqual({ ok: false });
    expect(parsePrivacyRequestProgress(form({}), NOW, "staff-asha")).toEqual({ ok: false });
  });
});

describe("parsePrivacyRequestClose", () => {
  it("needs how it ended and what was done", () => {
    expect(parsePrivacyRequestClose(form({ outcome: "fulfilled", resolution: " Sent the export. " }))).toEqual({ ok: true, input: { outcome: "fulfilled", resolution: "Sent the export." } });
    for (const bad of [form({ outcome: "ignored", resolution: "x" }), form({ outcome: "refused", resolution: "  " }), form({ outcome: "refused", resolution: "r".repeat(2001) })]) {
      const parsed = parsePrivacyRequestClose(bad);
      expect(parsed.ok).toBe(false);
      expect(!parsed.ok && PRIVACY_REQUEST_FORM_MESSAGES.includes(parsed.message)).toBe(true);
    }
  });
});
