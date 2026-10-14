"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { isValidGstin, normaliseGstin, stateCodeOfGstin } from "@fynix/billing/gstin";
import { INDIA_STATES, stateName } from "@fynix/shared/lib/directory/india-states";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { FIELD_PATTERNS } from "@fynix/shared/lib/forms/input-rules";
import { lookupBillingPincodeAction } from "@/app/app-host/(protected)/billing/actions";
import {
  FIELD_CLASSES,
  PanelFormStatus,
  usePanelForm,
  type FieldStatus,
  type PanelFormAction,
  type PanelFormControls,
} from "@/components/panel/form/panel-form";
import type { BillingDetailsView } from "@/lib/billing/billing-details-view";

const LABEL = "block text-[0.8125rem] font-medium text-ink-soft";
export const SAVED_TEXT = "Saved. Your next invoice uses these details.";
const GSTIN_LENGTH = 15;
const PINCODE_LENGTH = 6;
const GSTIN_TITLE = "15 characters, like 27AAPFU0939F1ZV";
const PINCODE_TITLE = "6 digits, not starting with 0";
const INVALID_GSTIN_TEXT = "This GSTIN is not valid. Check it against your GST registration certificate.";
const STATE_OPTIONS: readonly SelectOption[] = INDIA_STATES.map((state) => ({ value: state.code, label: state.name }));

interface BillingDetailsFormProps {
  readonly view: BillingDetailsView;
  readonly action: PanelFormAction;
  /** "wide" puts pincode and city side by side from 640 px up; "narrow" keeps one column, for a checkout's side column. */
  readonly layout: "wide" | "narrow";
}

/** What a pincode lookup told the form, for the line under the pincode field. */
type PincodeNote = { readonly kind: "found"; readonly place: string } | { readonly kind: "not-found" } | null;

/**
 * The billing details form. A checkbox opens the GSTIN and the legal name; without it an invoice goes to the business's
 * name. The pincode fills the state and suggests the city, and a GSTIN fixes the state itself. Its fields are controlled
 * so those fills can happen, and so a refused save keeps what was typed. The server checks everything again.
 */
