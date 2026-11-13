import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findLatestProjectEventAt } from "./queries/project-website";
import { requestProjectRevisions } from "./queries/projects";
import { createSupportTicketWithOutcome } from "./queries/support";
import { findFeedbackLinkForTicket, linkFeedbackTicket, listFeedbackForProject } from "./queries/project-feedback";
import { businesses, businessMembers, projectEvents, projectFeedbackTickets, projects, supportMessages, supportTickets, users } from "./schema";
import { withCustomerRole, withUserScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "pf-owner";
const OTHER_OWNER = "pf-other-owner";

let dbs: TestDatabases;
let businessId = "";
let projectId = "";
let otherBusinessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

async function makeBusiness(slug: string, owner: string): Promise<{ readonly businessId: string; readonly projectId: string }> {
  const [business] = await dbs.staff.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  await dbs.staff.db.insert(businessMembers).values({ businessId: business.id, userId: owner, role: "owner" });
  const [project] = await dbs.staff.db.insert(projects).values({ businessId: business.id, status: "preview" }).returning({ id: projects.id });
  if (project === undefined) throw new Error("Seed project was not inserted");
  return { businessId: business.id, projectId: project.id };
}

async function makeTicket(number: number, subject: string): Promise<string> {
  const [ticket] = await dbs.staff.db
    .insert(supportTickets)
    .values({
      displayRef: `FY-FEEDBACK-${number}`,
      requesterUserId: OWNER,
      businessId,
      category: "website_change",
      subject,
      submissionKey: `feedback_key_${number}`,
      submissionHash: String(number).repeat(64).slice(0, 64),
    })
    .returning({ id: supportTickets.id });
  if (ticket === undefined) throw new Error("Seed ticket was not inserted");
  return ticket.id;
}

/** Written as the customer, the way the dashboard writes it: the database refuses a message whose author is not the signed-in user. */
async function addCustomerMessage(ticketId: string, body: string, key: string): Promise<void> {
  await withUserScope(dbs.app.db, OWNER, (tx) =>
    tx.insert(supportMessages).values({
      ticketId,
      authorRole: "customer",
      authorUserId: OWNER,
      body,
      submissionKey: key,
      submissionHash: "a".repeat(64),
    }),
  );
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Riley Owner", email: "riley@example.com" },
    { id: OTHER_OWNER, name: "Sam Other", email: "sam@example.com" },
  ]);
  ({ businessId, projectId } = await makeBusiness("harbour-bakery", OWNER));
  ({ businessId: otherBusinessId } = await makeBusiness("birch-dental", OTHER_OWNER));
});

