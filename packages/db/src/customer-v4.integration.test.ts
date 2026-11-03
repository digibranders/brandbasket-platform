import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { acceptBusinessInvite, BusinessInviteOpenError, createBusinessInvite, listBusinessInvites, revokeBusinessInvite } from "./queries/business-invites";
import { recordChatbotLead, renameChatbot } from "./queries/chatbots";
import { listConnectedAccounts, saveConnectedAccount } from "./queries/connected-accounts";
import { approveDeliverables, insertDeliverable, recordSiteEvent } from "./queries/deliverables";
import {
  backfillEnquiries,
  countNewEnquiries,
  findEnquiry,
  listEnquiries,
  updateEnquiry,
  upsertEnquiryFromChatLead,
  upsertEnquiryFromSiteEvent,
} from "./queries/enquiries";
import {
  getNotificationsSeenAt,
  listNotificationPreferences,
  markNotificationsSeen,
  setNotificationPreference,
  shouldEmail,
} from "./queries/notifications";
import { listWebsitePages, syncWebsitePages, type FetchText } from "./queries/website-pages";
import {
  businessHours,
  businessInvites,
  businesses,
  businessMembers,
  chatbotLeads,
  chatbots,
  connectedAccounts,
  deliverables,
  enquiries,
  notificationPreferences,
  siteEvents,
  users,
  websitePages,
} from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const EDITOR_A = "editor-a";
const VIEWER_A = "viewer-a";
const OWNER_B = "owner-b";
const NEWCOMER = "newcomer";
const NOW = new Date("2026-11-03T09:00:00.000Z");
const RLS_REFUSED = "row-level security";
const PERMISSION_DENIED = "permission denied";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: EDITOR_A, name: "Eshan", email: "eshan@example.com" },
    { id: VIEWER_A, name: "Vani", email: "vani@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
    { id: NEWCOMER, name: "Nita", email: "nita@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR", websiteUrl: "https://cafe.example.com" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessA, userId: EDITOR_A, role: "editor" },
    { businessId: businessA, userId: VIEWER_A, role: "viewer" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

function as<T>(userId: string, businessId: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

async function seedChatLead(businessId: string, sessionId: string, name: string | null): Promise<string> {
  const [bot] = await dbs.staff.db
    .insert(chatbots)
    .values({ businessId, name: "Website assistant", oyechatsBotId: Math.floor(Math.random() * 1_000_000) + 1 })
    .returning({ id: chatbots.id });
  const [lead] = await dbs.staff.db
    .insert(chatbotLeads)
    .values({ chatbotId: bot?.id ?? "", businessId, sessionId, name, phone: "+91 98400 00000", email: null, capturedAt: NOW })
    .returning({ id: chatbotLeads.id });
  return lead?.id ?? "";
}

async function seedEnquiry(businessId: string): Promise<string> {
  await seedChatLead(businessId, `s-${businessId}`, "Ravi");
  await backfillEnquiries(dbs.staff.db, { businessId });
  const [row] = await dbs.staff.db.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.businessId, businessId));
  return row?.id ?? "";
}

describe("enquiries backfill", () => {
  it("copies chat leads and taps, maps the kinds, and adds nothing on a second run", async () => {
    await seedChatLead(businessA, "s1", "Ravi");
    await dbs.staff.db.insert(siteEvents).values([
      { businessId: businessA, kind: "call", occurredAt: NOW },
      { businessId: businessA, kind: "whatsapp", occurredAt: NOW },
      { businessId: businessA, kind: "form", occurredAt: NOW },
      { businessId: businessB, kind: "call", occurredAt: NOW },
    ]);

    expect(await backfillEnquiries(dbs.staff.db)).toEqual({ chat: 1, taps: 4 });
    expect(await backfillEnquiries(dbs.staff.db)).toEqual({ chat: 0, taps: 0 });

    const rows = await dbs.staff.db.select().from(enquiries).where(eq(enquiries.businessId, businessA));
    expect(rows.map((row) => row.kind).sort()).toEqual(["call_tap", "chat", "form", "whatsapp_tap"]);
    const chat = rows.find((row) => row.kind === "chat");
    expect(chat).toMatchObject({ source: "Website assistant", name: "Ravi", phone: "+91 98400 00000", status: "new" });
    const tap = rows.find((row) => row.kind === "call_tap");
    expect(tap).toMatchObject({ source: "Website", name: null, phone: null, email: null });
  });

  it("refreshes a chat lead's details later without touching the customer's status and note", async () => {
    const leadId = await seedChatLead(businessA, "s1", null);
    await backfillEnquiries(dbs.staff.db);
    const [row] = await dbs.staff.db.select({ id: enquiries.id }).from(enquiries);
    await as(OWNER_A, businessA, (tx) => updateEnquiry(tx, row?.id ?? "", { status: "contacted", note: "Called back" }));
    await dbs.staff.db.update(chatbotLeads).set({ name: "Ravi K" }).where(eq(chatbotLeads.id, leadId));

    expect(await backfillEnquiries(dbs.staff.db, { businessId: businessA })).toEqual({ chat: 1, taps: 0 });

    const [after] = await dbs.staff.db.select().from(enquiries);
    expect(after).toMatchObject({ name: "Ravi K", status: "contacted", note: "Called back" });
  });
});

describe("live enquiry writes", () => {
  it("a new chat lead creates one enquiry, a repeat adds none, and later details refresh it", async () => {
    const [bot] = await dbs.staff.db.insert(chatbots).values({ businessId: businessA, name: "Website assistant", oyechatsBotId: 4101 }).returning({ id: chatbots.id });
    const lead = { chatbotId: bot?.id ?? "", businessId: businessA, sessionId: "live-1", name: "Meera", email: null, phone: null, company: null, capturedAt: NOW };

    const leadId = await recordChatbotLead(dbs.staff.db, lead);
    expect(await upsertEnquiryFromChatLead(dbs.staff.db, leadId)).toBe(true);
    expect(await dbs.staff.db.select().from(enquiries)).toHaveLength(1);

    expect(await recordChatbotLead(dbs.staff.db, lead)).toBe(leadId);
    expect(await upsertEnquiryFromChatLead(dbs.staff.db, leadId)).toBe(false);
    expect(await dbs.staff.db.select().from(enquiries)).toHaveLength(1);

    const [row] = await dbs.staff.db.select({ id: enquiries.id }).from(enquiries);
    await as(OWNER_A, businessA, (tx) => updateEnquiry(tx, row?.id ?? "", { status: "contacted" }));
    await recordChatbotLead(dbs.staff.db, { ...lead, phone: "+919820011223" });
    expect(await upsertEnquiryFromChatLead(dbs.staff.db, leadId)).toBe(true);
    const [after] = await dbs.staff.db.select().from(enquiries);
    expect(after).toMatchObject({ kind: "chat", source: "Website assistant", name: "Meera", phone: "+919820011223", status: "contacted", sourceRef: `chatbot_lead:${leadId}` });
    expect(await backfillEnquiries(dbs.staff.db)).toEqual({ chat: 0, taps: 0 });
  });

  it("a new tap creates one enquiry, a repeat of the same tap adds none, and a second tap adds another", async () => {
    const first = await recordSiteEvent(dbs.staff.db, { businessId: businessA, kind: "whatsapp", at: NOW });
    expect(await upsertEnquiryFromSiteEvent(dbs.staff.db, first)).toBe(true);
    expect(await upsertEnquiryFromSiteEvent(dbs.staff.db, first)).toBe(false);
    expect(await dbs.staff.db.select().from(enquiries)).toHaveLength(1);

    const second = await recordSiteEvent(dbs.staff.db, { businessId: businessA, kind: "whatsapp", at: NOW });
    expect(await upsertEnquiryFromSiteEvent(dbs.staff.db, second)).toBe(true);
    const rows = await dbs.staff.db.select().from(enquiries);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "whatsapp_tap", source: "Website", name: null });
    expect(await backfillEnquiries(dbs.staff.db)).toEqual({ chat: 0, taps: 0 });
  });

  it("refuses an id that is not a UUID", async () => {
    await expect(upsertEnquiryFromSiteEvent(dbs.staff.db, "nope")).rejects.toThrow("eventId must be a UUID");
    await expect(upsertEnquiryFromChatLead(dbs.staff.db, "nope")).rejects.toThrow("leadId must be a UUID");
  });
});

