import "server-only";
import { getAppDb, getStaffDb } from "@/lib/db";
import { listChannelLinkRequests, markChannelLinkConnected, withTenantScope } from "@brandbasket/db";
import type { CustomerContext } from "@/lib/guards";
import { brandOf } from "../brand";
import type { Platform } from "../analytics/rules";
import { connectModesOf, type ChannelRequest, type ConnectMode } from "./requests";

type Reader = Pick<CustomerContext, "tenant" | "businessId" | "businessName">;

/** The networks that ask for a link to the profile on this server (MANUAL_CONNECT). */
export const manualConnectModes = (): Partial<Record<Platform, ConnectMode>> => connectModesOf(process.env.MANUAL_CONNECT);

/**
 * How each network is connected and where the customer's link requests stand for the brand being looked at. A request whose account now shows
 * among the brand's connected channels is marked connected, so the row goes back to a normal channel by itself. With no network on links
 * nothing is read from the database.
 */
export async function loadChannelRequests(customer: Reader, connected: readonly Platform[]): Promise<{ readonly modes: Partial<Record<Platform, ConnectMode>>; readonly list: readonly ChannelRequest[] }> {
  const modes = manualConnectModes();
  if (Object.keys(modes).length === 0) return { modes, list: [] };
  const brand = await brandOf(customer);
  const rows = await withTenantScope(getAppDb(), customer.tenant, (tx) => listChannelLinkRequests(tx, customer.businessId, brand.externalId));
  const now = new Date();
  const list = await Promise.all(
    rows.map(async (row): Promise<ChannelRequest> => {
      const arrived = row.state !== "connected" && connected.includes(row.network);
      if (arrived) await markChannelLinkConnected(getStaffDb(), customer.businessId, brand.externalId, row.network, now);
      return { network: row.network, url: row.url, handle: row.handle, state: arrived ? "connected" : row.state, reason: row.reason };
    }),
  );
  return { modes, list };
}
