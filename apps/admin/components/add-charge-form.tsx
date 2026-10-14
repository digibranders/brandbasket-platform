"use client";

import { useState, type ReactElement } from "react";
import {
  CHARGE_DESCRIPTION_FIELD,
  CHARGE_KIND_FIELD,
  CHARGE_PRICE_FIELD,
  CHARGE_QUANTITY_FIELD,
  MAX_CHARGE_DESCRIPTION_LENGTH,
  MAX_CHARGE_QUANTITY,
} from "@firstfold/shared/lib/billing/charge-form";
import { FIELD_PATTERNS } from "@firstfold/shared/lib/forms/input-rules";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";

interface AddChargeFormProps {
  readonly businessId: string;
  /** Each kind a charge can be, labelled with what one unit costs this client. */
  readonly kindOptions: readonly SelectOption[];
  /** The kind the picker starts on. */
  readonly defaultKind: string;
  /** The kind whose description and price staff must give themselves. */
  readonly customKind: string;
  readonly currency: string;
  /** How the plan's tax is described, for example "with 18% GST added"; null when the plan has none. */
  readonly taxNote: string | null;
  readonly action: (formData: FormData) => Promise<void>;
}

/** Whole numbers from 1 to MAX_CHARGE_QUANTITY, which is the range the server accepts. */
const QUANTITY_PATTERN = `(?:${String(MAX_CHARGE_QUANTITY)}|[1-9][0-9]?)`;

/**
 * The Extras section's Add a charge form. A priced kind takes its price from the client's plan, so the description and
 * price are only required, and only used, when staff pick the custom kind.
 */
export function AddChargeForm({ businessId, kindOptions, defaultKind, customKind, currency, taxNote, action }: AddChargeFormProps): ReactElement {
  const [kind, setKind] = useState(defaultKind);
  const isCustom = kind === customKind;
  return (
    <form action={action} className="mt-10">
      <h3 className="font-serif text-xl">Add a charge</h3>
      <p className={`${hintClasses} max-w-xl`}>
        Priced from this client’s plan in {currency}
        {taxNote === null ? null : `, ${taxNote}`}. They see it under To pay on their Billing page and can pay it online;
        you can also mark it paid or waive it here.
      </p>
      <input type="hidden" name="businessId" value={businessId} />
      <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="charge-kind" className={labelClasses}>
            What it’s for
            <RequiredMark />
          </label>
          <SelectField
            id="charge-kind"
            name={CHARGE_KIND_FIELD}
            required
            options={kindOptions}
            value={kind}
            onChange={setKind}
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="charge-quantity" className={labelClasses}>
            How many
            <RequiredMark />
          </label>
          <RuleInput
            rule="digits"
            id="charge-quantity"
            name={CHARGE_QUANTITY_FIELD}
            required
            pattern={QUANTITY_PATTERN}
            title={`A whole number from 1 to ${String(MAX_CHARGE_QUANTITY)}`}
            maxLength={String(MAX_CHARGE_QUANTITY).length}
            defaultValue="1"
            autoComplete="off"
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="charge-description" className={labelClasses}>
            Description <span className="font-normal text-ink-soft">(for Something else)</span>
            {isCustom ? <RequiredMark /> : null}
          </label>
          <input
            id="charge-description"
            name={CHARGE_DESCRIPTION_FIELD}
            type="text"
            required={isCustom}
            maxLength={MAX_CHARGE_DESCRIPTION_LENGTH}
            placeholder="Shown to the customer"
            autoComplete="off"
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="charge-price" className={labelClasses}>
            Price each, before tax <span className="font-normal text-ink-soft">(Something else only)</span>
            {isCustom ? <RequiredMark /> : null}
          </label>
          <RuleInput
            rule="amount"
            id="charge-price"
            name={CHARGE_PRICE_FIELD}
            required={isCustom}
            pattern={FIELD_PATTERNS.amount}
            title="An amount like 2500 or 25.50"
            placeholder={currency === "INR" ? "e.g. 2500" : "e.g. 25"}
            autoComplete="off"
            className={fieldClasses}
          />
        </div>
      </div>
      <GatedSubmitButton className={`${buttonSecondary} mt-6`}>Add charge</GatedSubmitButton>
    </form>
  );
}
