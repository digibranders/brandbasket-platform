"use client";

import { useActionState, useEffect, useId, useRef, type ReactElement } from "react";
import { changeWebAddressAction } from "@/app/(protected)/clients/[businessId]/actions";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { INITIAL_WEB_ADDRESS_STATE, type WebAddressField } from "@/lib/web-address-form";

/** One directory business's URL label, as the page that shows it read it. */
export interface WebAddressPlace {
  readonly id: string;
  readonly citySlug: string;
  readonly urlSlug: string;
  /** Its page is live, so only staff may change its URL, here. Before that its owner may. */
  readonly locked: boolean;
}

interface WebAddressProps {
  /** The business the page is about, so the page refreshes once the address changes. */
  readonly businessId: string;
  readonly place: WebAddressPlace;
  /** The full current address, https://fynix.digital/in/mh/business/<name>/<code>. */
  readonly url: string;
  /** Link the address: only once its page is public, so staff never open a page that isn't there. */
  readonly linked?: boolean;
  /** What the page shows after the address, e.g. "website launched"; by default "not live yet" for an unlocked place. */
  readonly note?: string;
  /** Every city the directory covers, built on the server so the list's data stays off the browser bundle. */
  readonly cities: readonly { readonly slug: string; readonly name: string }[];
  /** The URL rules' limits (PLACE_URL_SLUG_MAX, PLACE_URL_CHANGE_REASON_MAX), passed from the server for the same reason. */
  readonly nameMaxLength: number;
  readonly reasonMaxLength: number;
}

/** Words joined by single hyphens. The server lowercases the name part before it checks, so capitals are accepted. */
const NAME_PART_PATTERN = "[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*";
/** The server needs a reason of at least this many characters (PLACE_URL_CHANGE_REASON_MIN). */
const REASON_MIN_LENGTH = 3;

/**
 * A directory business's web address, and, once its page is live, the staff form that changes it: the name part, the
 * city, and why (kept in the audit trail). Its id stays, so the old address redirects to the new one.
 */
export function WebAddress({
  businessId,
  place,
  url,
  linked = false,
  note,
  cities,
  nameMaxLength,
  reasonMaxLength,
}: WebAddressProps): ReactElement {
  const [state, formAction, isPending] = useActionState(changeWebAddressAction, INITIAL_WEB_ADDRESS_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const prefix = useId();
  const errorId = `${prefix}-error`;

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  // Open data covers cities the directory's lists do not have yet: the business's own is always offered, so it can stay.
  const cityOptions: readonly SelectOption[] = (
    cities.some((city) => city.slug === place.citySlug) ? cities : [{ slug: place.citySlug, name: place.citySlug }, ...cities]
  ).map((city) => ({ value: city.slug, label: city.name }));
  const shownNote = note ?? (place.locked ? null : "not live yet");
  const error = state.status === "error" && !isPending ? state : null;
  const values = state.status === "error" ? state.values : { urlSlug: place.urlSlug, citySlug: place.citySlug, reason: "" };

  function fieldStatus(field: WebAddressField, hintId?: string): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    if (error === null || error.field !== field) return hintId === undefined ? {} : { "aria-describedby": hintId };
    return { "aria-invalid": true, "aria-describedby": hintId === undefined ? errorId : `${errorId} ${hintId}` };
  }

  return (
    <div className="space-y-3">
      <div>
        <p className={labelClasses}>Web address</p>
        <p className="mt-1 break-all text-xs">
          {linked ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="link-underline font-mono text-ink">
              {url}
            </a>
          ) : (
            <span className="font-mono text-ink">{url}</span>
          )}
          {shownNote === null ? null : <span className="text-ink-soft">{` \u00b7 ${shownNote}`}</span>}
        </p>
      </div>

      {state.status === "changed" && !isPending ? <Notice tone="ok">Changed. Old links redirect here.</Notice> : null}

      {place.locked ? (
        <details>
          <summary className="link-underline cursor-pointer text-sm font-semibold text-accent">Change web address</summary>
          {/* Keyed by the address, so after a change the boxes start from the new one. */}
          <form key={`${place.citySlug}/${place.urlSlug}`} ref={formRef} action={formAction} noValidate className="mt-4 grid max-w-xl gap-5 sm:grid-cols-2">
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="placeId" value={place.id} />

            <div>
              <label htmlFor={`${prefix}-name`} className={labelClasses}>
                Name part
                <RequiredMark />
              </label>
              <input
                id={`${prefix}-name`}
                name="urlSlug"
                required
                pattern={NAME_PART_PATTERN}
                title="Letters, digits and single hyphens"
                maxLength={nameMaxLength}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                defaultValue={values.urlSlug}
                className={fieldClasses}
                {...fieldStatus("urlSlug")}
              />
            </div>

            <div>
              <label htmlFor={`${prefix}-city`} className={labelClasses}>
                City
                <RequiredMark />
              </label>
              <SelectField
                id={`${prefix}-city`}
                name="citySlug"
                required
                options={cityOptions}
                defaultValue={values.citySlug}
                className={fieldClasses}
                {...fieldStatus("citySlug")}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor={`${prefix}-reason`} className={labelClasses}>
                Reason
                <RequiredMark />
              </label>
              <input
                id={`${prefix}-reason`}
                name="reason"
                required
                minLength={REASON_MIN_LENGTH}
                maxLength={reasonMaxLength}
                autoComplete="off"
                placeholder="Rebranded"
                defaultValue={values.reason}
                className={fieldClasses}
                {...fieldStatus("reason", `${prefix}-reason-hint`)}
              />
              <p id={`${prefix}-reason-hint`} className={hintClasses}>
                Old links keep working. They redirect here.
              </p>
            </div>

            {error === null ? null : (
              <p
                ref={errorRef}
                id={errorId}
                role="alert"
                tabIndex={-1}
                className="border-l-2 border-accent py-1 pl-4 text-sm text-accent outline-none sm:col-span-2"
              >
                {error.message}
              </p>
            )}

            <div className="sm:col-span-2">
              <GatedSubmitButton className={buttonPrimary} pendingLabel="Changing…">
                Change address
              </GatedSubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
