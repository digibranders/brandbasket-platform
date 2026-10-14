import { describe, expect, it, vi } from "vitest";
import { listOpenPrivacyRequests, markPrivacyRequestsReminded, type Database, type StoredPrivacyRequest } from "@firstfold/db";
import type { EmailMessage, EmailTransport } from "@firstfold/email";
import { dueDayWords, privacyAlertRecipient, privacyRequestsConsoleUrl, sendNewPrivacyRequestAlert, sendPrivacyRequestReminders } from "./privacy-request-alerts";

vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return { PRIVACY_REQUEST_KIND_LABELS: actual.PRIVACY_REQUEST_KIND_LABELS, listOpenPrivacyRequests: vi.fn(), markPrivacyRequestsReminded: vi.fn(async () => 1) };
});

const DAY = 24 * 60 * 60 * 1000;
const RECEIVED = new Date("2026-11-01T06:00:00.000Z");
const at = (days: number): Date => new Date(RECEIVED.getTime() + days * DAY);
const db = {} as Database;
const ADMIN = "https://admin.firstfold.io";

function stored(overrides: Partial<StoredPrivacyRequest> = {}): StoredPrivacyRequest {
  return {
    id: "r1",
    reference: "PR-7K2M9QXD",
    kind: "erasure",
    channel: "web",
    subjectName: "Meera Rao",
    subjectContact: "+919876543210",
    subjectUserId: null,
    details: "Delete my account.",
    status: "received",
    identityVerifiedAt: RECEIVED,
    receivedAt: RECEIVED,
    dueAt: at(30),
    handledBy: null,
    closedAt: null,
    outcome: null,
    resolution: null,
    reminderStage: 0,
    ...overrides,
  };
}

function transport(): { readonly send: ReturnType<typeof vi.fn<(message: EmailMessage) => Promise<void>>>; readonly asTransport: EmailTransport } {
  const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);
  return { send, asTransport: { send } as unknown as EmailTransport };
}

describe("privacyAlertRecipient", () => {
  it("prefers the privacy mailbox, then the support alert mailbox, then the team address, then support@firstfold.io", () => {
    expect(privacyAlertRecipient({ PRIVACY_ALERT_EMAIL: " grievance@firstfold.io ", SUPPORT_ALERT_EMAIL: "s@firstfold.io" })).toBe("grievance@firstfold.io");
    expect(privacyAlertRecipient({ SUPPORT_ALERT_EMAIL: "s@firstfold.io", FIRSTFOLD_TEAM_EMAIL: "t@firstfold.io" })).toBe("s@firstfold.io");
    expect(privacyAlertRecipient({ FIRSTFOLD_TEAM_EMAIL: "t@firstfold.io" })).toBe("t@firstfold.io");
    expect(privacyAlertRecipient({ PRIVACY_ALERT_EMAIL: "  " })).toBe("support@firstfold.io");
    expect(privacyAlertRecipient({ PLATFORM_BRAND: "fynix" })).toBe("hello@fynix.digital");
  });
});

describe("links and dates", () => {
  it("points at the console page and writes a date in India's calendar day", () => {
    expect(privacyRequestsConsoleUrl(ADMIN)).toBe("https://admin.firstfold.io/privacy-requests");
    expect(dueDayWords(new Date("2026-11-30T20:00:00.000Z"))).toBe("1 December 2026");
  });
});

describe("sendNewPrivacyRequestAlert", () => {
  it("sends the reference, kind and due day to the mailbox, and none of what the person wrote", async () => {
    const { send, asTransport } = transport();
    await sendNewPrivacyRequestAlert(asTransport, { reference: "PR-7K2M9QXD", kind: "erasure", dueAt: at(30) }, { to: "support@firstfold.io", adminOrigin: ADMIN });
    const message = send.mock.calls[0]?.[0];
    expect(message?.to).toBe("support@firstfold.io");
    expect(message?.subject).toBe("New privacy request PR-7K2M9QXD (Erasure)");
    expect(message?.bodyText).toContain("https://admin.firstfold.io/privacy-requests");
  });

  it("never throws when the email cannot be sent", async () => {
    const { send, asTransport } = transport();
    send.mockRejectedValueOnce(new Error("mail down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendNewPrivacyRequestAlert(asTransport, { reference: "PR-1", kind: "access", dueAt: at(30) }, { to: "a@b.in", adminOrigin: ADMIN })).resolves.toBeUndefined();
  });
});

describe("sendPrivacyRequestReminders", () => {
  it("sends nothing and records nothing when no open request is near its date", async () => {
    vi.mocked(listOpenPrivacyRequests).mockResolvedValue([stored()]);
    const { send, asTransport } = transport();
    expect(await sendPrivacyRequestReminders(db, asTransport, { to: "a@b.in", adminOrigin: ADMIN, now: at(10) })).toEqual({ listed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(markPrivacyRequestsReminded).not.toHaveBeenCalled();
  });

  it("lists requests at day 20, day 25 and overdue in one email, with no personal data, then records their stages", async () => {
    vi.mocked(listOpenPrivacyRequests).mockClear();
    vi.mocked(listOpenPrivacyRequests).mockResolvedValue([
      stored({ id: "a", reference: "PR-LATE0001", kind: "grievance", receivedAt: at(-40), dueAt: at(-10), reminderStage: 3 }),
      stored({ id: "b", reference: "PR-DAY25002", receivedAt: at(-25), dueAt: at(5), reminderStage: 1 }),
      stored({ id: "c", reference: "PR-DAY20003", kind: "access", receivedAt: at(-20), dueAt: at(10), reminderStage: 0 }),
      stored({ id: "d", reference: "PR-QUIET004", receivedAt: at(-3), dueAt: at(27) }),
    ]);
    const { send, asTransport } = transport();
    expect(await sendPrivacyRequestReminders(db, asTransport, { to: "a@b.in", adminOrigin: ADMIN, now: at(0) })).toEqual({ listed: 3 });

    const message = send.mock.calls[0]?.[0];
    expect(message?.subject).toBe("1 privacy request is overdue (3 need attention)");
    expect(message?.bodyText).toContain("Overdue: PR-LATE0001 (Grievance)");
    expect(message?.bodyText).toContain("Urgent: PR-DAY25002 (Erasure)");
    expect(message?.bodyText).toContain("Reminder: PR-DAY20003 (Access to their data)");
    expect(message?.bodyText).not.toContain("PR-QUIET004");
    expect(message?.bodyText).not.toMatch(/Meera|9876543210|Delete my account/);
    expect(markPrivacyRequestsReminded).toHaveBeenCalledWith(db, [
      { id: "a", stage: 3 },
      { id: "b", stage: 2 },
      { id: "c", stage: 1 },
    ]);
  });

  it("records nothing when the email cannot be sent, so tomorrow's run tries again", async () => {
    vi.mocked(markPrivacyRequestsReminded).mockClear();
    vi.mocked(listOpenPrivacyRequests).mockResolvedValue([stored({ receivedAt: at(-20), dueAt: at(10) })]);
    const { send, asTransport } = transport();
    send.mockRejectedValueOnce(new Error("mail down"));
    await expect(sendPrivacyRequestReminders(db, asTransport, { to: "a@b.in", adminOrigin: ADMIN, now: at(0) })).rejects.toThrow("mail down");
    expect(markPrivacyRequestsReminded).not.toHaveBeenCalled();
  });
});
