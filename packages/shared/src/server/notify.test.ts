import type { ChannelChoices, NotificationRecipient, NotificationRow, RecordedNotification } from "@brandbasket/db";
import type { EmailMessage } from "@brandbasket/email";
import { describe, expect, it, vi } from "vitest";
import { createNotifier, type NotifyDeps, type NotifyStore } from "./notify";
import { createFakePushSender } from "./push-sender";

const BUSINESS = "11111111-1111-4111-8111-111111111111";
const OWNER: NotificationRecipient = { userId: "user-owner", name: "Asha", email: "asha@example.com" };
const PHONE_OWNER: NotificationRecipient = { userId: "user-phone", name: "Ravi", email: null };
const DEFAULTS: ChannelChoices = { bell: true, email: true, push: false };

function setup(options: { recipients?: NotificationRecipient[]; choices?: (userId: string) => Promise<ChannelChoices>; staffEmail?: string | null } = {}) {
  const rows: NotificationRow[] = [];
  const emails: EmailMessage[] = [];
  const errors: { error: unknown; step: string }[] = [];
  const push = createFakePushSender();
  const store: NotifyStore = {
    recipients: vi.fn(async () => options.recipients ?? [OWNER]),
    choices: vi.fn(options.choices ?? (async () => DEFAULTS)),
    record: vi.fn(async (row: NotificationRow): Promise<RecordedNotification> => {
      const seen = rows.find((r) => r.audience === row.audience && r.userId === row.userId && r.dedupeKey === row.dedupeKey);
      if (seen !== undefined) return { id: "existing", created: false };
      rows.push(row);
      return { id: `n${rows.length}`, created: true };
    }),
  };
  const deps: NotifyDeps = {
    store,
    sendEmail: async (message) => {
      emails.push(message);
    },
    push,
    origins: { customer: "https://app.example.test", staff: "https://console.example.test" },
    staffEmail: options.staffEmail === undefined ? "team@example.test" : options.staffEmail,
    onError: (error, context) => errors.push({ error, step: context.step }),
  };
  return { notify: createNotifier(deps), rows, emails, errors, push, store, deps };
}

const CUSTOMER = { kind: "customer", businessId: BUSINESS } as const;

