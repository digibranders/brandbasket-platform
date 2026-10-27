import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { countSupportTicketsByStatus } from "./queries/support-staff";
import { supportTickets, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const REQUESTER = "user-requester";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: REQUESTER, name: "Kavya Nair", email: "kavya@example.com" });
});

function ticket(number: number, status: "new" | "in_progress" | "closed") {
  return {
    displayRef: `R-${String(number).padStart(4, "0")}`,
    requesterUserId: REQUESTER,
    category: "support" as const,
    subject: `Request number ${number}`,
    status,
    submissionKey: `submission_${number}x`,
    submissionHash: String(number).repeat(64).slice(0, 64),
  };
}

describe("countSupportTicketsByStatus", () => {
  it("counts every status, zero where there are none", async () => {
    const inserted = await dbs.staff.db
      .insert(supportTickets)
      .values([ticket(1, "new"), ticket(2, "new"), ticket(3, "new"), ticket(4, "new")])
      .returning();
    await dbs.staff.db
      .update(supportTickets)
      .set({ status: "in_progress", version: inserted[2]!.version + 1 })
      .where(eq(supportTickets.id, inserted[2]!.id));
    await dbs.staff.db
      .update(supportTickets)
      .set({ status: "closed", version: inserted[3]!.version + 1 })
      .where(eq(supportTickets.id, inserted[3]!.id));

    expect(await countSupportTicketsByStatus(dbs.staff.db)).toEqual({
      new: 2,
      triaged: 0,
      in_progress: 1,
      waiting_on_you: 0,
      resolved: 0,
      closed: 1,
    });
  });
});
