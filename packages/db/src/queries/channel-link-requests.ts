import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, channelLinkRequests, users, type ChannelLinkNetwork, type ChannelLinkRequest } from "../schema";

type Runner = Database | ScopedTransaction;

/** The requests of a business's brand, read through row-level security as the customer. */
export async function listChannelLinkRequests(db: Runner, businessId: string, brandId: string): Promise<ChannelLinkRequest[]> {
  return db.select().from(channelLinkRequests).where(and(eq(channelLinkRequests.businessId, businessId), eq(channelLinkRequests.brandId, brandId)));
}

export interface NewChannelLinkRequest {
  readonly businessId: string;
  readonly brandId: string;
  readonly network: ChannelLinkNetwork;
  readonly url: string;
  readonly handle: string;
  /** The personal Facebook profile of the person who manages the account, for the networks that ask for it; null otherwise. */
  readonly adminProfileUrl: string | null;
  readonly userId: string;
}

/**
 * Sends the link for a network. A link already waiting (or one the team could not use) is replaced by the new one and goes back to the team
 * as a fresh request. One the team already answered with an invite, or that is connected, is left as it is and the answer is null: the
 * customer cannot ask twice. Customer connection: the business must be the signed-in one.
 */
export async function upsertChannelLinkRequest(db: Runner, input: NewChannelLinkRequest): Promise<ChannelLinkRequest | null> {
  const rows = await db
    .insert(channelLinkRequests)
    .values({ businessId: input.businessId, brandId: input.brandId, network: input.network, url: input.url, handle: input.handle, adminProfileUrl: input.adminProfileUrl, requestedByUserId: input.userId })
    .onConflictDoUpdate({
      target: [channelLinkRequests.businessId, channelLinkRequests.brandId, channelLinkRequests.network],
      set: { url: input.url, handle: input.handle, adminProfileUrl: input.adminProfileUrl, state: "requested", reason: null, requestedByUserId: input.userId, notifiedAt: null, answeredAt: null, answeredByStaffId: null },
      setWhere: inArray(channelLinkRequests.state, ["requested", "refused"]),
    })
    .returning();
  return rows[0] ?? null;
}

/**
 * Puts a request that was marked connected back with the team as a fresh request, with the link she just sent. For the case where it was marked
 * connected but the network shows no account for the brand (marked by mistake, or the account was removed since). The customer role cannot change a
 * connected row, so this runs on the staff connection, and the caller has to confirm first that the network really has no account. Null when the
 * request is not connected (nothing to reopen).
 */
export async function reopenChannelLinkRequest(db: Database, input: NewChannelLinkRequest): Promise<ChannelLinkRequest | null> {
  const rows = await db
    .update(channelLinkRequests)
    .set({ url: input.url, handle: input.handle, adminProfileUrl: input.adminProfileUrl, state: "requested", reason: null, requestedByUserId: input.userId, notifiedAt: null, answeredAt: null, answeredByStaffId: null })
    .where(and(eq(channelLinkRequests.businessId, input.businessId), eq(channelLinkRequests.brandId, input.brandId), eq(channelLinkRequests.network, input.network), eq(channelLinkRequests.state, "connected")))
    .returning();
  return rows[0] ?? null;
}

/** Takes back a request nobody has invited yet. True when one was removed. */
export async function deleteChannelLinkRequest(db: Runner, businessId: string, brandId: string, network: ChannelLinkNetwork): Promise<boolean> {
  const rows = await db
    .delete(channelLinkRequests)
    .where(and(eq(channelLinkRequests.businessId, businessId), eq(channelLinkRequests.brandId, brandId), eq(channelLinkRequests.network, network), inArray(channelLinkRequests.state, ["requested", "refused"])))
    .returning({ id: channelLinkRequests.id });
  return rows.length > 0;
}

/** Notes that the team was told by email about this link, once. Customer connection. */
export async function markChannelLinkNotified(db: Runner, id: string, now: Date): Promise<void> {
  await db.update(channelLinkRequests).set({ notifiedAt: now }).where(and(eq(channelLinkRequests.id, id), isNull(channelLinkRequests.notifiedAt)));
}

/** A request with the business it belongs to, for the team's list. */
export interface ChannelLinkRequestRow extends ChannelLinkRequest {
  readonly businessName: string;
}

/** The requests the team still has something to do about (asked or invited), oldest first. Staff connection. */
export async function listOpenChannelLinkRequests(db: Database): Promise<ChannelLinkRequestRow[]> {
  const rows = await db
    .select({ request: channelLinkRequests, businessName: businesses.name })
    .from(channelLinkRequests)
    .innerJoin(businesses, eq(businesses.id, channelLinkRequests.businessId))
    .where(inArray(channelLinkRequests.state, ["requested", "invited"]))
    .orderBy(asc(channelLinkRequests.createdAt));
  return rows.map((row) => ({ ...row.request, businessName: row.businessName }));
}

export type ChannelLinkAnswer =
  | { readonly state: "invited" | "connected" }
  | { readonly state: "refused"; readonly reason: string };

/** The team's answer to a request: invited (the customer was added as a tester), refused with a reason, or connected. Staff connection. False when there is no such request. */
export async function answerChannelLinkRequest(db: Database, input: { readonly id: string; readonly staffId: string; readonly answer: ChannelLinkAnswer; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(channelLinkRequests)
    .set({ state: input.answer.state, reason: input.answer.state === "refused" ? input.answer.reason : null, answeredAt: input.now, answeredByStaffId: input.staffId })
    .where(eq(channelLinkRequests.id, input.id))
    .returning({ id: channelLinkRequests.id });
  return rows.length > 0;
}

/**
 * Marks a request connected once the account shows among the brand's channels. Staff connection. True when it changed (it was not connected
 * before), so the one message about it is sent once.
 */
export async function markChannelLinkConnected(db: Database, businessId: string, brandId: string, network: ChannelLinkNetwork, now: Date): Promise<boolean> {
  const rows = await db
    .update(channelLinkRequests)
    .set({ state: "connected", reason: null, answeredAt: now })
    .where(and(eq(channelLinkRequests.businessId, businessId), eq(channelLinkRequests.brandId, brandId), eq(channelLinkRequests.network, network), sql`${channelLinkRequests.state} <> 'connected'`))
    .returning({ id: channelLinkRequests.id });
  return rows.length > 0;
}

/** Every request of a business, any brand, read through row-level security as the customer: the bell lists what waits on her. */
export async function listChannelLinkRequestsForBusiness(db: Runner, businessId: string): Promise<ChannelLinkRequest[]> {
  return db.select().from(channelLinkRequests).where(eq(channelLinkRequests.businessId, businessId));
}

/** Who to write to about a request, and the business it is for. Staff connection. */
export interface ChannelLinkMailInfo {
  readonly request: ChannelLinkRequest;
  readonly businessName: string;
  /** The person who sent the link; null when they cannot be found. */
  readonly requester: { readonly name: string; readonly email: string } | null;
}

/** The request with its business and the person who sent it, for the customer emails. Staff connection. */
export async function findChannelLinkMailInfo(db: Database, id: string): Promise<ChannelLinkMailInfo | null> {
  const rows = await db
    .select({ request: channelLinkRequests, businessName: businesses.name, name: users.name, email: users.email })
    .from(channelLinkRequests)
    .innerJoin(businesses, eq(businesses.id, channelLinkRequests.businessId))
    .leftJoin(users, eq(users.id, channelLinkRequests.requestedByUserId))
    .where(eq(channelLinkRequests.id, id))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { request: row.request, businessName: row.businessName, requester: row.email === null || row.name === null ? null : { name: row.name, email: row.email } };
}