export function BillingDetailsForm({ view, action, layout }: BillingDetailsFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const { start, businessName } = view;
  const [hasGstin, setHasGstin] = useState(start.gstin !== "");
  const [gstin, setGstin] = useState(start.gstin);
  const [legalName, setLegalName] = useState(start.legalName);
  const [addressLine1, setAddressLine1] = useState(start.addressLine1);
  const [addressLine2, setAddressLine2] = useState(start.addressLine2);
  const [postalCode, setPostalCode] = useState(start.postalCode);
  const [city, setCity] = useState(start.city);
  const [stateCode, setStateCode] = useState(start.stateCode);
  const [pincodeNote, setPincodeNote] = useState<PincodeNote>(null);
  // The city is the customer's once they type in it; until then a pincode lookup may replace it.
  const cityIsTyped = useRef(start.city !== "");
  // Only the newest lookup may fill the form: a slow answer for an earlier pincode is dropped.
  const lookupId = useRef(0);

  /** A full pincode fills the state and suggests the city; anything shorter clears the note under the field. */
  const changePincode = (next: string): void => {
    setPostalCode(next);
    const pin = next.replace(/\s+/g, "");
    const id = ++lookupId.current;
    if (pin.length !== PINCODE_LENGTH) {
      setPincodeNote(null);
      return;
    }
    void lookupBillingPincodeAction(pin)
      .then((found) => {
        if (id !== lookupId.current) return;
        if (found.kind === "no-directory") {
          // Nothing to look it up in: say nothing, and leave the state and city to the customer.
          setPincodeNote(null);
          return;
        }
        if (found.kind === "not-found") {
          setPincodeNote({ kind: "not-found" });
          return;
        }
        setPincodeNote({ kind: "found", place: `${found.district}, ${found.stateName}` });
        setStateCode(found.stateCode);
        if (!cityIsTyped.current) setCity(found.district);
      })
      .catch(() => {
        if (id === lookupId.current) setPincodeNote(null);
      });
  };

  const gstinInput = useRef<HTMLInputElement>(null);

  const gstinText = normaliseGstin(gstin);
  const gstinChecked = gstinText.length === GSTIN_LENGTH ? isValidGstin(gstinText) : null;
  const gstinState = hasGstin && gstinChecked === true ? stateCodeOfGstin(gstinText) : null;
  const gstinProblem = problemFor(controls, "gstin") ?? (gstinChecked === false ? INVALID_GSTIN_TEXT : null);

  // A full-length GSTIN that fails its check character holds the submit button back, as the server would refuse it.
  useEffect(() => {
    gstinInput.current?.setCustomValidity(hasGstin && gstinChecked === false ? INVALID_GSTIN_TEXT : "");
  }, [hasGstin, gstinChecked]);

  return (
    <form ref={formRef} action={formAction} noValidate className="max-w-xl space-y-5">
      <div>
        <label className="flex items-start gap-3 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="hasGstin"
            checked={hasGstin}
            onChange={(event) => setHasGstin(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
            {...statusOf(controls, "hasGstin", "billing-hasGstin", false, "billing-hasGstin-hint")}
          />
          <span>My business has a GSTIN</span>
        </label>
        <div className="pl-7">
          <FieldError id="billing-hasGstin-error" message={problemFor(controls, "hasGstin")} />
        </div>
        <p id="billing-hasGstin-hint" className="mt-1.5 pl-7 text-xs leading-relaxed text-ink-soft">
          {hasGstin
            ? "Your invoice will be made out to your registered name and GSTIN, so you can claim input tax credit."
            : `Not registered for GST? No problem: your invoice will be made out to ${businessName}.`}
        </p>
      </div>

      {hasGstin ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="billing-gstin" className={LABEL}>
              GSTIN <RequiredMark />
            </label>
            <RuleInput
              ref={gstinInput}
              rule="code"
              id="billing-gstin"
              name="gstin"
              value={gstin}
              onChange={(event) => setGstin(event.target.value)}
              required
              pattern={FIELD_PATTERNS.gstin}
              maxLength={GSTIN_LENGTH}
              title={GSTIN_TITLE}
              autoComplete="off"
              spellCheck={false}
              className={FIELD_CLASSES}
              {...statusOf(controls, "gstin", "billing-gstin", gstinProblem !== null, "billing-gstin-hint")}
            />
            <FieldError id="billing-gstin-error" message={gstinProblem} />
            <p id="billing-gstin-hint" className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              {gstinState === null
                ? "15 characters, on your GST registration certificate."
                : `Valid. Registered in ${stateName(gstinState) ?? gstinState}.`}
            </p>
          </div>
          <TextField
            controls={controls}
            name="legalName"
            label="Legal business name"
            value={legalName}
            onChange={setLegalName}
            maxLength={200}
            autoComplete="organization"
            hint="As it appears on your GST registration, in English letters."
          />
        </div>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink">Billing address</legend>
        <TextField
          controls={controls}
          name="addressLine1"
          label="Address line 1"
          value={addressLine1}
          onChange={setAddressLine1}
          maxLength={200}
          autoComplete="address-line1"
        />
        <TextField
          controls={controls}
          name="addressLine2"
          label="Address line 2"
          optional
          value={addressLine2}
          onChange={setAddressLine2}
          maxLength={200}
          autoComplete="address-line2"
        />
        <div className={layout === "wide" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
          <TextField
            controls={controls}
            name="postalCode"
            label="Pincode"
            value={postalCode}
            onChange={changePincode}
            rule="digits"
            pattern={FIELD_PATTERNS.pincode}
            title={PINCODE_TITLE}
            maxLength={PINCODE_LENGTH}
            autoComplete="postal-code"
            hint={pincodeHint(pincodeNote)}
          />
          <TextField
            controls={controls}
            name="city"
            label="City"
            value={city}
            onChange={(next) => {
              cityIsTyped.current = next !== "";
              setCity(next);
            }}
            maxLength={100}
            autoComplete="address-level2"
          />
        </div>
        {gstinState === null ? (
          <div>
            <label htmlFor="billing-stateCode" className={LABEL}>
              State <RequiredMark />
            </label>
            <SelectField
              id="billing-stateCode"
              name="stateCode"
              options={STATE_OPTIONS}
              value={stateCode}
              onChange={setStateCode}
              placeholder="Choose your state"
              required
              searchable
              className={FIELD_CLASSES}
              {...statusOf(controls, "stateCode", "billing-stateCode", false, undefined)}
            />
            <FieldError id="billing-stateCode-error" message={problemFor(controls, "stateCode")} />
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            State: <span className="text-ink">{stateName(gstinState) ?? gstinState}</span>, taken from your GSTIN.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save billing details
        </SubmitButton>
        {/* The one live region. A problem with a field is shown under that field, so here it is read out only. */}
        <div className={controls.invalidField === null ? undefined : "sr-only"}>
          <PanelFormStatus controls={controls} statusRef={statusRef} savedText={SAVED_TEXT} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        Invoices issued after you save use these details. Invoices already issued stay as they are.
      </p>
    </form>
  );
}

function pincodeHint(note: PincodeNote): string | undefined {
  if (note === null) return undefined;
  return note.kind === "found" ? note.place : "We could not find this pincode. Check it, or carry on if it is new.";
}

/** The message to show under `name`, or null when the shown problem is about another field. */
function problemFor(controls: PanelFormControls, name: string): string | null {
  return controls.invalidField === name ? controls.errorMessage : null;
}

/**
 * Wires a field to the message under it and to its help text: `aria-invalid` and `aria-describedby` while the field
 * has a problem, and the help text always.
 */
function statusOf(controls: PanelFormControls, name: string, id: string, hasLocalProblem: boolean, hintId: string | undefined): FieldStatus {
  const invalid = controls.invalidField === name || hasLocalProblem;
  const describedBy = [invalid ? `${id}-error` : undefined, hintId].filter((part): part is string => part !== undefined);
  return {
    ...(invalid ? { "aria-invalid": true as const } : {}),
    ...(describedBy.length === 0 ? {} : { "aria-describedby": describedBy.join(" ") }),
  };
}

function FieldError({ id, message }: { readonly id: string; readonly message: string | null }): ReactElement | null {
  if (message === null) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-accent-deep">
      {message}
    </p>
  );
}

interface TextFieldProps {
  readonly controls: PanelFormControls;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly maxLength: number;
  readonly optional?: boolean;
  readonly hint?: string;
  readonly autoComplete?: string;
  /** Filters keystrokes (digits for a pincode) and, with `pattern`, says what a finished value looks like. */
  readonly rule?: "digits";
  readonly pattern?: string;
  readonly title?: string;
}

function TextField({ controls, name, label, value, onChange, maxLength, optional = false, hint, autoComplete, rule, pattern, title }: TextFieldProps): ReactElement {
  const id = `billing-${name}`;
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const inputProps = {
    id,
    name,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement>): void => onChange(event.target.value),
    maxLength,
    required: !optional,
    className: FIELD_CLASSES,
    ...(pattern === undefined ? {} : { pattern }),
    ...(title === undefined ? {} : { title }),
    ...(autoComplete === undefined ? {} : { autoComplete }),
    ...statusOf(controls, name, id, false, hintId),
  };
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label} {optional ? <span className="font-normal">(optional)</span> : <RequiredMark />}
      </label>
      {rule === undefined ? <input type="text" {...inputProps} /> : <RuleInput rule={rule} {...inputProps} />}
      <FieldError id={`${id}-error`} message={problemFor(controls, name)} />
      {hint === undefined ? null : (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}
