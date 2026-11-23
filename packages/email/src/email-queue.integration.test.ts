import {
  deliveryHealth,
  hasEmailContaining,
  listRecentEmails,
  markEmailBounced,
  recordEmail,
  suppressEmailAddress,
  type Database,
} from "@brandbasket/db";
import { openTestDatabases, querySql, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BrevoDeliveryError, createDualTransport, type BrevoTransport } from "./brevo";
import { drainEmailQueue } from "./drain";
import type { EmailMessage } from "./message";

/** The queue against real Postgres, with a fake Brevo: grants, the claim lock and the row states are the real ones. */

let dbs: TestDatabases;
let staff: Database;

const NOW = new Date("2026-11-17T10:00:00Z");
const receipt: EmailMessage = { to: "owner@example.in", subject: "Receipt", template: "payment-received", bodyText: "Payment pay-1 received", bodyHtml: "<p>Payment pay-1 received</p>" };
const report: EmailMessage = { to: "owner@example.in", subject: "Report", template: "monthly-report", bodyText: "Your report", bodyHtml: "<p>Your report</p>" };

const down: BrevoTransport = { send: async () => { throw new BrevoDeliveryError("down", 503, ""); } };
const up = (id = "<m-1>"): BrevoTransport => ({ send: vi.fn(async () => ({ providerMessageId: id })) });

async function queue(message: EmailMessage, brevo: BrevoTransport = down): Promise<void> {
  await createDualTransport(brevo, staff, { now: () => NOW }).send(message);
}
const afterMinutes = (m: number): Date => new Date(NOW.getTime() + m * 60_000);

beforeAll(() => {
  dbs = openTestDatabases();
  staff = dbs.staff.db;
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("drainEmailQueue", () => {
  it("leaves a message that is not due yet", async () => {
    await queue(receipt);
    const brevo = up();
    expect(await drainEmailQueue(staff, brevo, afterMinutes(5))).toMatchObject({ claimed: 0 });
    expect(brevo.send).not.toHaveBeenCalled();
  });

  it("sends a due message, records Brevo's id and clears the next attempt", async () => {
    await queue(receipt);
    expect(await drainEmailQueue(staff, up("<m-9>"), afterMinutes(16))).toMatchObject({ claimed: 1, sent: 1 });
    const [row] = await listRecentEmails(staff, 5);
    expect(row).toMatchObject({ status: "sent", providerMessageId: "<m-9>", attempts: 2, nextAttemptAt: null, error: null });
  });

  it("backs off after a failed retry, then ends as failed after the third attempt", async () => {
    await queue(receipt);
    expect(await drainEmailQueue(staff, down, afterMinutes(16))).toMatchObject({ requeued: 1 });
    let [row] = await listRecentEmails(staff, 5);
    expect(row).toMatchObject({ status: "pending", attempts: 2 });
    expect(row?.nextAttemptAt?.toISOString()).toBe(afterMinutes(16 + 60).toISOString());
    expect(await drainEmailQueue(staff, down, afterMinutes(60))).toMatchObject({ claimed: 0 });
    expect(await drainEmailQueue(staff, down, afterMinutes(80))).toMatchObject({ failed: 1 });
    [row] = await listRecentEmails(staff, 5);
    expect(row).toMatchObject({ status: "failed", attempts: 3, nextAttemptAt: null, error: "Brevo answered 503" });
  });

  it("fails at once when Brevo refuses the message instead of retrying it", async () => {
    await queue(receipt);
    const refuses: BrevoTransport = { send: async () => { throw new BrevoDeliveryError("no", 400, "bad"); } };
    expect(await drainEmailQueue(staff, refuses, afterMinutes(16))).toMatchObject({ failed: 1, requeued: 0 });
  });

  it("does not hand one message to two drainers", async () => {
    await queue(receipt);
    const brevo = up();
    const [a, b] = await Promise.all([drainEmailQueue(staff, brevo, afterMinutes(16)), drainEmailQueue(staff, brevo, afterMinutes(16))]);
    expect(a.claimed + b.claimed).toBe(1);
    expect(brevo.send).toHaveBeenCalledTimes(1);
  });

  it("does not send optional mail to an address suppressed after it was queued, but still sends a receipt", async () => {
    await queue(report);
    await queue(receipt);
    await suppressEmailAddress(staff, "Owner@Example.in", "unsubscribe");
    expect(await drainEmailQueue(staff, up(), afterMinutes(16))).toMatchObject({ claimed: 2, sent: 1, suppressed: 1 });
    const rows = await listRecentEmails(staff, 5);
    expect(rows.find((r) => r.template === "monthly-report")).toMatchObject({ status: "bounced" });
    expect(rows.find((r) => r.template === "payment-received")).toMatchObject({ status: "sent" });
  });

  it("fails a redacted row instead of sending its stored copy", async () => {
    await recordEmail(staff, { toAddress: "a@example.in", subject: "s", template: "x", bodyText: "r", bodyHtml: "r", transport: "brevo", status: "pending", attempts: 1, nextAttemptAt: NOW, bodyRedacted: true });
    expect(await drainEmailQueue(staff, up(), afterMinutes(1))).toMatchObject({ failed: 1 });
  });
});

describe("queries the queue relies on", () => {
  it("hasEmailContaining ignores a failed message so a receipt can be sent again", async () => {
    await queue(receipt, { send: async () => { throw new BrevoDeliveryError("no", 400, ""); } });
    const match = { template: "payment-received", toAddress: "owner@example.in", text: "pay-1", since: new Date(0) };
    expect(await hasEmailContaining(staff, match)).toBe(false);
    await queue(receipt);
    expect(await hasEmailContaining(staff, match)).toBe(true);
  });

  it("marks a sent message bounced by Brevo's id with or without brackets", async () => {
    await queue(receipt, up("<abc@relay>"));
    expect(await markEmailBounced(staff, "abc@relay", "hard bounce")).toBe(1);
    const [row] = await listRecentEmails(staff, 5);
    expect(row).toMatchObject({ status: "bounced", error: "hard bounce" });
  });

  it("counts failed and bounced messages, not queued or sent ones, in the Deliveries health that feeds Today", async () => {
    await queue(receipt, { send: async () => { throw new BrevoDeliveryError("no", 400, ""); } });
    await queue(receipt, up("<b-1>"));
    await markEmailBounced(staff, "b-1", "hard bounce");
    await queue(receipt);
    await queue(receipt, up("<ok>"));
    const health = await deliveryHealth(staff, new Date(0));
    expect(health.brevo).toMatchObject({ total: 4, failed: 2 });
  });

  it("keeps the first suppression reason", async () => {
    await suppressEmailAddress(staff, "A@Example.in", "unsubscribe");
    await suppressEmailAddress(staff, "a@example.in", "complaint");
    expect(await querySql(dbs.owner, "select address, reason from email_suppressions")).toEqual([{ address: "a@example.in", reason: "unsubscribe" }]);
  });

  it("lets the intake connection queue a mandatory message", async () => {
    await createDualTransport(down, dbs.publicRole.db, { now: () => NOW }).send(receipt);
    expect(await listRecentEmails(staff, 5)).toMatchObject([{ status: "pending" }]);
  });
});
