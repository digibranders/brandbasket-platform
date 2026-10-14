"use client";

import type { ReactElement } from "react";
import type { PhoneCountryOption } from "@fynix/shared/lib/phone/fields";
import {
  ALT_PHONE_COUNTRY_FIELD,
  ALT_PHONE_FIELD,
  PATIENT_ID_FIELD,
  PATIENT_NAME_FIELD,
  PATIENT_TAGS_FIELD,
} from "@fynix/shared/lib/patients/fields";
import { PATIENT_NAME_MAX_LENGTH, PATIENT_TAG_MAX_LENGTH, PATIENT_TAGS_MAX } from "@fynix/shared/lib/patients/limits";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { PhoneField } from "@fynix/shared/ui/phone-field";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

/** Every tag, the commas between them, and a space after each: the most the tags input can usefully hold. */
const TAGS_INPUT_MAX_LENGTH = PATIENT_TAGS_MAX * (PATIENT_TAG_MAX_LENGTH + 2);

interface PatientEditFormProps {
  readonly patientId: string;
  readonly name: string;
  /** The second phone split for the phone field (savedPhoneStart, server-side): its country, and the number as it
   * would be typed there. Blank when there is none. */
  readonly altPhoneCountry: string;
  readonly altPhoneNumber: string;
  readonly tags: readonly string[];
  /** Built on the server (phoneCountryOptions): libphonenumber's metadata never reaches the browser. */
  readonly phoneCountries: readonly PhoneCountryOption[];
  /** The country the second phone starts on when it has none of its own: the patient's main number's. */
  readonly defaultPhoneCountry: string;
  readonly action: PanelFormAction;
}

/**
 * The profile's Edit form: name, a second phone, and tags typed as one comma-separated line. Tags are short labels
 * for reception ("VIP", "Wheelchair"); the label says, in as few words as possible, that they are not the place for
 * anything medical. Saves in place: the page revalidates and this form redraws from the saved patient.
 */
export function PatientEditForm({
  patientId,
  name,
  altPhoneCountry,
  altPhoneNumber,
  tags,
  phoneCountries,
  defaultPhoneCountry,
  action,
}: PatientEditFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  return (
    <form ref={formRef} action={formAction} className="max-w-lg space-y-5">
      <input type="hidden" name={PATIENT_ID_FIELD} value={patientId} />
      <div>
        <label htmlFor="patient-name" className="block text-[0.8125rem] font-medium text-ink-soft">
          Name <RequiredMark />
        </label>
        <RuleInput
          rule="personName"
          id="patient-name"
          name={PATIENT_NAME_FIELD}
          required
          maxLength={PATIENT_NAME_MAX_LENGTH}
          autoComplete="off"
          defaultValue={controls.valueOf(PATIENT_NAME_FIELD, name)}
          className={FIELD_CLASSES}
          {...controls.fieldStatus(PATIENT_NAME_FIELD)}
        />
      </div>
      <div>
        <label htmlFor="patient-alt-phone" className="block text-[0.8125rem] font-medium text-ink-soft">
          Second phone <span className="font-normal">(optional)</span>
        </label>
        <PhoneField
          id="patient-alt-phone"
          numberName={ALT_PHONE_FIELD}
          countryName={ALT_PHONE_COUNTRY_FIELD}
          countries={phoneCountries}
          country={controls.valueOf(ALT_PHONE_COUNTRY_FIELD, altPhoneCountry)}
          defaultCountry={defaultPhoneCountry}
          number={controls.valueOf(ALT_PHONE_FIELD, altPhoneNumber)}
          size="compact"
          numberStatus={controls.fieldStatus(ALT_PHONE_FIELD)}
          countryStatus={controls.fieldStatus(ALT_PHONE_COUNTRY_FIELD)}
          className="mt-1.5"
        />
      </div>
      <div>
        <label htmlFor="patient-tags" className="block text-[0.8125rem] font-medium text-ink-soft">
          Tags <span className="font-normal">· No medical details</span>
        </label>
        <input
          id="patient-tags"
          name={PATIENT_TAGS_FIELD}
          type="text"
          maxLength={TAGS_INPUT_MAX_LENGTH}
          autoComplete="off"
          placeholder="VIP, Prefers mornings"
          defaultValue={controls.valueOf(PATIENT_TAGS_FIELD, tags.join(", "))}
          className={FIELD_CLASSES}
          {...controls.fieldStatus(PATIENT_TAGS_FIELD)}
        />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" disabled={controls.isPending} pendingLabel="Saving…">
          Save
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}
