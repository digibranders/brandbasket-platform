import "server-only";
import {
  findChargeForBusiness,
  findPlanUpgradeByCharge,
  findPlanUpgradeInFlight,
  listPlanUpgradesForBusiness,
  resolvePaymentAttention,
  type PlanUpgrade,
} from "@firstfold/db";
import { ensureDiscountPlanFor } from "@firstfold/shared/server/discount-plans";
import {
  assessUpgrade,
  finishUpgradeAtProvider,
  readAssessmentInput,
  startUpgrade,
  type UpgradeAssessment,
  type UpgradeFinish,
} from "@firstfold/shared/server/plan-upgrade";
import { getBillingProvider } from "./billing-provider";
import { getStaffDb } from "./db";

/*
 * Moving a client up from Care to Premium, from the staff console (docs/superpowers/specs/2026-10-08-care-to-premium-
 * upgrade-design.md). A client moves themselves from their dashboard, paying the difference; staff move one with
 * nothing to take (they paid offline, or it is a goodwill move), and finish a move whose provider step failed.
 */

/** How many upgrades the client page lists. */
const UPGRADES_SHOWN = 10;

export interface ClientUpgrade {
  /** What the client could do themselves, or why not. A bank-transfer client is looked past: only staff move it. */
  readonly assessment: UpgradeAssessment;
  /** Newest first. */
  readonly history: PlanUpgrade[];
  /** The move that is paid and has not yet reached the provider: staff finish it. */
  readonly needsFinishing: PlanUpgrade | null;
}

/** Everything the client page's Plan section shows. */
export async function readClientUpgrade(businessId: string, now: Date): Promise<ClientUpgrade | null> {
  const db = getStaffDb();
  const input = await readAssessmentInput(db, businessId, getBillingProvider().name, now);
  if (input === null) return null;
  const [history, inFlight] = await Promise.all([listPlanUpgradesForBusiness(db, businessId, UPGRADES_SHOWN), findPlanUpgradeInFlight(db, businessId)]);
  return {
    assessment: assessUpgrade({ ...input, allow: ["manual-billing"] }),
    history,
    needsFinishing: inFlight?.status === "paid" ? inFlight : null,
  };
}

/** What moving a client came to. */
export type MoveOutcome =
  /** Premium is on. `finish` says what the provider step did. */
  | { readonly kind: "moved"; readonly finish: UpgradeFinish }
  | { readonly kind: "refused"; readonly why: "blocked" | "unavailable" | "changed" };

/**
 * Moves a Care client up with nothing to take. The same routine a customer's own move runs, from a fresh reading under the
 * billing lock; a bank-transfer client is allowed past the provider checks (it has none) and switches plan at once.
 * Who did it is on the record. The caller must have checked the signed-in staff member.
 */
export async function moveClientToPremium(input: { readonly businessId: string; readonly staffUserId: string }, now: Date): Promise<MoveOutcome> {
  const provider = getBillingProvider();
  const started = await startUpgrade(getStaffDb(), {
    businessId: input.businessId,
    source: "staff",
    staffId: input.staffUserId,
    providerName: provider.name,
    now,
    allowBlocks: ["manual-billing"],
    noCharge: true,
  });
  if (started.kind === "refused") return { kind: "refused", why: started.assessment.kind };
  if (started.kind === "changed") return { kind: "refused", why: "changed" };
  // Nothing was charged, so there is no charge to pay: `applied` is the only way a staff move opens.
  if (started.kind !== "applied") return { kind: "refused", why: "changed" };
  return { kind: "moved", finish: await finishAtProvider(started.upgrade.id, now) };
}

/**
 * Tells the provider to bill Premium from the next renewal for a move that is paid but did not get there: a retry of the
 * step that failed after the customer's payment. When it works, the payment that was flagged for it is marked dealt
 * with, by this staff member. Safe to repeat.
 */
export async function finishClientUpgrade(input: { readonly businessId: string; readonly staffUserId: string }, now: Date): Promise<UpgradeFinish> {
  const db = getStaffDb();
  const upgrade = await findPlanUpgradeInFlight(db, input.businessId);
  if (upgrade === null || upgrade.status !== "paid") return { kind: "nothing" };
  const finish = await finishAtProvider(upgrade.id, now);
  if (finish.kind === "scheduled" || finish.kind === "completed") await resolveFlaggedPayment(upgrade, input, now);
  return finish;
}

/** After a staff member marks an upgrade's charge paid by bank transfer: the provider step the payment path leaves to its caller. */
export async function finishUpgradeForChargeAfterManualPayment(chargeId: string, now: Date): Promise<void> {
  const upgrade = await findPlanUpgradeByCharge(getStaffDb(), chargeId);
  if (upgrade !== null && upgrade.status === "paid") await finishAtProvider(upgrade.id, now);
}

function finishAtProvider(upgradeId: string, now: Date): Promise<UpgradeFinish> {
  const db = getStaffDb();
  return finishUpgradeAtProvider(
    { staffDb: db, provider: getBillingProvider(), ensureDiscountPlan: (provider, plan, cents) => ensureDiscountPlanFor(db, provider, plan, cents) },
    upgradeId,
    now,
  );
}

async function resolveFlaggedPayment(
  upgrade: PlanUpgrade,
  input: { readonly businessId: string; readonly staffUserId: string },
  now: Date,
): Promise<void> {
  if (upgrade.chargeId === null) return;
  const charge = await findChargeForBusiness(getStaffDb(), input.businessId, upgrade.chargeId);
  if (charge?.paymentId == null) return;
  await resolvePaymentAttention(getStaffDb(), { paymentId: charge.paymentId, businessId: input.businessId, staffUserId: input.staffUserId, now });
}
