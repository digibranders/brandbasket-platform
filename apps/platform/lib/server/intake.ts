import "server-only";
import { completeClientIntake, findClientIntake, saveClientIntakeAnswers, withTenantScope, type ClientIntake } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { parseIntakeAnswer } from "@/lib/intake/answers";
import { NO_ANSWERS, type IntakeAnswers } from "@brandbasket/shared/lib/intake/questions";
import { getAppDb } from "./db";

export interface LoadedIntake {
  readonly answers: IntakeAnswers;
  /** When the customer pressed Continue to checkout (or skipped), or null while they have not. */
  readonly completedAt: Date | null;
}

const answersOf = (row: ClientIntake): IntakeAnswers => ({
  businessType: row.businessType,
  businessSubtype: row.businessSubtype,
  primaryGoal: row.primaryGoal,
  websiteState: row.websiteState,
  existingWebsiteUrl: row.existingWebsiteUrl,
  primaryAction: row.primaryAction,
  designDirection: row.designDirection,
  socialChannels: row.socialChannels,
  searchScope: row.searchScope,
});

/** The business's answers so far, read as the customer (row-level security): none before the first one. */
export async function loadIntake(tenant: TenantContext): Promise<LoadedIntake> {
  const row = await withTenantScope(getAppDb(), tenant, (tx) => findClientIntake(tx, tenant.businessId));
  return row === null ? { answers: NO_ANSWERS, completedAt: null } : { answers: answersOf(row), completedAt: row.completedAt };
}

export type SaveIntakeOutcome = { readonly kind: "saved" } | { readonly kind: "refused"; readonly message: string };

/**
 * Saves one posted answer. The business comes from the session, the question's options from our own rules, and the
 * basket is recorded as what the questions were asked for (never read for billing). A refused answer writes nothing.
 */
export async function saveIntakeAnswer(
  tenant: TenantContext,
  input: { readonly field: string; readonly values: readonly string[]; readonly services: readonly MonthlyAddOnId[]; readonly now: Date },
): Promise<SaveIntakeOutcome> {
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const row = await findClientIntake(tx, tenant.businessId);
    const parsed = parseIntakeAnswer(input.field, input.values, row === null ? NO_ANSWERS : answersOf(row));
    if (!parsed.ok) return { kind: "refused", message: parsed.message } as const;
    await saveClientIntakeAnswers(tx, { businessId: tenant.businessId, answers: { ...parsed.patch, askedForServices: [...input.services] }, now: input.now });
    return { kind: "saved" } as const;
  });
}

/** Records the basket the questions are now asked for, so a change of services is remembered before the next answer. */
export async function saveIntakeServices(tenant: TenantContext, services: readonly MonthlyAddOnId[], now: Date): Promise<void> {
  await withTenantScope(getAppDb(), tenant, (tx) => saveClientIntakeAnswers(tx, { businessId: tenant.businessId, answers: { askedForServices: [...services] }, now }));
}

/** The customer is done with the questions, answered or not: Continue to checkout, or Skip for now. */
export async function completeIntake(tenant: TenantContext, now: Date): Promise<void> {
  await withTenantScope(getAppDb(), tenant, (tx) => completeClientIntake(tx, { businessId: tenant.businessId, now }));
}
