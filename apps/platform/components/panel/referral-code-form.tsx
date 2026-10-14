"use client";

import type { ReactElement } from "react";
import { CheckCircleIcon } from "@firstfold/shared/ui/icons";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { MAX_REFERRAL_CODE_LENGTH, MIN_REFERRAL_CODE_LENGTH } from "@firstfold/billing/referral";
import { STEP_FIELD_CLASSES, STEP_FIELD_COMPACT_CLASSES, StepFormError, useStepForm, type StepAction } from "@/components/panel/step-form";
import type { PlanDiscount } from "@firstfold/shared/lib/billing/terms";
import { describeDiscount } from "@firstfold/shared/lib/billing/terms";
import type { MoneyCurrency } from "@firstfold/shared/lib/money";

interface ReferralCodeFormProps {
  readonly applyAction: StepAction;
  readonly removeAction: StepAction;
  /** The discount in force, or null when no code is applied. */
  readonly discount: PlanDiscount | null;
  /** The plan's currency, so the discount reads as money rather than a bare number. */
  readonly currency: MoneyCurrency;
  /** The field's label. Check and send asks for a referral code; Premium simply for a code. */
  readonly label?: string;
  /**
   * A code the business applied earlier that has since stopped working (turned off, expired, used up), so the page
   * says why the discount went instead of letting it disappear. Ignored while a discount is in force.
   */
  readonly lapsedCode?: string | null;
  /** A shorter field and button, for a page where the code is a side matter next to the price (the plan pages). */
  readonly compact?: boolean;
}

const FIELD_NAME = "referralCode";
/**
 * A finished code, as the server reads it after trimming and upper-casing (normaliseReferralCode): letters, digits
 * and hyphens, opening with a letter or digit. The hyphen is escaped because the browser compiles patterns with the
 * `v` flag.
 */
const CODE_PATTERN = `\\s*[A-Za-z0-9][A-Za-z0-9\\-]{${MIN_REFERRAL_CODE_LENGTH - 1},${MAX_REFERRAL_CODE_LENGTH - 1}}\\s*`;

/**
 * "Have a referral code?" on Check and send. Applying one is its own step, so the Pay button beside it can show the
 * discounted price: a button that said one price while the checkout charged another would be the worst possible
 * place in the product to be imprecise.
 *
 * Nothing here decides anything. The code is validated, and the discount computed, on the server; this only shows
 * what came back.
 */
export function ReferralCodeForm({
  applyAction,
  removeAction,
  discount,
  currency,
  label = "Have a referral code?",
  lapsedCode = null,
  compact = false,
}: ReferralCodeFormProps): ReactElement {
  return discount === null ? (
    <div className="space-y-3">
      {lapsedCode === null ? null : (
        <p role="status" className="rounded-control bg-paper-deep px-4 py-3 text-sm text-ink">
          Code <span className="font-semibold tracking-[0.08em]">{lapsedCode}</span> can’t be used any more, so the
          full price applies. You can try another code.
        </p>
      )}
      <ApplyForm action={applyAction} label={label} compact={compact} />
    </div>
  ) : (
    <AppliedCode action={removeAction} discount={discount} currency={currency} />
  );
}

function ApplyForm({ action, label, compact }: { readonly action: StepAction; readonly label: string; readonly compact: boolean }): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action);
  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <StepFormError controls={controls} errorRef={errorRef} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={`field-${FIELD_NAME}`} className="block text-sm font-medium">
            {label}
            <span className="font-normal text-ink-soft"> (optional)</span>
          </label>
          <input
            id={`field-${FIELD_NAME}`}
            name={FIELD_NAME}
            type="text"
            // Optional for the page, but the Apply button has nothing to apply without one.
            required
            pattern={CODE_PATTERN}
            title={`${MIN_REFERRAL_CODE_LENGTH} to ${MAX_REFERRAL_CODE_LENGTH} letters, digits or hyphens`}
            maxLength={MAX_REFERRAL_CODE_LENGTH}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. FRIEND15"
            defaultValue={controls.valueOf(FIELD_NAME, null)}
            className={`${compact ? STEP_FIELD_COMPACT_CLASSES : STEP_FIELD_CLASSES} uppercase`}
            {...controls.fieldStatus(FIELD_NAME)}
          />
        </div>
        <SubmitButton size="sm" variant="secondary" disabled={controls.isPending} className={compact ? "py-1.5!" : undefined}>
          {controls.isPending ? "Checking…" : "Apply"}
        </SubmitButton>
      </div>
    </form>
  );
}

function AppliedCode({
  action,
  discount,
  currency,
}: {
  readonly action: StepAction;
  readonly discount: PlanDiscount;
  readonly currency: MoneyCurrency;
}): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action);
  const worth = describeDiscount(discount, currency);
  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <StepFormError controls={controls} errorRef={errorRef} />
      <div className="flex flex-wrap items-center gap-3 rounded-control bg-success-pale px-4 py-3 text-success-deep ring-1 ring-inset ring-success/25">
        <CheckCircleIcon className="size-5 shrink-0 text-success" />
        <p className="flex-1 text-sm">
          Code <span className="font-semibold tracking-[0.08em]">{discount.code}</span> applied
          {worth === null ? "." : <>. {worth}.</>}
        </p>
        <button
          type="submit"
          disabled={controls.isPending}
          className="link-underline shrink-0 text-sm font-medium disabled:cursor-wait disabled:opacity-70"
        >
          {controls.isPending ? "Removing…" : "Remove"}
        </button>
      </div>
    </form>
  );
}
