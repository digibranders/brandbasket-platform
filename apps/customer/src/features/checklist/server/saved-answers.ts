import "server-only";
import { listConnectedAccounts, listMonthlySnapshots, listServiceSetups, type ScopedTransaction } from "@brandbasket/db";
import { monthKey } from "@/features/social/rules";
import { reportError } from "@/lib/report";
import { loadBrands, loadChannels, socialAutoSettings } from "@/legacy-social/server/social-auto";
import type { SavedAnswers } from "../rules-items";

/**
 * Whether the customer connected an Instagram or Facebook account herself, in the posting service (Social media, Connect). Those accounts are
 * not in the accounts staff keep in the database, so without this the checklist kept asking for pages she had already connected. Any of her
 * brands counts. A failed read says no: the item stays open, and nothing fails because of it.
 */
export async function postingServiceHasAccounts(customer: { readonly businessId: string; readonly businessName?: string }): Promise<boolean> {
  try {
    const settings = socialAutoSettings();
    if (settings === null) return false;
    const brands = await loadBrands(settings, customer.businessId, customer.businessName ?? "");
    const ids = brands === null || brands.brands.length === 0 ? [customer.businessId] : brands.brands.map((brand) => brand.externalId);
    const lists = await Promise.all(ids.map((id) => loadChannels(settings, id)));
    return lists.some((channels) => channels.some((channel) => channel.platform === "instagram" || channel.platform === "facebook"));
  } catch (error) {
    reportError(error, { area: "checklist.posting-accounts" });
    return false;
  }
}

/**
 * The saved Social and Search answers, plus what the business already has elsewhere: an Instagram or Facebook account staff
 * connected, and an ad budget on this month's figures. Setup asks read this, so it never asks for what is already known.
 * Throws when a read fails; the caller wraps it in load().
 */
export async function readSavedAnswers(tx: ScopedTransaction, businessId: string, now: Date, connectedInPostingService = false): Promise<SavedAnswers> {
  const [setups, accounts, snapshots] = await Promise.all([
    listServiceSetups(tx, businessId),
    listConnectedAccounts(tx),
    listMonthlySnapshots(tx, businessId, monthKey(now)),
  ]);
  return {
    social: setups.find((row) => row.service === "social")?.answers,
    search: setups.find((row) => row.service === "search")?.answers,
    known: {
      accounts: connectedInPostingService || accounts.some((account) => (account.platform === "instagram" || account.platform === "facebook") && account.status !== "not_connected"),
      budget: snapshots.some((row) => row.service === "social" && (row.adBudgetCents ?? 0) > 0),
    },
  };
}