describe("notify, a customer event", () => {
  it("writes the bell row, emails the owner and leaves push off by default", async () => {
    const { notify, rows, emails, push } = setup();
    const result = await notify({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(rows).toEqual([
      expect.objectContaining({
        audience: "customer",
        businessId: BUSINESS,
        userId: "user-owner",
        eventKey: "kickoff.soon",
        title: "Your kickoff call starts at 11:00",
        link: "/help",
        listed: true,
        dedupeKey: "kickoff.soon:call-1",
      }),
    ]);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "asha@example.com", subject: "Your kickoff call starts at 11:00", template: "kickoff-soon" });
    expect(emails[0]?.bodyText).toContain("https://app.example.test/help");
    expect(push.sent).toEqual([]);
    expect(result.failed).toBe(false);
    expect(result.recipients[0]).toMatchObject({ userId: "user-owner", status: "delivered", delivered: ["bell", "email"] });
  });

  it("pushes to a person who turned push on, with an absolute link and the collapse tag", async () => {
    const { notify, push } = setup({ choices: async () => ({ bell: true, email: true, push: true }) });
    await notify({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(push.sent).toEqual([
      { target: { audience: "customer", userId: "user-owner" }, message: { title: "Your kickoff call starts at 11:00", url: "https://app.example.test/help", tag: "kickoff.soon", event: "kickoff.soon" } },
    ]);
  });

  it("skips the channels a person switched off, and keeps only the ledger row when the bell is off", async () => {
    const { notify, rows, emails } = setup({ choices: async () => ({ bell: false, email: false, push: false }) });
    const result = await notify({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(emails).toEqual([]);
    expect(rows).toEqual([expect.objectContaining({ listed: false })]);
    expect(result.recipients[0]?.skipped).toEqual(expect.arrayContaining([{ channel: "bell", reason: "off" }, { channel: "email", reason: "off" }]));
  });

  it("ignores preferences for a mandatory event, even when the lookup would fail", async () => {
    const { notify, rows, emails, store } = setup({
      choices: async () => {
        throw new Error("lookup down");
      },
    });
    const result = await notify({ event: "kickoff.booked", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "Tue 11:00" } });
    expect(store.choices).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(result.failed).toBe(false);
  });

  it("sends a mandatory event even when the person switched the topic off", async () => {
    // billing.payment_failed is mandatory by the owner's answer, although its topic is billing.
    const { notify, store } = setup({ choices: async () => ({ bell: false, email: false, push: false }) });
    await notify({ event: "billing.payment_failed", audience: CUSTOMER, dedupeKey: "p1", data: {} });
    expect(store.choices).not.toHaveBeenCalled();
  });

  it("fails closed on an optional event when the preference cannot be read: nothing is sent or recorded", async () => {
    const { notify, rows, emails, errors } = setup({
      choices: async () => {
        throw new Error("lookup down");
      },
    });
    const result = await notify({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(rows).toEqual([]);
    expect(emails).toEqual([]);
    expect(result.failed).toBe(true);
    expect(result.recipients[0]?.status).toBe("failed");
    expect(errors.map((entry) => entry.step)).toEqual(["preferences"]);
  });

  it("does nothing the second time for the same dedupe key", async () => {
    const { notify, rows, emails, push } = setup({ choices: async () => ({ bell: true, email: true, push: true }) });
    const input = { event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } } as const;
    await notify(input);
    const again = await notify(input);
    expect(rows).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(push.sent).toHaveLength(1);
    expect(again.recipients[0]?.status).toBe("duplicate");
  });

  it("does not repeat an email when the bell is off and the notice is a repeat", async () => {
    const { notify, emails } = setup({ choices: async () => ({ bell: false, email: true, push: false }) });
    const input = { event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } } as const;
    await notify(input);
    await notify(input);
    expect(emails).toHaveLength(1);
  });

  it("keeps the same dedupe key of two different events apart", async () => {
    const { notify, rows } = setup();
    await notify({ event: "kickoff.booked", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    await notify({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(rows.map((row) => row.dedupeKey)).toEqual(["kickoff.booked:call-1", "kickoff.soon:call-1"]);
  });

  it("never throws into the caller when the store fails, and records the failure", async () => {
    const { notify, store, errors } = setup();
    vi.mocked(store.record).mockRejectedValueOnce(new Error("db down"));
    const result = await notify({ event: "kickoff.booked", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(result.failed).toBe(true);
    expect(errors.map((entry) => entry.step)).toEqual(["record"]);
  });

  it("never throws when the recipients cannot be read", async () => {
    const { notify, store, errors } = setup();
    vi.mocked(store.recipients).mockRejectedValueOnce(new Error("db down"));
    const result = await notify({ event: "kickoff.booked", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(result).toMatchObject({ failed: true, recipients: [] });
    expect(errors.map((entry) => entry.step)).toEqual(["recipients"]);
  });

  it("keeps the bell row and the other channels when the email fails", async () => {
    const { notify, rows, deps, errors, push } = setup({ choices: async () => ({ bell: true, email: true, push: true }) });
    const failing = createNotifier({
      ...deps,
      sendEmail: async () => {
        throw new Error("brevo down");
      },
    });
    const result = await failing({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-1", data: { when: "11:00" } });
    expect(rows).toHaveLength(1);
    expect(push.sent).toHaveLength(1);
    expect(result.failed).toBe(true);
    expect(result.recipients[0]).toMatchObject({ status: "failed", delivered: ["bell", "push"] });
    expect(errors.map((entry) => entry.step)).toEqual(["email"]);
  });

  it("treats a failed outcome from the transport like a failure, and a queued one as delivered", async () => {
    const { deps, errors } = setup({ choices: async () => ({ bell: true, email: true, push: false }) });
    const failed = await createNotifier({ ...deps, sendEmail: async () => ({ status: "failed", error: "Brevo answered 400" }) })({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-f", data: { when: "11:00" } });
    expect(failed.recipients[0]).toMatchObject({ status: "failed", delivered: ["bell"] });
    expect(errors.map((entry) => entry.step)).toEqual(["email"]);
    const queued = await createNotifier({ ...deps, sendEmail: async () => ({ status: "queued" }) })({ event: "kickoff.soon", audience: CUSTOMER, dedupeKey: "call-q", data: { when: "11:00" } });
    expect(queued.recipients[0]).toMatchObject({ delivered: ["bell", "email"] });
  });

  it("keeps going for the next person when one recipient fails", async () => {
    const second: NotificationRecipient = { userId: "user-two", name: "Dev", email: "dev@example.com" };
    const { notify, rows, store } = setup({ recipients: [OWNER, second] });
    vi.mocked(store.record).mockRejectedValueOnce(new Error("db down"));
    const result = await notify({ event: "kickoff.booked", audience: { kind: "customer", businessId: BUSINESS, userIds: ["user-owner", "user-two"] }, dedupeKey: "c", data: { when: "11:00" } });
    expect(rows.map((row) => row.userId)).toEqual(["user-two"]);
    expect(result.recipients.map((entry) => entry.status)).toEqual(["failed", "delivered"]);
  });

  it("writes only the bell row for a person who signs in with a phone number", async () => {
    const { notify, rows, emails } = setup({ recipients: [PHONE_OWNER] });
    const result = await notify({ event: "kickoff.booked", audience: CUSTOMER, dedupeKey: "c", data: { when: "11:00" } });
    expect(rows).toHaveLength(1);
    expect(emails).toEqual([]);
    expect(result.recipients[0]?.skipped).toContainEqual({ channel: "email", reason: "no_address" });
  });

  it("asks for the listed people only, or the owner when none are listed", async () => {
    const { notify, store } = setup();
    await notify({ event: "kickoff.booked", audience: { kind: "customer", businessId: BUSINESS, userIds: ["user-a"] }, dedupeKey: "c", data: { when: "11:00" } });
    await notify({ event: "kickoff.booked", audience: CUSTOMER, dedupeKey: "c2", data: { when: "11:00" } });
    expect(store.recipients).toHaveBeenNthCalledWith(1, BUSINESS, ["user-a"]);
    expect(store.recipients).toHaveBeenNthCalledWith(2, BUSINESS, undefined);
  });

  it("skips a channel that has no wording yet and says so, still recording the ledger", async () => {
    const { notify, rows, emails, push } = setup();
    const result = await notify({ event: "billing.renewal_upcoming", audience: CUSTOMER, dedupeKey: "r1", data: {} });
    expect(emails).toEqual([]);
    expect(push.sent).toEqual([]);
    expect(rows).toEqual([expect.objectContaining({ listed: false, title: "billing.renewal_upcoming" })]);
    expect(result.recipients[0]?.skipped).toEqual(expect.arrayContaining([{ channel: "bell", reason: "no_wording" }, { channel: "email", reason: "no_wording" }]));
  });

  it("refuses an event for the wrong audience without throwing", async () => {
    const { notify, rows, errors } = setup();
    const result = await notify({ event: "kickoff.ended", audience: CUSTOMER, dedupeKey: "c", data: { businessName: "Asha Cafe" } });
    expect(result.failed).toBe(true);
    expect(rows).toEqual([]);
    expect(errors.map((entry) => entry.step)).toEqual(["audience"]);
  });
});

describe("notify, a staff event", () => {
  const STAFF = { kind: "staff" } as const;

  it("writes one staff row, emails the team address and pushes to the staff account", async () => {
    const { notify, rows, emails, push } = setup();
    await notify({ event: "kickoff.ended", audience: STAFF, dedupeKey: "call-1", data: { businessName: "Asha Cafe" } });
    expect(rows).toEqual([expect.objectContaining({ audience: "staff", userId: null, businessId: null, title: "Did the kickoff call with Asha Cafe happen?", link: "/calls", listed: true })]);
    expect(emails[0]).toMatchObject({ to: "team@example.test", subject: "Did the kickoff call with Asha Cafe happen?" });
    expect(emails[0]?.bodyText).toContain("https://console.example.test/calls");
    expect(push.sent).toEqual([
      { target: { audience: "staff", userId: null }, message: { title: "Did the kickoff call happen?", url: "https://console.example.test/calls", tag: "kickoff.ended", event: "kickoff.ended" } },
    ]);
  });

  it("does not read preferences for staff", async () => {
    const { notify, store } = setup();
    await notify({ event: "kickoff.ended", audience: STAFF, dedupeKey: "call-1", data: { businessName: "Asha Cafe" } });
    expect(store.choices).not.toHaveBeenCalled();
    expect(store.recipients).not.toHaveBeenCalled();
  });

  it("records the business a staff notice is about when the caller names it", async () => {
    const { notify, rows } = setup();
    await notify({ event: "kickoff.fallback_started.staff", audience: { kind: "staff", businessId: BUSINESS }, dedupeKey: "call-1", data: { businessName: "Asha Cafe" } });
    expect(rows[0]).toMatchObject({ businessId: BUSINESS, title: "Started without call confirmation", body: "Asha Cafe" });
  });

  it("dedupes the one staff row", async () => {
    const { notify, rows, emails } = setup();
    const input = { event: "kickoff.ended", audience: STAFF, dedupeKey: "call-1", data: { businessName: "Asha Cafe" } } as const;
    await notify(input);
    await notify(input);
    expect(rows).toHaveLength(1);
    expect(emails).toHaveLength(1);
  });

  it("skips the email when no team address is set", async () => {
    const { notify, emails, rows } = setup({ staffEmail: null });
    const result = await notify({ event: "kickoff.ended", audience: STAFF, dedupeKey: "call-1", data: { businessName: "Asha Cafe" } });
    expect(emails).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(result.recipients[0]?.skipped).toContainEqual({ channel: "email", reason: "no_address" });
  });

  it("refuses a customer event for the staff audience", async () => {
    const { notify, rows } = setup();
    const result = await notify({ event: "kickoff.booked", audience: STAFF, dedupeKey: "c", data: { when: "11:00" } });
    expect(result.failed).toBe(true);
    expect(rows).toEqual([]);
  });
});
