import "server-only";
import { listClients } from "@brandbasket/db";
import { moneyNeedsALookCount, renewalLane } from "@/lib/money-attention";
import { getStaffDb } from "./db";
import { readPaymentsCount } from "./payments-count";

/** The rail's Money count: flagged and failed payments plus plans past due or lapsed, the same sum the Payments tile shows. */
export async function readMoneyCount(now: Date = new Date()): Promise<number> {
  const [payments, clients] = await Promise.all([readPaymentsCount(now), listClients(getStaffDb())]);
  return moneyNeedsALookCount({ payments, renewals: renewalLane(clients, now).length });
}
