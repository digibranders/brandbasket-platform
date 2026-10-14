import { listRecentEmails } from "@firstfold/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@firstfold/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BrevoDeliveryError, createAppEmailTransport, createDualTransport } from "./brevo";
import { supportReplyAlertEmail } from "./templates/support-reply-alert";
import { supportTicketAlertEmail } from "./templates/support-ticket-alert";

/** The outbox as the application roles really see it: grants and row-level security, not mocks. */

let dbs: TestDatabases;

const ticketAlert = supportTicketAlertEmail({
  to: "support@firstfold.io",
  reference: "FF-0192ABCD",
  ticketId: "0192f3c4-1234-7000-8000-000000000001",
  category: "bug",
  categoryLabel: "Report a bug",
  subject: "Cannot upload photos",
  description: "The upload button spins forever for Asha.",
  requesterEmail: "asha@example.com",
  requesterName: "Asha Rao",
  requesterPhone: "+91 98200 11111",
  businessName: "Rao Clinic",
  businessId: "biz-1",
  adminUrl: "http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001",
});

const replyAlert = supportReplyAlertEmail({
  to: "support@firstfold.io",
  reference: "FF-0192ABCD",
  ticketId: "0192f3c4-1234-7000-8000-000000000001",
  subject: "Cannot upload photos",
  body: "Still failing on my phone, Asha here.",
  authorName: "Asha Rao",
  authorEmail: "asha@example.com",
  categoryLabel: "Report a bug",
  statusLabel: "In progress",
  adminUrl: "http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001",
});

beforeAll(() => {
  // Refuses any database whose name does not end in _test.
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("support alerts in the email outbox", () => {
  it("cannot be written by the customer (app) connection, which is why alerts use the staff connection", async () => {
    await expect(createAppEmailTransport(dbs.app.db, { env: {} }).send(ticketAlert)).rejects.toThrow();
    expect(await listRecentEmails(dbs.staff.db, 10)).toHaveLength(0);
  });

  it("is written by the staff connection with no Brevo key, holding only reference, category, status and link", async () => {
    await createAppEmailTransport(dbs.staff.db, { env: {} }).send(ticketAlert);
    await createAppEmailTransport(dbs.staff.db, { env: {} }).send(replyAlert);
    const rows = await listRecentEmails(dbs.staff.db, 10);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.toAddress).toBe("support@firstfold.io");
      expect(row.transport).toBe("outbox");
      const stored = JSON.stringify(row);
      expect(stored).toContain("FF-0192ABCD");
      expect(stored).toContain("http://admin.localhost:3003/support/0192f3c4-1234-7000-8000-000000000001");
      for (const secret of ["Cannot upload photos", "spins forever", "Still failing", "Asha", "asha@example.com", "98200 11111", "Rao Clinic"]) {
        expect(stored).not.toContain(secret);
      }
    }
  });

  it("sends the full text to Brevo and records only the redacted copy, with the staff connection", async () => {
    const send = vi.fn(async () => {});
    await createDualTransport({ send }, dbs.staff.db).send(ticketAlert);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ bodyText: expect.stringContaining("spins forever") }));
    const [row] = await listRecentEmails(dbs.staff.db, 10);
    expect(row?.transport).toBe("brevo");
    expect(JSON.stringify(row)).not.toContain("Asha");
  });

  it("still records the alert in the outbox when Brevo fails, and does not throw", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = { send: async () => { throw new BrevoDeliveryError("Brevo down", 503, ""); } };
    await expect(createDualTransport(failing, dbs.staff.db).send(replyAlert)).resolves.toBeUndefined();
    const [row] = await listRecentEmails(dbs.staff.db, 10);
    expect(row?.transport).toBe("outbox");
    expect(JSON.stringify(row)).not.toContain("Still failing");
    error.mockRestore();
  });
});