describe("enquiries row-level security", () => {
  it("shows a business only its own enquiries", async () => {
    const enquiryA = await seedEnquiry(businessA);
    await seedEnquiry(businessB);

    const seenByB = await as(OWNER_B, businessB, (tx) => listEnquiries(tx, { limit: 50 }));
    expect(seenByB.every((row) => row.businessId === businessB)).toBe(true);
    expect(seenByB).toHaveLength(1);
    expect(await as(OWNER_B, businessB, (tx) => findEnquiry(tx, enquiryA))).toBeNull();
    // Even a query that names business A's row returns nothing under business B's scope.
    const raw = await as(OWNER_B, businessB, (tx) => tx.select().from(enquiries).where(eq(enquiries.id, enquiryA)));
    expect(raw).toEqual([]);
  });

  it("lets an owner or an editor set status and note, and counts what is new", async () => {
    const id = await seedEnquiry(businessA);
    // Taps and a form with no details have nobody to reply to, so they do not count as new.
    await dbs.staff.db.insert(siteEvents).values([
      { businessId: businessA, kind: "call", occurredAt: NOW },
      { businessId: businessA, kind: "form", occurredAt: NOW },
    ]);
    await backfillEnquiries(dbs.staff.db, { businessId: businessA });
    expect(await as(OWNER_A, businessA, (tx) => countNewEnquiries(tx))).toBe(1);

    const owner = await as(OWNER_A, businessA, (tx) => updateEnquiry(tx, id, { status: "won", note: "  Booked  " }));
    expect(owner).toMatchObject({ status: "won", note: "Booked" });
    const editor = await as(EDITOR_A, businessA, (tx) => updateEnquiry(tx, id, { note: null }));
    expect(editor).toMatchObject({ status: "won", note: null });
    expect(await as(OWNER_A, businessA, (tx) => countNewEnquiries(tx))).toBe(0);
  });

  it("refuses every other column, and inserts and deletes, to the customer", async () => {
    const id = await seedEnquiry(businessA);

    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.update(enquiries).set({ name: "Someone else" }).where(eq(enquiries.id, id))))).toContain(PERMISSION_DENIED);
    expect(
      await captureErrorText(
        as(OWNER_A, businessA, (tx) => tx.insert(enquiries).values({ businessId: businessA, kind: "form", receivedAt: NOW, sourceRef: "fake:1" })),
      ),
    ).toContain(PERMISSION_DENIED);
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.delete(enquiries).where(eq(enquiries.id, id))))).toContain(PERMISSION_DENIED);
  });

  it("does not let another business, or a viewer, change an enquiry", async () => {
    const id = await seedEnquiry(businessA);

    expect(await as(OWNER_B, businessB, (tx) => updateEnquiry(tx, id, { status: "lost" }))).toBeNull();
    expect(await as(VIEWER_A, businessA, (tx) => updateEnquiry(tx, id, { status: "lost" }))).toBeNull();
    const [row] = await dbs.staff.db.select().from(enquiries).where(eq(enquiries.id, id));
    expect(row?.status).toBe("new");
  });
});

