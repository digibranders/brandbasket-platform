import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findEmail, listEmailDeliveries, purgeOldEmailMessages, recordEmail, updateEmailDelivery } from "./queries/emails";
import { emailMessages } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-12T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
let dbs: TestDatabases;

async function insert(template: string, ageMs: number): Promise<void> {
  await dbs.staff.db.insert(emailMessages).values({
    toAddress: "asha@example.in",
    subject: "s",
    template,
    bodyText: "b",
    bodyHtml: "<p>b</p>",
    transport: "brevo",
    createdAt: new Date(NOW.getTime() - ageMs),
  });
}

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("purgeOldEmailMessages", () => {
  it("removes sign-in emails after a day and everything else after 90 days", async () => {
    await insert("password-reset", DAY + 1000);
    await insert("setup-link", DAY - 1000);
    await insert("lead-received", 90 * DAY + 1000);
    await insert("lead-received", 89 * DAY);

    await expect(purgeOldEmailMessages(dbs.staff.db, NOW)).resolves.toBe(2);

    const left = await dbs.staff.db.select({ template: emailMessages.template }).from(emailMessages);
    expect(left.map((row) => row.template).sort()).toEqual(["lead-received", "setup-link"]);
  });
});

describe("email delivery status", () => {
  const base = { toAddress: "vikram@example.in", subject: "Your setup link", template: "setup-link", bodyText: "b", bodyHtml: "<p>b</p>" };

  it("says sent for a Brevo row and local only for an outbox row when the writer gives no status", async () => {
    await recordEmail(dbs.staff.db, { ...base, transport: "brevo" });
    await recordEmail(dbs.staff.db, { ...base, transport: "outbox" });
    const rows = await listEmailDeliveries(dbs.staff.db, { failedOnly: false, search: null, limit: 10 });
    expect(rows.map((row) => row.status).sort()).toEqual(["local_only", "sent"]);
  });

  it("lists failed rows only, searches address, subject and template, and records a resend", async () => {
    await recordEmail(dbs.staff.db, { ...base, transport: "brevo", status: "failed", error: "Brevo answered 400" });
    await recordEmail(dbs.staff.db, { ...base, toAddress: "kavya@example.in", subject: "Reply to your request", template: "support-reply", transport: "brevo" });
    const [failed] = await listEmailDeliveries(dbs.staff.db, { failedOnly: true, search: null, limit: 10 });
    expect(failed).toMatchObject({ status: "failed", error: "Brevo answered 400", attempts: 1, bodyRedacted: false });
    expect((await listEmailDeliveries(dbs.staff.db, { failedOnly: false, search: "kavya", limit: 10 })).map((row) => row.template)).toEqual(["support-reply"]);
    await updateEmailDelivery(dbs.staff.db, failed?.id ?? "", { status: "sent", providerMessageId: "<abc@brevo>", error: null, now: NOW });
    expect(await findEmail(dbs.staff.db, failed?.id ?? "")).toMatchObject({ status: "sent", providerMessageId: "<abc@brevo>", error: null, attempts: 2, lastAttemptAt: NOW });
  });
});

