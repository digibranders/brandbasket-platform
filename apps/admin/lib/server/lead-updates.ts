import "server-only";
import {
  changeLeadCurrency,
  findLead,
  LeadNotFoundError,
  setLeadStatusUnlessSystemSet,
  updateLead,
  type BillingCurrency,
  type Database,
} from "@firstfold/db";
import { z } from "zod";
import { BILLING_CURRENCY_ORDER } from "@firstfold/shared/lib/currency";
import { readStaffLeadStatus } from "@firstfold/shared/lib/lead-status";

/** A lead status in the form that staff may not choose (`paid`, `account_created`) or that does not exist. */
export class LeadStatusNotAllowedError extends Error {
  constructor(value: string) {
    super(`Lead status "${value}" cannot be chosen by hand.`);
    this.name = "LeadStatusNotAllowedError";
  }
}

const currencySchema = z.enum(BILLING_CURRENCY_ORDER);

/** Null when the form sent no currency: the page shows "Billed in" locked, and a locked field is not submitted. */
function readCurrency(value: FormDataEntryValue | null): BillingCurrency | null {
  if (value === null) return null;
  const parsed = currencySchema.safeParse(value);
  if (!parsed.success) throw new Error(`Unknown billing currency: ${String(value)}`);
  return parsed.data;
}

/**
 * `status-kept` / `currency-kept`: the lead moved on while the page was open — the customer created their account or
 * started paying — so that field kept what the system set. Everything else was saved. If both happened, status wins.
 */
export type LeadDetailsResult = "saved" | "status-kept" | "currency-kept";

/**
 * Applies the "Update this lead" form. The caller has checked the staff session.
 *
 * Status is optional: the form leaves it out once the lead is in a status only the system sets. When present it must
 * be one staff may choose, or nothing is saved. The change itself is guarded in the database, so a lead that was
 * marked paid (or had its account created) while the page was open keeps that status; the other fields are still
 * saved and `status-kept` is returned.
 *
 * The currency goes through changeLeadCurrency, which also moves the business a signed-up customer is billed from,
 * and refuses once billing has started (`currency-kept`).
 */
export async function applyLeadDetails(db: Database, leadId: string, formData: FormData): Promise<LeadDetailsResult> {
  const rawStatus = formData.get("status");
  const status = rawStatus === null ? null : readStaffLeadStatus(rawStatus);
  if (rawStatus !== null && status === null) throw new LeadStatusNotAllowedError(String(rawStatus));
  const currency = readCurrency(formData.get("currency"));
  const notes = formData.get("notes");

  const lead = await findLead(db, leadId);
  if (lead === null) throw new LeadNotFoundError(leadId);

  let result: LeadDetailsResult = "saved";
  if (currency !== null) {
    const change = await changeLeadCurrency(db, leadId, currency);
    if (change === "not-found") throw new LeadNotFoundError(leadId);
    if (change === "locked") result = "currency-kept";
  }
  if (status !== null && status !== lead.status) {
    const change = await setLeadStatusUnlessSystemSet(db, leadId, status);
    if (change === "not-found") throw new LeadNotFoundError(leadId);
    if (change === "system-set") result = "status-kept";
  }
  await updateLead(db, leadId, {
    notes: typeof notes === "string" && notes.trim() !== "" ? notes.trim() : null,
  });
  return result;
}
