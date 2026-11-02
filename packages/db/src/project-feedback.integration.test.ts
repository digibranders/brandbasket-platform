import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findLatestProjectEventAt } from "./queries/project-website";
import { findFeedbackLinkForTicket, linkFeedbackTicket, listFeedbackForProject } from "./queries/project-feedback";
import { businesses, businessMembers, projectEvents, projectFeedbackTickets, projects, supportMessages, supportTickets, users } from "./schema";
import { withUserScope } from "./scope";
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
