import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, channelLinkRequests, type ChannelLinkNetwork, type ChannelLinkRequest } from "../schema";

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
    .values({ businessId: input.businessId, brandId: input.brandId, network: input.network, url: input.url, handle: input.handle, requestedByUserId: input.userId })
    .onConflictDoUpdate({
      target: [channelLinkRequests.businessId, channelLinkRequests.brandId, channelLinkRequests.network],
      set: { url: input.url, handle: input.handle, state: "requested", reason: null, requestedByUserId: input.userId, notifiedAt: null, answeredAt: null, answeredByStaffId: null },
      setWhere: inArray(channelLinkRequests.state, ["requested", "refused"]),
    })
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

/** Marks a request connected once the account shows among the brand's channels. Staff connection (or the customer's own read of it). */
export async function markChannelLinkConnected(db: Database, businessId: string, brandId: string, network: ChannelLinkNetwork, now: Date): Promise<void> {
  await db
    .update(channelLinkRequests)
    .set({ state: "connected", reason: null, answeredAt: now })
    .where(and(eq(channelLinkRequests.businessId, businessId), eq(channelLinkRequests.brandId, brandId), eq(channelLinkRequests.network, network), sql`${channelLinkRequests.state} <> 'connected'`));
}
