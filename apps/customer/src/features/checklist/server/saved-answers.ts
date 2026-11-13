import "server-only";
import { listConnectedAccounts, listMonthlySnapshots, listServiceSetups, type ScopedTransaction } from "@brandbasket/db";
import { monthKey } from "@/features/social/rules";
import type { SavedAnswers } from "../rules-items";

/**
 * The saved Social and Search answers, plus what the business already has elsewhere: an Instagram or Facebook account staff
 * connected, and an ad budget on this month's figures. Setup asks read this, so it never asks for what is already known.
 * Throws when a read fails; the caller wraps it in load().
 */
export async function readSavedAnswers(tx: ScopedTransaction, businessId: string, now: Date): Promise<SavedAnswers> {
  const [setups, accounts, snapshots] = await Promise.all([
    listServiceSetups(tx, businessId),
    listConnectedAccounts(tx),
    listMonthlySnapshots(tx, businessId, monthKey(now)),
  ]);
  return {
    social: setups.find((row) => row.service === "social")?.answers,
    search: setups.find((row) => row.service === "search")?.answers,
    known: {
      accounts: accounts.some((account) => (account.platform === "instagram" || account.platform === "facebook") && account.status !== "not_connected"),
      budget: snapshots.some((row) => row.service === "social" && (row.adBudgetCents ?? 0) > 0),
    },
  };
}
