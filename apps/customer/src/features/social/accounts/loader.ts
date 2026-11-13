import "server-only";
import type { CustomerContext } from "@/lib/guards";
import { brandOf } from "../brand";
import { fetchChannels } from "./client";
import { liveAccountsOf, type LiveAccounts } from "./rules";

/** The accounts the business has connected for posting, and the networks still to connect. A failed read throws: the panel shows its error state, never "nothing connected". */
export async function loadLiveAccounts(customer: Pick<CustomerContext, "businessId" | "businessName">, now: Date): Promise<LiveAccounts> {
  return liveAccountsOf(await fetchChannels((await brandOf(customer)).externalId), now);
}
