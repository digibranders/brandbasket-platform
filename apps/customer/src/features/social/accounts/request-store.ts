import "server-only";
import { getAppDb, getStaffDb } from "@/lib/db";
import { listChannelLinkRequests, markChannelLinkConnected, withTenantScope } from "@brandbasket/db";
import { inviteSteps, metaAppModeOf, personProfileNetworksOf } from "@brandbasket/shared/lib/channel-link-steps";
import type { CustomerContext } from "@/lib/guards";
import { brandOf } from "../brand";
import type { Platform } from "../analytics/rules";
import { connectModesOf, directConnectBusinessesOf, type ChannelRequest, type ConnectMode } from "./requests";
import { tellRequesterAboutLink } from "./request-alert";

type Reader = Pick<CustomerContext, "tenant" | "businessId" | "businessName">;

/**
 * The networks that ask for a link to the profile on this server (MANUAL_CONNECT), except for a business listed in DIRECT_CONNECT_BUSINESSES,
 * which keeps the direct Connect buttons (one review workspace, for example).
 */
export function manualConnectModes(businessId: string): Partial<Record<Platform, ConnectMode>> {
  return directConnectBusinessesOf(process.env.DIRECT_CONNECT_BUSINESSES).includes(businessId.toLowerCase()) ? {} : connectModesOf(process.env.MANUAL_CONNECT);
}

/** The networks whose form also asks for the personal Facebook profile of the person who manages the account (PERSON_PROFILE_NETWORKS). */
export const personProfileNetworks = (): readonly Platform[] => personProfileNetworksOf(process.env.PERSON_PROFILE_NETWORKS);

/**
 * How each network is connected and where the customer's link requests stand for the brand being looked at. A request whose account now shows
 * among the brand's connected channels is marked connected, so the row goes back to a normal channel by itself. With no network on links
 * nothing is read from the database.
 */
export async function loadChannelRequests(customer: Reader, connected: readonly Platform[]): Promise<{ readonly modes: Partial<Record<Platform, ConnectMode>>; readonly list: readonly ChannelRequest[]; readonly personNetworks: readonly Platform[] }> {
  const modes = manualConnectModes(customer.businessId);
  if (Object.keys(modes).length === 0) return { modes, list: [], personNetworks: [] };
  const brand = await brandOf(customer);
  const rows = await withTenantScope(getAppDb(), customer.tenant, (tx) => listChannelLinkRequests(tx, customer.businessId, brand.externalId));
  const now = new Date();
  const list = await Promise.all(
    rows.map(async (row): Promise<ChannelRequest> => {
      const arrived = row.state !== "connected" && connected.includes(row.network);
      if (arrived && (await markChannelLinkConnected(getStaffDb(), customer.businessId, brand.externalId, row.network, now))) void tellRequesterAboutLink(row.id, "connected");
      const state = arrived ? "connected" : row.state;
      return { network: row.network, url: row.url, handle: row.handle, state, steps: state === "invited" ? inviteSteps(row.network, metaAppModeOf(process.env.META_APP_MODE)).steps : [], reason: row.reason };
    }),
  );
  return { modes, list, personNetworks: personProfileNetworks() };
}
