import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purgeOldEmailMessages } from "./queries/emails";
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
