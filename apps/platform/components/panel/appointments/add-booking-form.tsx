"use client";

import { useEffect, useRef, type ReactElement } from "react";
import { PHONE_COUNTRY_FIELD, type PhoneCountryOption } from "@fynix/shared/lib/phone/fields";
import {
  BOOKING_DATE_FIELD,
  BOOKING_DOCTOR_FIELD,
  BOOKING_SERVICE_FIELD,
  BOOKING_START_FIELD,
  PATIENT_ID_FIELD,
  PATIENT_NAME_FIELD,
  PATIENT_PHONE_FIELD,
} from "@fynix/shared/lib/patients/fields";
import { PATIENT_NAME_MAX_LENGTH } from "@fynix/shared/lib/patients/limits";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { PhoneField } from "@fynix/shared/ui/phone-field";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

export interface AddBookingService {
  readonly id: string;
  readonly name: string;
}

/** Book again's patient, read on the server through the customer's own tenant scope. */
export interface AddBookingPatient {
  readonly id: string;
  readonly name: string;
  /** Laid out for reading (displayPhoneText is server-only), e.g. "+91 98200 11223". */
  readonly phoneText: string;
}

interface AddBookingFormProps {
  readonly action: PanelFormAction;
  readonly date: string;
  readonly start: string;
  /** The picked slot, e.g. "10:00 – 10:30": the form's heading. */
  readonly slotText: string;
  /** A doctor's id, or ANY_DOCTOR. */
  readonly doctor: string;
  /** The clinic's unarchived services, in display order; none hides the select. */
  readonly services: readonly AddBookingService[];
  /** Null books someone new: name and phone are typed, and the database links or creates their record by phone. */
  readonly patient: AddBookingPatient | null;
  readonly phoneCountries: readonly PhoneCountryOption[];
  readonly defaultPhoneCountry: string;
}

const HEADING_ID = "add-booking-slot-heading";

/** FIELD_CLASSES' look for the dropdown's trigger, which is a flex button: `block` would fight its `flex`, and the
 * top margin sits on the wrapper instead. */
const SELECT_TRIGGER_CLASSES =
  "w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm focus:border-accent aria-[invalid=true]:border-accent-deep";

/** "Any service" is a real choice (the booking is then for no particular service), so it stays an option. */
const ANY_SERVICE_OPTION: SelectOption = { value: "", label: "Any service" };

/**
 * The last step of Add booking, once a free time is picked: who it is for and what for. The slot, day and doctor
 * travel as hidden fields and the action re-checks all three against fresh calendars, so this form is only as
 * trusted as any other input. Success redirects to the booking's day; a refusal stays here with what was typed.
 *
 * The page keys this on the picked slot, so choosing another time mounts it fresh -- a stale "That time was just
 * taken" never lingers beside a different time -- and moves focus to its heading, the way the booking details panel
 * does when it opens.
 */
export function AddBookingForm({
  action,
  date,
  start,
  slotText,
  doctor,
  services,
  patient,
  phoneCountries,
  defaultPhoneCountry,
}: AddBookingFormProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const serviceOptions: readonly SelectOption[] = [
    ANY_SERVICE_OPTION,
    ...services.map((service) => ({ value: service.id, label: service.name })),
  ];
  const startService = controls.valueOf(BOOKING_SERVICE_FIELD, "");

  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <section aria-labelledby={HEADING_ID} className="mt-8 border-t border-line pt-6">
      <h2 id={HEADING_ID} ref={headingRef} tabIndex={-1} className="panel-section tabular-nums outline-none">
        {slotText}
      </h2>
      <form ref={formRef} action={formAction} className="mt-4 max-w-md space-y-5">
        <input type="hidden" name={BOOKING_DATE_FIELD} value={date} />
        <input type="hidden" name={BOOKING_START_FIELD} value={start} />
        <input type="hidden" name={BOOKING_DOCTOR_FIELD} value={doctor} />

        {patient === null ? (
          <>
            <div>
              <label htmlFor="add-booking-name" className="block text-[0.8125rem] font-medium text-ink-soft">
                Name <RequiredMark />
              </label>
              <RuleInput
                rule="personName"
                id="add-booking-name"
                name={PATIENT_NAME_FIELD}
                required
                maxLength={PATIENT_NAME_MAX_LENGTH}
                autoComplete="off"
                defaultValue={controls.valueOf(PATIENT_NAME_FIELD, "")}
                className={FIELD_CLASSES}
                {...controls.fieldStatus(PATIENT_NAME_FIELD)}
              />
            </div>
            <div>
              <label htmlFor="add-booking-phone" className="block text-[0.8125rem] font-medium text-ink-soft">
                Phone <RequiredMark />
              </label>
              <PhoneField
                id="add-booking-phone"
                countries={phoneCountries}
                country={controls.valueOf(PHONE_COUNTRY_FIELD, defaultPhoneCountry)}
                defaultCountry={defaultPhoneCountry}
                number={controls.valueOf(PATIENT_PHONE_FIELD, "")}
                size="compact"
                required
                numberStatus={controls.fieldStatus(PATIENT_PHONE_FIELD)}
                countryStatus={controls.fieldStatus(PHONE_COUNTRY_FIELD)}
                className="mt-1.5"
              />
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name={PATIENT_ID_FIELD} value={patient.id} />
            <dl className="space-y-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-ink-soft">Name</dt>
                <dd className="text-ink">{patient.name}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-ink-soft">Phone</dt>
                <dd className="tabular-nums text-ink">{patient.phoneText}</dd>
              </div>
            </dl>
          </>
        )}

        {services.length === 0 ? null : (
          <div>
            <label htmlFor="add-booking-service" className="block text-[0.8125rem] font-medium text-ink-soft">
              Service
            </label>
            {/* Keyed on the starting choice: React resets the form once the action settles, and a dropdown only
                honours its defaultValue on mount, so a refused save redraws it on what was picked. */}
            <SelectField
              key={startService}
              id="add-booking-service"
              name={BOOKING_SERVICE_FIELD}
              options={serviceOptions}
              defaultValue={startService}
              className={SELECT_TRIGGER_CLASSES}
              wrapperClassName="mt-1.5"
              {...controls.fieldStatus(BOOKING_SERVICE_FIELD)}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <SubmitButton disabled={controls.isPending} pendingLabel="Booking…">
            Book
          </SubmitButton>
          <PanelFormStatus controls={controls} statusRef={statusRef} />
        </div>
      </form>
    </section>
  );
}
