import type { Lead } from "@brandbasket/db";
import type { ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { BILLING_CURRENCY_LABELS, BILLING_CURRENCY_ORDER } from "@brandbasket/shared/lib/currency";
import { canStaffChangeLeadStatus, LEAD_STATUS_LABELS, STAFF_LEAD_STATUS_ORDER } from "@brandbasket/shared/lib/lead-status";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses, readOnlyValueClasses } from "@/components/console/field-styles";
import { updateLeadDetails } from "@/app/(protected)/leads/[leadId]/actions";

const STATUS_OPTIONS: readonly SelectOption[] = STAFF_LEAD_STATUS_ORDER.map((status) => ({ value: status, label: LEAD_STATUS_LABELS[status] }));
const CURRENCY_OPTIONS: readonly SelectOption[] = BILLING_CURRENCY_ORDER.map((currency) => ({ value: currency, label: BILLING_CURRENCY_LABELS[currency] }));

/** Status, billing currency and private notes. Currency is read-only once billing has started in it. */
export function LeadEditForm({ lead, currencyLocked }: { readonly lead: Lead; readonly currencyLocked: boolean }): ReactElement {
  return (
    <form action={updateLeadDetails}>
      <input type="hidden" name="leadId" value={lead.id} />
      <div className="grid gap-5">
        {canStaffChangeLeadStatus(lead.status) ? (
          <div>
            <label htmlFor="lead-status" className={labelClasses}>
              Status<RequiredMark />
            </label>
            <SelectField id="lead-status" name="status" required options={STATUS_OPTIONS} defaultValue={lead.status} className={fieldClasses} />
            <p className={hintClasses}>Account created and Paid are set for you when the customer signs up and pays.</p>
          </div>
        ) : (
          <div>
            <p className={labelClasses}>Status</p>
            <p className={readOnlyValueClasses}>{LEAD_STATUS_LABELS[lead.status]}</p>
            <p className={hintClasses}>
              Set when the customer {lead.status === "paid" ? "paid" : "created their account"}. It can’t be changed by hand.
            </p>
          </div>
        )}
        {currencyLocked ? (
          <div>
            <p className={labelClasses}>Billed in</p>
            <p className={readOnlyValueClasses}>{BILLING_CURRENCY_LABELS[lead.currency]}</p>
            <p className={hintClasses}>Locked: billing has started in this currency.</p>
          </div>
        ) : (
          <div>
            <label htmlFor="lead-currency" className={labelClasses}>
              Billed in<RequiredMark />
            </label>
            <SelectField id="lead-currency" name="currency" required options={CURRENCY_OPTIONS} defaultValue={lead.currency} className={fieldClasses} />
            <p className={hintClasses}>
              India is billed in INR; everywhere else in USD. New leads start from their phone number, and in USD when they gave none.
              {lead.businessId === null ? null : " They have signed up, so this also changes what checkout charges them."}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="lead-notes" className={labelClasses}>
            Private notes
          </label>
          <textarea id="lead-notes" name="notes" rows={4} defaultValue={lead.notes ?? ""} className={fieldClasses} />
        </div>
      </div>
      <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Saving…">
        Save
      </GatedSubmitButton>
    </form>
  );
}
