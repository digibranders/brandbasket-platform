import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { errorEventReceipts, errorIssues } from "./schema/error-issues";
import { errorIssueFingerprint, getErrorIssue, purgeErrorIssues, recordErrorReport, updateErrorIssueStatus } from "./queries/error-issues";
import { captureErrorText, openTestDatabases, type TestDatabases } from "./testing";
import { users } from "./schema/auth";
import { staffMembers } from "./schema/staff";
import { supportTickets } from "./schema/support";
import { supportTicketErrorLinks } from "./schema/support-ticket-error-links";
import { linkSupportTicketError, listSupportTicketErrors, unlinkSupportTicketError } from "./queries/support-ticket-error-links";

describe("native automatic error storage and staff isolation", () => {
  let databases: TestDatabases;
  const route = "/support/[id]";
  const base = { app: "platform", operation: "server_action", errorClass: "TypeError", route, frames: [{ file: "page.tsx", line: 987654, column: 8 }], release: "abcdef123", browser: "Server", severity: "error" };
  const eventIds: string[] = [];
  let issueId: string | null = null;
  const staffUserId = `error-staff-${randomUUID()}`;
  const requesterUserId = `error-requester-${randomUUID()}`;
  let linkedTicketId: string | null = null;
  beforeAll(async () => {
    databases = openTestDatabases();
    await databases.owner.db.delete(errorIssues).where(eq(errorIssues.fingerprint, errorIssueFingerprint(base)));
  });
  afterAll(async () => {
    try {
      if (linkedTicketId !== null) await databases.owner.db.delete(supportTickets).where(eq(supportTickets.id, linkedTicketId));
      await databases.owner.db.delete(staffMembers).where(eq(staffMembers.userId, staffUserId));
      await databases.owner.db.delete(users).where(eq(users.id, staffUserId));
      await databases.owner.db.delete(users).where(eq(users.id, requesterUserId));
      if (issueId !== null) await databases.staff.db.delete(errorIssues).where(eq(errorIssues.id, issueId));
      for (const id of eventIds) await databases.staff.db.delete(errorEventReceipts).where(eq(errorEventReceipts.eventId, id));
    } finally { await databases.closeAll(); }
  });

  it("atomically deduplicates concurrent events and aggregates distinct events", async () => {
    const eventId = randomUUID(); eventIds.push(eventId);
    const results = await Promise.all([recordErrorReport(databases.staff.db, { ...base, eventId }, "private-user"), recordErrorReport(databases.staff.db, { ...base, eventId }, "private-user")]);
    issueId = results.find((id) => id !== null) ?? null;
    expect(issueId).not.toBeNull();
    expect(results.filter((id) => id !== null)).toHaveLength(1);
    const secondId = randomUUID(); eventIds.push(secondId);
    await recordErrorReport(databases.staff.db, { ...base, eventId: secondId }, "second-private-user");
    const issue = await getErrorIssue(databases.staff.db, issueId ?? "");
    expect(issue?.occurrenceCount).toBe(2);
    expect(issue?.affectedUsers.count).toBe(2);
    expect(JSON.stringify(issue)).not.toMatch(/private-user|userBits/);
  });

  it("reopens resolved regressions but keeps ignored issues ignored", async () => {
    expect(await updateErrorIssueStatus(databases.staff.db, issueId ?? "", "resolved", 2)).toBe(true);
    const eventId = randomUUID(); eventIds.push(eventId);
    await recordErrorReport(databases.staff.db, { ...base, eventId, release: "abcdef456" });
    const issue = await getErrorIssue(databases.staff.db, issueId ?? "");
    expect(issue?.status).toBe("new");
    expect(issue?.regressionCount).toBe(1);
    expect(issue?.resolvedAt).toBeNull();
    expect(await updateErrorIssueStatus(databases.staff.db, issueId ?? "", "resolved", 2)).toBe(false);
    expect(await updateErrorIssueStatus(databases.staff.db, issueId ?? "", "ignored", 3)).toBe(true);
    const ignoredEventId = randomUUID(); eventIds.push(ignoredEventId);
    await recordErrorReport(databases.staff.db, { ...base, eventId: ignoredEventId });
    expect((await getErrorIssue(databases.staff.db, issueId ?? ""))?.status).toBe("ignored");
  });

  it("denies customer and anonymous roles reads and writes", async () => {
    for (const handle of [databases.app, databases.publicRole]) {
      expect(await captureErrorText(handle.db.execute(sql`select id from error_issues limit 1`))).toMatch(/permission denied/);
      expect(await captureErrorText(handle.db.execute(sql`select event_id from error_event_receipts limit 1`))).toMatch(/permission denied/);
      expect(await captureErrorText(handle.db.execute(sql`insert into error_event_receipts(event_id) values (${randomUUID()})`))).toMatch(/permission denied/);
    }
  });

  it("expires idempotency receipts instead of retaining occurrence history", async () => {
    const expired = randomUUID(); eventIds.push(expired);
    await databases.staff.db.insert(errorEventReceipts).values({ eventId: expired, receivedAt: new Date(Date.now() - 90_000_000) });
    const eventId = randomUUID(); eventIds.push(eventId);
    await recordErrorReport(databases.staff.db, { ...base, eventId });
    expect(await databases.staff.db.select().from(errorEventReceipts).where(eq(errorEventReceipts.eventId, expired))).toEqual([]);
  });

  it("links incidents privately and requires an active staff actor", async () => {
    await databases.staff.db.insert(users).values([{ id: staffUserId, name: "Incident staff", email: `${staffUserId}@example.test` }, { id: requesterUserId, name: "Requester", email: `${requesterUserId}@example.test` }]);
    await databases.staff.db.insert(staffMembers).values({ userId: staffUserId });
    const [ticket] = await databases.staff.db.insert(supportTickets).values({ requesterUserId, category: "bug", subject: "Synthetic incident", displayRef: `FY-${randomUUID()}`, submissionKey: randomUUID(), submissionHash: "a".repeat(64) }).returning({ id: supportTickets.id });
    linkedTicketId = ticket?.id ?? null;
    const input = { staffUserId, ticketId: linkedTicketId ?? "", issueId: issueId ?? "" };
    expect(await linkSupportTicketError(databases.staff.db, input)).toBe(true);
    expect(await updateErrorIssueStatus(databases.staff.db, input.issueId, "investigating", 5, staffUserId)).toBe(true);
    expect((await getErrorIssue(databases.staff.db, input.issueId))?.assigneeStaffId).toBe(staffUserId);
    await expect(updateErrorIssueStatus(databases.staff.db, input.issueId, "investigating", 5, requesterUserId)).rejects.toThrow(/active staff/i);
    expect(await linkSupportTicketError(databases.staff.db, input)).toBe(false);
    expect((await listSupportTicketErrors(databases.staff.db, input.ticketId, staffUserId)).map((issue) => issue.id)).toContain(issueId);
    await expect(listSupportTicketErrors(databases.staff.db, input.ticketId, requesterUserId)).rejects.toThrow(/active staff/i);
    expect(await captureErrorText(databases.app.db.select().from(supportTicketErrorLinks))).toMatch(/permission denied/);
    expect(await unlinkSupportTicketError(databases.staff.db, input)).toBe(true);
    expect(await listSupportTicketErrors(databases.staff.db, input.ticketId, staffUserId)).toEqual([]);
  });

  it("keeps first/last seen and latest release correct when reports finish out of order", async () => {
    const before = await getErrorIssue(databases.staff.db, issueId ?? "");
    const eventId = randomUUID(); eventIds.push(eventId);
    const old = new Date(Date.now() - 3_600_000);
    await recordErrorReport(databases.staff.db, { ...base, eventId, release: "abcdef111", browser: "Firefox" }, undefined, old);
    const after = await getErrorIssue(databases.staff.db, issueId ?? "");
    expect(after?.firstSeenAt).toEqual(old);
    expect(after?.lastSeenAt).toEqual(before?.lastSeenAt);
    expect(after?.release).toEqual(before?.release);
    expect(after?.browser).toEqual(before?.browser);
  });

  it("purges only incidents that have been resolved for more than 90 days", async () => {
    const now = new Date();
    await databases.staff.db.update(errorIssues).set({ status: "ignored", resolvedAt: new Date(now.getTime() - 91 * 86_400_000) }).where(eq(errorIssues.id, issueId ?? ""));
    await purgeErrorIssues(databases.staff.db, now);
    expect(await getErrorIssue(databases.staff.db, issueId ?? "")).not.toBeNull();
    await databases.staff.db.update(errorIssues).set({ status: "resolved" }).where(eq(errorIssues.id, issueId ?? ""));
    expect(await purgeErrorIssues(databases.staff.db, now)).toBeGreaterThanOrEqual(1);
    expect(await getErrorIssue(databases.staff.db, issueId ?? "")).toBeNull();
  });
});
