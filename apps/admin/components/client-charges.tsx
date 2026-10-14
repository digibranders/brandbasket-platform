import type { Charge, Plan } from "@firstfold/db";
import type { ReactElement } from "react";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import {
  CHARGE_KIND_LABELS,
  STAFF_CHARGE_KINDS,
  chargeAmountCents,
  chargeLabel,
  chargePricing,
  type StaffChargeKind,
} from "@firstfold/shared/lib/billing/charges";
import {
  MANUAL_PAYMENT_CONFIRM_FIELD,
  MANUAL_PAYMENT_RECEIVED_ON_FIELD,
  MANUAL_PAYMENT_REFERENCE_FIELD,
  MAX_MANUAL_REFERENCE_LENGTH,
} from "@firstfold/shared/lib/billing/manual-payment-form";
import { STAFF_CHARGE_NOTICES, type StaffChargeNotice } from "@firstfold/shared/lib/billing/charge-notices";
import { formatMoney } from "@firstfold/shared/lib/money";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import type { SelectOption } from "@firstfold/shared/ui/select-field";
import { AddChargeForm } from "@/components/add-charge-form";
import { buttonPrimary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
import { ReceivedDateInput } from "@/components/received-date-input";
import { addChargeAction, markChargePaidAction, waiveChargeAction } from "@/app/(protected)/clients/[businessId]/actions";

const KIND_ORDER: readonly StaffChargeKind[] = STAFF_CHARGE_KINDS;
const DEFAULT_KIND: StaffChargeKind = "change_hours";
const CUSTOM_KIND: StaffChargeKind = "custom";

const STATUS_TONES: Readonly<Record<Charge["status"], StatusTone>> = {
  open: "waiting",
  paid: "done",
  waived: "quiet",
};

const STATUS_LABELS: Readonly<Record<Charge["status"], string>> = { open: "To pay", paid: "Paid", waived: "Waived" };


/** What one unit of each priced kind costs this client, tax included, for the kind picker. */
function kindOptionLabel(kind: StaffChargeKind, plan: Plan): string {
  const pricing = chargePricing(kind, plan);
  if (pricing.unitAmountCents === null) return `${CHARGE_KIND_LABELS[kind]} (price below)`;
  const price = formatMoney(chargeAmountCents(pricing.unitAmountCents, 1, plan.taxRateBasisPoints), plan.currency);
  return `${CHARGE_KIND_LABELS[kind]}: ${price} per ${pricing.unit ?? "unit"}`;
}

function kindOptionsFor(plan: Plan): readonly SelectOption[] {
  return KIND_ORDER.map((kind) => ({ value: kind, label: kindOptionLabel(kind, plan) }));
}

function MarkPaidForm({ businessId, charge }: { readonly businessId: string; readonly charge: Charge }): ReactElement {
  const amount = formatMoney(charge.amountCents, charge.currency);
  const prefix = `charge-${charge.id}`;
  return (
    <details className="mt-3">
      <summary className="link-underline cursor-pointer text-sm font-semibold text-accent">Mark paid (bank transfer)</summary>
      <form action={markChargePaidAction} className="mt-3 max-w-xl">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="chargeId" value={charge.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${prefix}-reference`} className={labelClasses}>
              Bank or payment reference
              <RequiredMark />
            </label>
            <input
              id={`${prefix}-reference`}
              name={MANUAL_PAYMENT_REFERENCE_FIELD}
              type="text"
              required
              maxLength={MAX_MANUAL_REFERENCE_LENGTH}
              autoComplete="off"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor={`${prefix}-received-on`} className={labelClasses}>
              Date the money arrived
              <RequiredMark />
            </label>
            <ReceivedDateInput id={`${prefix}-received-on`} name={MANUAL_PAYMENT_RECEIVED_ON_FIELD} />
          </div>
        </div>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input type="checkbox" name={MANUAL_PAYMENT_CONFIRM_FIELD} value="yes" required className={checkboxClasses} />
          <span>
            I’ve checked that {amount} has arrived.
            <RequiredMark />
          </span>
        </label>
        <GatedSubmitButton className={`${buttonPrimary} mt-4`}>Record {amount} as paid</GatedSubmitButton>
      </form>
    </details>
  );
}

function ChargeRow({ businessId, charge }: { readonly businessId: string; readonly charge: Charge }): ReactElement {
  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">{chargeLabel(charge)}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-soft">
            Added <LocalDateTime iso={charge.createdAt.toISOString()} variant="timestamp" />
            {charge.createdByStaffId === null ? " by the customer" : null}
            {charge.paidAt === null ? null : (
              <>
                {" · paid "}
                <LocalDateTime iso={charge.paidAt.toISOString()} variant="timestamp" />
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot tone={STATUS_TONES[charge.status]} label={STATUS_LABELS[charge.status]} />
          <span className="font-serif text-lg tabular-nums">{formatMoney(charge.amountCents, charge.currency)}</span>
        </div>
      </div>
      {charge.status !== "open" ? null : (
        <div className="flex flex-wrap items-start gap-x-6">
          <MarkPaidForm businessId={businessId} charge={charge} />
          <form action={waiveChargeAction} className="mt-3">
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="chargeId" value={charge.id} />
            <button type="submit" className="link-underline text-sm font-semibold text-ink-soft hover:text-ink">
              Waive
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

interface ClientChargesProps {
  readonly businessId: string;
  readonly charges: readonly Charge[];
  /** The client's plan, for prices. Null when their currency has none: then nothing can be added. */
  readonly plan: Plan | null;
  readonly notice: StaffChargeNotice | null;
}

/**
 * The client page's Extras section: one-off charges beside the monthly plan (change hours past the free hour, extra
 * publishes, more blog posts, or anything else agreed), and the form to add one.
 */
export function ClientCharges({ businessId, charges, plan, notice }: ClientChargesProps): ReactElement {
  const open = charges.filter((charge) => charge.status === "open").length;
  return (
    <Section id="extras" title="Extras" aside={open === 0 ? "One-off charges" : `${open} to pay`}>
      {notice === null ? null : (
        <Notice tone={STAFF_CHARGE_NOTICES[notice].ok ? "ok" : "problem"} className="mb-6">
          {STAFF_CHARGE_NOTICES[notice].text}
        </Notice>
      )}
      {charges.length === 0 ? (
        <Quiet>No charges yet.</Quiet>
      ) : (
        <ul className="max-w-3xl divide-y divide-line">
          {charges.map((charge) => (
            <ChargeRow key={charge.id} businessId={businessId} charge={charge} />
          ))}
        </ul>
      )}
      {plan === null ? (
        <p className="mt-8 text-sm text-ink-soft">
          Charges can’t be added: there is no plan for this client’s currency to price them from.
        </p>
      ) : (
        <AddChargeForm
          businessId={businessId}
          kindOptions={kindOptionsFor(plan)}
          defaultKind={DEFAULT_KIND}
          customKind={CUSTOM_KIND}
          currency={plan.currency}
          taxNote={plan.taxRateBasisPoints > 0 ? `with ${String(plan.taxRateBasisPoints / 100)}% GST added` : null}
          action={addChargeAction}
        />
      )}
    </Section>
  );
}