describe("project feedback tickets", () => {
  it("lists a linked ticket with its subject, newest first, for the project", async () => {
    const ticketId = await makeTicket(1, "Preview feedback, round 1: Change the main photo");
    await linkFeedbackTicket(dbs.staff.db, { ticketId, projectId, businessId, round: 1 });

    const rows = await listFeedbackForProject(dbs.staff.db, { projectId, businessId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ticketId,
      displayRef: "FY-FEEDBACK-1",
      subject: "Preview feedback, round 1: Change the main photo",
      status: "new",
      round: 1,
    });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("carries the first thing the customer wrote, and null when there is no message", async () => {
    const written = await makeTicket(7, "Preview feedback, round 1: Make the logo bigger");
    await linkFeedbackTicket(dbs.staff.db, { ticketId: written, projectId, businessId, round: 1 });
    await addCustomerMessage(written, "Make the logo bigger and move the phone number to the top.", "customer_msg_1");
    await addCustomerMessage(written, "One more thing: the footer.", "customer_msg_2");
    const bare = await makeTicket(8, "Preview feedback, round 2: Fix the menu");
    await linkFeedbackTicket(dbs.staff.db, { ticketId: bare, projectId, businessId, round: 2 });

    const rows = await listFeedbackForProject(dbs.staff.db, { projectId, businessId });
    expect(rows.find((row) => row.ticketId === written)?.body).toBe("Make the logo bigger and move the phone number to the top.");
    expect(rows.find((row) => row.ticketId === bare)?.body).toBeNull();
  });

  it("leaves one row when the same ticket is linked twice", async () => {
    const ticketId = await makeTicket(2, "Preview feedback, round 1: Fix the menu");
    await linkFeedbackTicket(dbs.staff.db, { ticketId, projectId, businessId, round: 1 });
    await linkFeedbackTicket(dbs.staff.db, { ticketId, projectId, businessId, round: 1 });

    const rows = await dbs.owner.db.select().from(projectFeedbackTickets).where(eq(projectFeedbackTickets.ticketId, ticketId));
    expect(rows).toHaveLength(1);
    expect(await listFeedbackForProject(dbs.staff.db, { projectId, businessId })).toHaveLength(1);
  });

  it("lists nothing when the business does not own the project", async () => {
    const ticketId = await makeTicket(3, "Preview feedback, round 1: Add a map");
    await linkFeedbackTicket(dbs.staff.db, { ticketId, projectId, businessId, round: 1 });

    expect(await listFeedbackForProject(dbs.staff.db, { projectId, businessId: otherBusinessId })).toEqual([]);
  });

  it("finds the project, business and round for a linked ticket", async () => {
    const ticketId = await makeTicket(5, "Preview feedback, round 2: Change the opening line");
    await linkFeedbackTicket(dbs.staff.db, { ticketId, projectId, businessId, round: 2 });

    expect(await findFeedbackLinkForTicket(dbs.staff.db, ticketId)).toEqual({ projectId, businessId, round: 2 });
  });

  it("finds nothing for a ticket that was not sent as preview feedback", async () => {
    const ticketId = await makeTicket(6, "Invoice question");

    expect(await findFeedbackLinkForTicket(dbs.staff.db, ticketId)).toBeNull();
  });

  it("removes the link when its ticket is deleted", async () => {
    const ticketId = await makeTicket(4, "Preview feedback, round 1: Shorter about page");
    await linkFeedbackTicket(dbs.staff.db, { ticketId, projectId, businessId, round: 1 });

    await dbs.owner.db.delete(supportTickets).where(eq(supportTickets.id, ticketId));

    expect(await dbs.owner.db.select().from(projectFeedbackTickets).where(eq(projectFeedbackTickets.ticketId, ticketId))).toEqual([]);
    expect(await listFeedbackForProject(dbs.staff.db, { projectId, businessId })).toEqual([]);
  });
});

describe("findLatestProjectEventAt", () => {
  it("returns the newest time the project moved to that status, and null when it never did", async () => {
    const earlier = new Date("2026-11-01T06:30:00Z");
    const later = new Date("2026-11-03T06:30:00Z");
    await dbs.owner.db.insert(projectEvents).values([
      { projectId, businessId, status: "revisions", occurredAt: earlier },
      { projectId, businessId, status: "revisions", occurredAt: later },
    ]);

    expect(await findLatestProjectEventAt(dbs.staff.db, { projectId, status: "revisions" })).toEqual(later);
    expect(await findLatestProjectEventAt(dbs.staff.db, { projectId, status: "approved" })).toBeNull();
  });
});

/**
 * The customer app's preview feedback: the round, the ticket written as the
 * customer, and the link commit together in one staff transaction, so a send that loses the race leaves no ticket behind.
 */
describe("preview feedback in one transaction", () => {
  async function send(key: string, body: string): Promise<string> {
    return dbs.staff.db.transaction(async (tx) => {
      const moved = await requestProjectRevisions(tx, { businessId, now: new Date() });
      const { ticket } = await withCustomerRole(tx, { userId: OWNER, businessId }, (customerTx) =>
        createSupportTicketWithOutcome(customerTx, { userId: OWNER, businessId, category: "website_change", subject: `Preview feedback, round ${moved.revisionRoundsGranted}`, description: body, submissionKey: key }),
      );
      await linkFeedbackTicket(tx, { ticketId: ticket.id, projectId: moved.id, businessId, round: moved.revisionRoundsGranted });
      return ticket.id;
    });
  }

  beforeEach(async () => {
    await dbs.staff.db.update(projects).set({ revisionRoundsIncluded: 2, revisionRoundsGranted: 0 }).where(eq(projects.id, projectId));
  });

  it("saves the ticket as the customer and links it to the round", async () => {
    const ticketId = await send("preview_feedback_one", "Make the logo bigger on every page.");
    const [ticket] = await dbs.staff.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
    expect(ticket).toMatchObject({ requesterUserId: OWNER, businessId, category: "website_change" });
    expect(await findFeedbackLinkForTicket(dbs.staff.db, ticketId)).toEqual({ projectId, businessId, round: 1 });
    const [project] = await dbs.staff.db.select({ status: projects.status, granted: projects.revisionRoundsGranted }).from(projects).where(eq(projects.id, projectId));
    expect(project).toEqual({ status: "revisions", granted: 1 });
  });

  it("leaves no ticket for the loser of two racing sends", async () => {
    const results = await Promise.allSettled([send("preview_feedback_race_a", "Change the photo on the home page."), send("preview_feedback_race_b", "Change the phone number on the contact page.")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await dbs.staff.db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.businessId, businessId))).toHaveLength(1);
    expect(await dbs.staff.db.select().from(projectFeedbackTickets).where(eq(projectFeedbackTickets.businessId, businessId))).toHaveLength(1);
  });

  it("rolls the round back when the ticket is refused", async () => {
    await expect(send("bad key!", "Make the logo bigger on every page.")).rejects.toThrow("Invalid submission key.");
    const [project] = await dbs.staff.db.select({ status: projects.status, granted: projects.revisionRoundsGranted }).from(projects).where(eq(projects.id, projectId));
    expect(project).toEqual({ status: "preview", granted: 0 });
  });
});