describe("website pages", () => {
  const sitemaps: Record<string, string> = {
    "https://cafe.example.com/sitemap.xml": `<sitemapindex><sitemap><loc>https://cafe.example.com/pages.xml</loc></sitemap><sitemap><loc>http://evil.example/x.xml</loc></sitemap></sitemapindex>`,
    "https://cafe.example.com/pages.xml": `<urlset><url><loc>https://cafe.example.com/</loc></url><url><loc>https://cafe.example.com/menu</loc></url></urlset>`,
  };
  const fetched: string[] = [];
  const fakeFetch: FetchText = async (url) => {
    fetched.push(url);
    const text = sitemaps[url];
    return text === undefined ? { ok: false, status: 404, text: "" } : { ok: true, status: 200, text };
  };

  it("syncs from the sitemap index, removes pages it no longer lists, and keeps everything when a fetch fails", async () => {
    fetched.length = 0;
    expect(await syncWebsitePages(dbs.staff.db, businessA, { fetchText: fakeFetch, now: NOW })).toEqual({ kind: "synced", pages: 2, removed: 0 });
    expect(fetched).not.toContain("http://evil.example/x.xml");

    sitemaps["https://cafe.example.com/pages.xml"] = `<urlset><url><loc>https://cafe.example.com/</loc></url></urlset>`;
    const later = new Date(NOW.getTime() + 86_400_000);
    expect(await syncWebsitePages(dbs.staff.db, businessA, { fetchText: fakeFetch, now: later })).toEqual({ kind: "synced", pages: 1, removed: 1 });

    const broken: FetchText = async () => ({ ok: false, status: 500, text: "" });
    expect(await syncWebsitePages(dbs.staff.db, businessA, { fetchText: broken, now: later })).toMatchObject({ kind: "failed" });
    expect(await syncWebsitePages(dbs.staff.db, businessB, { fetchText: fakeFetch })).toEqual({ kind: "no_website" });

    const pages = await as(OWNER_A, businessA, (tx) => listWebsitePages(tx));
    expect(pages.map((page) => page.url)).toEqual(["https://cafe.example.com/"]);
    expect(pages[0]?.lastSeenAt).toEqual(later);
  });

  it("is read only for the customer and invisible to another business", async () => {
    await dbs.staff.db.insert(websitePages).values({ businessId: businessA, url: "https://cafe.example.com/", lastSeenAt: NOW });

    expect(await as(OWNER_B, businessB, (tx) => tx.select().from(websitePages))).toEqual([]);
    expect(
      await captureErrorText(as(OWNER_A, businessA, (tx) => tx.insert(websitePages).values({ businessId: businessA, url: "https://x.example/", lastSeenAt: NOW }))),
    ).toContain(PERMISSION_DENIED);
  });
});

