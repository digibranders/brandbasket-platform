"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactElement } from "react";
import { MERGE_KEEP_ID_FIELD, MERGE_REMOVE_ID_FIELD, PATIENT_PHONE_FIELD } from "@fynix/shared/lib/patients/fields";
import { PHONE_COUNTRY_FIELD, type PhoneCountryOption } from "@fynix/shared/lib/phone/fields";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { Button } from "@fynix/shared/ui/panel/button";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { PhoneField } from "@fynix/shared/ui/phone-field";
import { PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface MergeLookupFormProps {
  /** The patient whose profile this is: the record that stays. */
  readonly keepId: string;
  readonly phoneCountries: readonly PhoneCountryOption[];
  readonly defaultPhoneCountry: string;
  /** Finds the other record by its phone and, when it exists, moves the page on to the confirm step. */
  readonly action: PanelFormAction;
}

/** Merge, step one: the other record's phone, typed like any phone. Nothing changes until the confirm step. */
export function MergeLookupForm({ keepId, phoneCountries, defaultPhoneCountry, action }: MergeLookupFormProps): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  return (
    <form ref={formRef} action={formAction} className="max-w-lg space-y-3">
      <input type="hidden" name={MERGE_KEEP_ID_FIELD} value={keepId} />
      <div>
        <label htmlFor="merge-phone" className="block text-[0.8125rem] font-medium text-ink-soft">
          Other record&apos;s phone <RequiredMark />
        </label>
        <PhoneField
          id="merge-phone"
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
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" size="sm" disabled={controls.isPending} pendingLabel="Finding…">
          Find
        </SubmitButton>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </div>
    </form>
  );
}

interface MergeConfirmProps {
  readonly keepId: string;
  readonly keepName: string;
  readonly removeId: string;
  readonly removeName: string;
  /** The other record's main number, laid out for reading (displayPhoneText, server-side). */
  readonly removePhoneText: string;
  readonly removeBookingCount: number;
  /** Where "Keep both" goes: this profile without the confirm step. */
  readonly cancelHref: string;
  readonly action: PanelFormAction;
}

/**
 * Merge, step two: names the record found and what will happen to it, then merges on "Yes, merge". It opens by
 * moving focus to its own heading (the lookup's navigation just put it on the page, the way BookingDetailsPanel
 * takes focus when it opens), so a keyboard or screen reader user lands on the question rather than the page top.
 */
export function MergeConfirm({
  keepId,
  keepName,
  removeId,
  removeName,
  removePhoneText,
  removeBookingCount,
  cancelHref,
  action,
}: MergeConfirmProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);

  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const bookings = `${String(removeBookingCount)} ${removeBookingCount === 1 ? "booking moves" : "bookings move"}`;

  return (
    <div className="space-y-3">
      <h3 ref={headingRef} tabIndex={-1} className="text-sm font-medium text-ink outline-none">
        Merge {removeName} into {keepName}?
      </h3>
      <p className="text-sm text-ink-soft">
        {removePhoneText} · {bookings} here, then that record is removed.
      </p>
      <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name={MERGE_KEEP_ID_FIELD} value={keepId} />
        <input type="hidden" name={MERGE_REMOVE_ID_FIELD} value={removeId} />
        <Button type="submit" size="sm" disabled={controls.isPending} aria-busy={controls.isPending}>
          {controls.isPending ? "Merging…" : "Yes, merge"}
        </Button>
        <Link href={cancelHref} className="link-underline text-sm text-ink-soft">
          Keep both
        </Link>
        <PanelFormStatus controls={controls} statusRef={statusRef} />
      </form>
    </div>
  );
}
