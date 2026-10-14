import type { PlanUpgrade } from "@firstfold/db";
import type { ReactElement } from "react";
import { PLAN_TIER_LABELS } from "@firstfold/shared/lib/billing/plan-tier";
import { formatMoney } from "@firstfold/shared/lib/money";
import type { UpgradeBlock } from "@firstfold/shared/lib/billing/upgrade";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, hintClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
import { finishUpgradeAction, moveToPremiumAction } from "@/app/(protected)/clients/[businessId]/actions";
import { PLAN_UPGRADE_NOTICES, type PlanUpgradeNotice } from "@/lib/plan-upgrade-notices";
import type { ClientUpgrade } from "@/lib/server/plan-upgrade-admin";

interface ClientPlanProps {
  readonly businessId: string;
  readonly tier: "care" | "premium";
  readonly upgrade: ClientUpgrade;
  readonly notice: PlanUpgradeNotice | null;
}

const STATUS_LABELS: Readonly<Record<PlanUpgrade["status"], string>> = {
  open: "Waiting for payment",
  paid: "Paid, provider not told yet",
  scheduled: "Premium from the next renewal",
  completed: "Premium renewal taken",
  cancelled: "Cancelled",
};

const STATUS_TONES: Readonly<Record<PlanUpgrade["status"], StatusTone>> = {
  open: "waiting",
  paid: "problem",
  scheduled: "done",
  completed: "done",
  cancelled: "quiet",
};

/** Why a client cannot move themselves, in staff's words. */
const BLOCK_NOTES: Readonly<Record<UpgradeBlock, string>> = {
  "already-premium": "They are on Premium.",
  "already-moving": "A move up is paid for and is waiting for their next renewal.",
  "manual-billing": "They pay by bank transfer, so only staff can move them.",
  ending: "Their plan is ending (they asked to leave).",
  "payment-failing": "Their last payment failed, so they can’t be moved until it goes through.",
  lapsed: "Their plan has lapsed: restart it first.",
  unpaid: "They haven’t paid for a plan.",
  "under-review": "A payment is waiting for staff to sort out.",
};

/**
 * The Plan section of a client's page: what plan they are on, what moving up would cost them if they did it themselves,
 * every move so far, and the two things staff can do: move a Care client up with nothing to take, and finish a move whose
 * provider step failed after the client paid (docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-design.md).
 */
export function ClientPlan({ businessId, tier, upgrade, notice }: ClientPlanProps): ReactElement {
  const { assessment, history, needsFinishing } = upgrade;
  const canMove = tier === "care" && (assessment.kind === "offer" || (assessment.kind === "blocked" && assessment.reason === "manual-billing"));
  return (
    <Section title="Plan" id="plan" aside={`${PLAN_TIER_LABELS[tier]} plan`}>
      {notice === null ? null : (
        <Notice tone={PLAN_UPGRADE_NOTICES[notice].ok ? "ok" : "problem"} className="mb-6">
          {PLAN_UPGRADE_NOTICES[notice].text}
        </Notice>
      )}

      {tier === "premium" && history.length === 0 ? <Quiet>On Premium. Nothing to change here.</Quiet> : null}

      {tier === "care" ? (
        <div className="max-w-2xl">
          {assessment.kind === "offer" ? (
            <p className="text-sm leading-relaxed">
              Moving up themselves, they would pay{" "}
              <span className="font-medium tabular-nums">{assessment.quote.free ? "nothing" : formatMoney(assessment.quote.chargeCents, assessment.premium.currency)}</span>{" "}
              today for the {assessment.quote.daysLeft} {assessment.quote.daysLeft === 1 ? "day" : "days"} left of {assessment.quote.periodDays}, then{" "}
              <span className="font-medium tabular-nums">{formatMoney(assessment.quote.nextRenewalCents, assessment.premium.currency)}</span> a month from their next renewal.
            </p>
          ) : assessment.kind === "blocked" ? (
            <Quiet>{BLOCK_NOTES[assessment.reason]}</Quiet>
          ) : (
            <Quiet>
              A move can’t be worked out for them right now ({assessment.reason.replace(/-/g, " ")}).
            </Quiet>
          )}

          {canMove ? (
            <form action={moveToPremiumAction} className="mt-6 border-t border-line pt-6">
              <input type="hidden" name="businessId" value={businessId} />
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="confirm" value="yes" required className={checkboxClasses} />
                <span>
                  Move them to Premium without charging them. Their dashboard becomes Premium’s now; Premium’s price starts at their next renewal
                  {assessment.kind === "blocked" ? " (they pay by bank transfer, so the plan changes at once)" : ""}.
                  <RequiredMark />
                </span>
              </label>
              <p className={hintClasses}>Use this when they paid us outside the dashboard, or when you are moving them as a favour.</p>
              <GatedSubmitButton className={`${buttonPrimary} mt-4`}>Move to Premium</GatedSubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {needsFinishing === null ? null : (
        <form action={finishUpgradeAction} className="mt-6 max-w-2xl border-t border-line pt-6">
          <input type="hidden" name="businessId" value={businessId} />
          <p className="text-sm leading-relaxed">
            They have Premium, but the payment provider hasn’t been told to bill Premium from their next renewal. Until it is, their renewal would be taken at
            Care’s price.
          </p>
          <button type="submit" className={`${buttonSecondary} mt-4`}>
            Finish the move
          </button>
        </form>
      )}

      {history.length === 0 ? null : (
        <ul className="mt-8 max-w-2xl divide-y divide-line">
          {history.map((move) => (
            <li key={move.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 text-sm first:pt-0">
              <span>
                <span className="font-medium">Care to Premium</span>
                {" · "}
                <span className="tabular-nums text-ink-soft">{move.chargeCents === 0 ? "nothing taken" : formatMoney(move.chargeCents, "INR")}</span>
                {move.source === "staff" ? " · by staff" : ""}
              </span>
              <span className="flex items-center gap-4 tabular-nums text-ink-soft">
                <StatusDot tone={STATUS_TONES[move.status]} label={STATUS_LABELS[move.status]} />
                <LocalDateTime iso={move.createdAt.toISOString()} variant="timestamp" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