describe("connected accounts", () => {
  it("is maintained by staff and read only for its own business", async () => {
    await saveConnectedAccount(dbs.staff.db, { businessId: businessA, platform: "instagram", handle: "@cafe", url: null, status: "connected", checkedAt: NOW });
    await saveConnectedAccount(dbs.staff.db, { businessId: businessA, platform: "instagram", handle: "@chennaicafe", url: null, status: "needs_attention", checkedAt: NOW });

    const own = await as(OWNER_A, businessA, (tx) => listConnectedAccounts(tx));
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ handle: "@chennaicafe", status: "needs_attention" });
    expect(await as(OWNER_B, businessB, (tx) => tx.select().from(connectedAccounts))).toEqual([]);
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.update(connectedAccounts).set({ status: "connected" })))).toContain(PERMISSION_DENIED);
    expect(
      await captureErrorText(as(OWNER_A, businessA, (tx) => tx.insert(connectedAccounts).values({ businessId: businessA, platform: "x", status: "connected" }))),
    ).toContain(PERMISSION_DENIED);
  });
});

describe("notification preferences and reads", () => {
  it("emails by default, and stops once the person turns a topic off", async () => {
    expect(await shouldEmail(dbs.staff.db, OWNER_A, businessA, "billing")).toBe(true);
    expect(await shouldEmail(dbs.staff.db, OWNER_A, businessA, "product_news")).toBe(false);

    await as(OWNER_A, businessA, (tx) => setNotificationPreference(tx, OWNER_A, "billing", false));
    await as(OWNER_A, businessA, (tx) => setNotificationPreference(tx, OWNER_A, "product_news", true));

    expect(await shouldEmail(dbs.staff.db, OWNER_A, businessA, "billing")).toBe(false);
    expect(await shouldEmail(dbs.staff.db, OWNER_A, businessA, "product_news")).toBe(true);
    // One person's choice is theirs alone.
    expect(await shouldEmail(dbs.staff.db, EDITOR_A, businessA, "billing")).toBe(true);
    expect(await as(OWNER_A, businessA, (tx) => listNotificationPreferences(tx, OWNER_A))).toMatchObject({ billing: false, product_news: true, new_enquiry: true });
  });

  it("lets a viewer manage their own settings, but nobody another person's", async () => {
    await as(VIEWER_A, businessA, (tx) => setNotificationPreference(tx, VIEWER_A, "new_enquiry", false));
    await as(OWNER_A, businessA, (tx) => setNotificationPreference(tx, OWNER_A, "billing", false));

    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => setNotificationPreference(tx, EDITOR_A, "billing", false)))).toContain(RLS_REFUSED);
    // A non-member scoped to the business cannot store one either.
    expect(await captureErrorText(as(OWNER_B, businessA, (tx) => setNotificationPreference(tx, OWNER_B, "billing", false)))).toContain(RLS_REFUSED);
    const seenByViewer = await as(VIEWER_A, businessA, (tx) => tx.select().from(notificationPreferences));
    expect(seenByViewer.map((row) => row.userId)).toEqual([VIEWER_A]);
    expect(await as(OWNER_B, businessB, (tx) => tx.select().from(notificationPreferences))).toEqual([]);
  });

  it("keeps one seen time per person and business that only moves forward", async () => {
    expect(await as(OWNER_A, businessA, (tx) => getNotificationsSeenAt(tx, OWNER_A))).toBeNull();
    await as(OWNER_A, businessA, (tx) => markNotificationsSeen(tx, OWNER_A, NOW));
    await as(OWNER_A, businessA, (tx) => markNotificationsSeen(tx, OWNER_A, new Date(NOW.getTime() - 60_000)));

    expect(await as(OWNER_A, businessA, (tx) => getNotificationsSeenAt(tx, OWNER_A))).toEqual(NOW);
    expect(await as(EDITOR_A, businessA, (tx) => getNotificationsSeenAt(tx, EDITOR_A))).toBeNull();
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => markNotificationsSeen(tx, EDITOR_A, NOW)))).toContain(RLS_REFUSED);
  });
});

