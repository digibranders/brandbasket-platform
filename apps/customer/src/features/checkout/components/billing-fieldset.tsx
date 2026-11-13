"use client";

import { isValidGstin, normaliseGstin, stateCodeOfGstin } from "@brandbasket/billing/gstin";
import { INDIA_STATES, stateName } from "@brandbasket/shared/lib/directory/india-states";
import { useRef, useState } from "react";
import type { FieldErrors } from "@/lib/action-result";
import { Checkbox, Combobox, Field, Input, type SelectOption } from "@/ui";
import { lookupPincodeAction } from "../actions";
import type { BillingDetailsView } from "../rules/billing-details-view";

/*
 * The billing details fields, ported from apps/platform components/panel/billing/billing-details-form.tsx (BillingFieldset).
 * A tick opens the GSTIN and the legal name; without it an invoice goes to the business's name. The pincode fills the state
 * and suggests the city, and a GSTIN fixes the state itself. The server checks everything again.
 */

const GSTIN_LENGTH = 15;
const PINCODE_LENGTH = 6;
const INVALID_GSTIN_TEXT = "This GSTIN is not valid. Check it against your GST registration certificate.";
const STATE_OPTIONS: readonly SelectOption[] = INDIA_STATES.map((state) => ({ value: state.code, label: state.name }));

type PincodeNote = { readonly kind: "found"; readonly place: string } | { readonly kind: "not-found" } | null;

export function BillingFieldset({ view, errors }: { readonly view: BillingDetailsView; readonly errors: FieldErrors | undefined }) {
  const { start, businessName } = view;
  const [hasGstin, setHasGstin] = useState(start.gstin !== "");
  const [gstin, setGstin] = useState(start.gstin);
  const [postalCode, setPostalCode] = useState(start.postalCode);
  const [city, setCity] = useState(start.city);
  const [stateCode, setStateCode] = useState(start.stateCode);
  const [note, setNote] = useState<PincodeNote>(null);
  // The city is the customer's once they type in it; until then a pincode lookup may replace it.
  const cityIsTyped = useRef(start.city !== "");
  // Only the newest lookup may fill the form: a slow answer for an earlier pincode is dropped.
  const lookupId = useRef(0);

  const changePincode = (next: string): void => {
    setPostalCode(next);
    const pin = next.replace(/\s+/g, "");
    const id = ++lookupId.current;
    if (pin.length !== PINCODE_LENGTH) {
      setNote(null);
      return;
    }
    void lookupPincodeAction(pin)
      .then((result) => {
        if (id !== lookupId.current || !result.ok || result.data === undefined) return;
        const found = result.data;
        if (found.kind === "no-directory") return setNote(null);
        if (found.kind === "not-found") return setNote({ kind: "not-found" });
        setNote({ kind: "found", place: `${found.district}, ${found.stateName}` });
        setStateCode(found.stateCode);
        if (!cityIsTyped.current) setCity(found.district);
      })
      .catch(() => {
        if (id === lookupId.current) setNote(null);
      });
  };

  const gstinText = normaliseGstin(gstin);
  const gstinChecked = gstinText.length === GSTIN_LENGTH ? isValidGstin(gstinText) : null;
  const gstinState = hasGstin && gstinChecked === true ? stateCodeOfGstin(gstinText) : null;
  const gstinError = errors?.gstin ?? (hasGstin && gstinChecked === false ? INVALID_GSTIN_TEXT : undefined);
  const stateOption = STATE_OPTIONS.find((option) => option.value === stateCode) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Checkbox name="hasGstin" value="on" checked={hasGstin} onCheckedChange={setHasGstin} label="My business has a GSTIN" />
        {errors?.hasGstin === undefined ? null : <p className="type-meta text-neg-text">{errors.hasGstin}</p>}
        <p className="type-meta">
          {hasGstin
            ? "Your invoice will be made out to your registered name and GSTIN, so you can claim input tax credit."
            : `Not registered for GST? No problem: your invoice will be made out to ${businessName}.`}
        </p>
      </div>

      {hasGstin ? (
        <>
          <Field
            label="GSTIN"
            name="gstin"
            error={gstinError}
            hint={gstinState === null ? "15 characters, on your GST registration certificate." : `Valid. Registered in ${stateName(gstinState) ?? gstinState}.`}
          >
            <Input name="gstin" value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} maxLength={GSTIN_LENGTH} autoComplete="off" spellCheck={false} required />
          </Field>
          <Field label="Legal business name" name="legalName" error={errors?.legalName} hint="As it appears on your GST registration, in English letters.">
            <Input name="legalName" defaultValue={start.legalName} maxLength={200} autoComplete="organization" required />
          </Field>
        </>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 type-sub text-ink">Billing address</legend>
        <Field label="Address line 1" name="addressLine1" error={errors?.addressLine1}>
          <Input name="addressLine1" defaultValue={start.addressLine1} maxLength={200} autoComplete="address-line1" required />
        </Field>
        <Field label="Address line 2 (optional)" name="addressLine2" error={errors?.addressLine2}>
          <Input name="addressLine2" defaultValue={start.addressLine2} maxLength={200} autoComplete="address-line2" />
        </Field>
        <Field
          label="Pincode"
          name="postalCode"
          error={errors?.postalCode}
          hint={note === null ? undefined : note.kind === "found" ? note.place : "We could not find this pincode. Check it, or carry on if it is new."}
        >
          <Input name="postalCode" value={postalCode} onChange={(event) => changePincode(event.target.value)} inputMode="numeric" maxLength={PINCODE_LENGTH} autoComplete="postal-code" required />
        </Field>
        <Field label="City" name="city" error={errors?.city}>
          <Input
            name="city"
            value={city}
            onChange={(event) => {
              cityIsTyped.current = event.target.value !== "";
              setCity(event.target.value);
            }}
            maxLength={100}
            autoComplete="address-level2"
            required
          />
        </Field>
        {gstinState === null ? (
          <Field label="State" name="stateCode" error={errors?.stateCode} nativeLabel={false}>
            <Combobox
              name="stateCode"
              options={STATE_OPTIONS}
              value={stateOption}
              onValueChange={(next) => setStateCode(next?.value ?? "")}
              placeholder="Choose your state"
              emptyText="No state matches."
              openLabel="Show states"
            />
          </Field>
        ) : (
          <p className="type-body text-ink-3">
            State: <span className="text-ink">{stateName(gstinState) ?? gstinState}</span>, taken from your GSTIN.
          </p>
        )}
      </fieldset>
    </div>
  );
}