describe("business invites", () => {
  it("lets the owner invite, list and revoke, and nobody else", async () => {
    const { invite } = await as(OWNER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: OWNER_A, email: " Nita@Example.com ", role: "viewer", now: NOW }));
    expect(invite).toMatchObject({ email: "nita@example.com", role: "viewer", businessId: businessA });
    expect(invite).not.toHaveProperty("tokenHash");

    expect(await as(OWNER_A, businessA, (tx) => listBusinessInvites(tx))).toHaveLength(1);
    expect(await as(EDITOR_A, businessA, (tx) => listBusinessInvites(tx))).toEqual([]);
    expect(await as(VIEWER_A, businessA, (tx) => listBusinessInvites(tx))).toEqual([]);
    expect(await as(OWNER_B, businessB, (tx) => tx.select().from(businessInvites))).toEqual([]);

    expect(
      await captureErrorText(as(EDITOR_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: EDITOR_A, email: "x@example.com", role: "editor" }))),
    ).toContain(RLS_REFUSED);
    expect(
      await captureErrorText(as(VIEWER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: VIEWER_A, email: "x@example.com", role: "viewer" }))),
    ).toContain(RLS_REFUSED);
    // The owner cannot sign an invite in someone else's name.
    expect(
      await captureErrorText(as(OWNER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: EDITOR_A, email: "x@example.com", role: "viewer" }))),
    ).toContain(RLS_REFUSED);

    await expect(as(OWNER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: OWNER_A, email: "nita@example.com", role: "editor", now: NOW }))).rejects.toBeInstanceOf(
      BusinessInviteOpenError,
    );

    expect(await as(EDITOR_A, businessA, (tx) => revokeBusinessInvite(tx, invite.id))).toBe(false);
    expect(await as(OWNER_B, businessB, (tx) => revokeBusinessInvite(tx, invite.id))).toBe(false);
    expect(await as(OWNER_A, businessA, (tx) => revokeBusinessInvite(tx, invite.id, NOW))).toBe(true);
    expect(await as(OWNER_A, businessA, (tx) => revokeBusinessInvite(tx, invite.id, NOW))).toBe(false);
  });

  it("never invites an owner, and lets the owner change nothing but the revoke time", async () => {
    expect(
      await captureErrorText(
        dbs.staff.db.insert(businessInvites).values({ businessId: businessA, email: "o@example.com", role: "owner", tokenHash: "h1", invitedBy: OWNER_A, expiresAt: new Date(Date.now() + 86_400_000) }),
      ),
    ).toContain("business_invites_role_check");
    const { invite } = await as(OWNER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: OWNER_A, email: "nita@example.com", role: "viewer" }));
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.update(businessInvites).set({ role: "editor" }).where(eq(businessInvites.id, invite.id))))).toContain(
      PERMISSION_DENIED,
    );
  });

  it("turns an open invite into a membership for the invited address only, once", async () => {
    const { token } = await as(OWNER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: OWNER_A, email: "nita@example.com", role: "viewer", now: NOW }));

    expect(await acceptBusinessInvite(dbs.staff.db, { token, userId: OWNER_B, userEmail: "ben@example.com", now: NOW })).toEqual({ kind: "refused", reason: "wrong_email" });
    expect(await acceptBusinessInvite(dbs.staff.db, { token, userId: NEWCOMER, userEmail: "nita@example.com", now: new Date(NOW.getTime() + 8 * 86_400_000) })).toEqual({
      kind: "refused",
      reason: "expired",
    });
    expect(await acceptBusinessInvite(dbs.staff.db, { token: "nope", userId: NEWCOMER, userEmail: "nita@example.com", now: NOW })).toEqual({ kind: "refused", reason: "not_found" });

    expect(await acceptBusinessInvite(dbs.staff.db, { token, userId: NEWCOMER, userEmail: "NITA@example.com", now: NOW })).toEqual({ kind: "accepted", businessId: businessA, role: "viewer" });
    expect(await acceptBusinessInvite(dbs.staff.db, { token, userId: NEWCOMER, userEmail: "nita@example.com", now: NOW })).toEqual({ kind: "refused", reason: "used" });
    const [member] = await dbs.staff.db.select().from(businessMembers).where(eq(businessMembers.userId, NEWCOMER));
    expect(member).toMatchObject({ businessId: businessA, role: "viewer" });

    const second = await as(OWNER_A, businessA, (tx) => createBusinessInvite(tx, { invitedBy: OWNER_A, email: "late@example.com", role: "editor", now: NOW }));
    await as(OWNER_A, businessA, (tx) => revokeBusinessInvite(tx, second.invite.id, NOW));
    expect(await acceptBusinessInvite(dbs.staff.db, { token: second.token, userId: NEWCOMER, userEmail: "late@example.com", now: NOW })).toEqual({ kind: "refused", reason: "revoked" });
  });
});

describe("viewer role", () => {
  it("cannot write business data that an editor can write", async () => {
    // Insert: business hours.
    await as(EDITOR_A, businessA, (tx) => tx.insert(businessHours).values({ businessId: businessA, dayOfWeek: 1, closed: true }));
    expect(await captureErrorText(as(VIEWER_A, businessA, (tx) => tx.insert(businessHours).values({ businessId: businessA, dayOfWeek: 2, closed: true })))).toContain(RLS_REFUSED);

    // Delete: the row the editor added stays when a viewer deletes.
    const deleted = await as(VIEWER_A, businessA, (tx) => tx.delete(businessHours).where(eq(businessHours.businessId, businessA)).returning({ id: businessHours.id }));
    expect(deleted).toEqual([]);

    // Update: renaming the chatbot.
    const [bot] = await dbs.staff.db.insert(chatbots).values({ businessId: businessA, name: "Website assistant", oyechatsBotId: 7 }).returning({ id: chatbots.id });
    const chatbotId = bot?.id ?? "";
    expect(await as(VIEWER_A, businessA, (tx) => renameChatbot(tx, { chatbotId, businessId: businessA, name: "Viewer name" }))).toBe(false);
    expect(await as(EDITOR_A, businessA, (tx) => renameChatbot(tx, { chatbotId, businessId: businessA, name: "Editor name" }))).toBe(true);
  });

  it("cannot approve posts through the security definer function, while an editor can", async () => {
    const post = await insertDeliverable(dbs.staff.db, {
      id: "0190a5c0-0000-7000-8000-000000000001",
      businessId: businessA,
      kind: "post",
      title: "Diwali offer",
      caption: "Ten percent off",
      format: "reel",
      channel: "instagram",
      dueOn: "2026-11-10",
      status: "awaiting_approval",
      staffId: OWNER_A,
    });
    expect(post).toMatchObject({ format: "reel", channel: "instagram" });

    expect(await captureErrorText(as(VIEWER_A, businessA, (tx) => approveDeliverables(tx, [post.id])))).toContain("could not be found");
    const [still] = await dbs.staff.db.select({ status: deliverables.status }).from(deliverables).where(eq(deliverables.id, post.id));
    expect(still?.status).toBe("awaiting_approval");
    expect(await as(EDITOR_A, businessA, (tx) => approveDeliverables(tx, [post.id]))).toBe(1);
  });

  it("has a refusal on every business table the customer role can write", async () => {
    const result = await dbs.owner.db.execute<{ table_name: string; missing: number }>(sql`
      with writable as (
        select distinct g.table_name from information_schema.role_table_grants g
        where g.grantee = 'bb_app' and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE') and g.table_schema = 'public'
        union
        select distinct c.table_name from information_schema.column_privileges c
        where c.grantee = 'bb_app' and c.privilege_type in ('INSERT', 'UPDATE') and c.table_schema = 'public'
      )
      select w.table_name, 3 - count(p.policyname)::int as missing
      from writable w
      join information_schema.columns col on col.table_schema = 'public' and col.table_name = w.table_name and col.column_name = 'business_id'
      left join pg_policies p on p.schemaname = 'public' and p.tablename = w.table_name and p.permissive = 'RESTRICTIVE' and p.policyname like '%\\_no\\_viewer\\_%'
      where w.table_name not in ('notification_preferences', 'notification_reads', 'business_invites')
      group by w.table_name
      having count(p.policyname) < 3
    `);
    expect(result.rows).toEqual([]);
  });
});

describe("deliverable format and channel", () => {
  it("are only for posts", async () => {
    expect(
      await captureErrorText(
        insertDeliverable(dbs.staff.db, {
          id: "0190a5c0-0000-7000-8000-000000000002",
          businessId: businessA,
          kind: "page",
          title: "Menu page",
          caption: null,
          format: "reel",
          dueOn: null,
          staffId: OWNER_A,
        }),
      ),
    ).toContain("deliverables_format_check");
  });
});
