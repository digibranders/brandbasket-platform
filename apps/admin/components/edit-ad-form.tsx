"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { NO_PICTURE, StaffAdPictureField, useHiddenPictureInput, type StaffAdPictureState } from "@/components/staff-ad-picture-field";
import type { CropSize } from "@/lib/staff-ad-crop";
import type { StaffAdEditErrorField, StaffAdEditFormState, StaffAdEditValues } from "@/lib/staff-ad-form";

interface EditAdFormProps {
  /** Redirects to the list of placed ads on success, so it only ever returns an error state. */
  readonly action: (state: StaffAdEditFormState, formData: FormData) => Promise<StaffAdEditFormState>;
  /** Every week of the booking still up: what the edit changes. */
  readonly ids: readonly string[];
  /** Whether the booking is a link ad: it has a link to change, and its first line is a headline, not a name. */
  readonly isLink: boolean;
  /** What the booking says now. */
  readonly values: StaffAdEditValues;
  /** The picture it shows now, or null for none. */
  readonly pictureId: string | null;
  /** Where it shows, for the heading: "All categories in Naupada, Thane · Side spot 1". */
  readonly where: string;
  /** The shape a new picture is cut to, in the pixels it is stored at. */
  readonly pictureSize: CropSize;
  readonly spotLabel: string;
  /** Back to the list without saving. */
  readonly cancelHref: string;
}

const ERROR_ID = "edit-ad-error";
const PICTURE_ID = "edit-picture";

function Field({
  id,
  label,
  optional = false,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly hint?: { readonly id: string; readonly text: ReactNode };
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
        {optional ? <span className="text-ink-soft"> (optional)</span> : null}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={hint.id} className={hintClasses}>
          {hint.text}
        </p>
      )}
    </div>
  );
}

/**
 * Changing an ad staff placed: what it says, where a link ad leads, its picture, and the team's own price and note, in
 * every week of the booking at once. Where and when it shows is not here, because that is a different booking: take
 * this one down and place another. Parsed on the server (lib/staff-ad-form.ts parseStaffAdEdit); a refusal points at
 * its field and keeps what was typed.
 */
export function EditAdForm({ action, ids, isLink, values: current, pictureId, where, pictureSize, spotLabel, cancelHref }: EditAdFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, { status: "idle" } as StaffAdEditFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [picture, setPicture] = useState<StaffAdPictureState>(NO_PICTURE);
  const [cutPicture, setCutPicture] = useState<File | null>(null);
  const [pictureBlocked, setPictureBlocked] = useState(false);
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const hiddenPicture = useHiddenPictureInput(cutPicture);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null || state.field === "picture" ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else if (state.field === "picture") document.getElementById(PICTURE_ID)?.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField: StaffAdEditErrorField | null = state.status === "error" ? state.field : null;
  // What is shown in the fields: what a refused form had, else what the booking says now.
  const values: StaffAdEditValues = state.status === "error" ? state.values : current;
  const pictureChange = cutPicture !== null ? "replace" : removeCurrent ? "remove" : "keep";
  const showsCurrent = pictureId !== null && !removeCurrent && picture.source === null;

  function fieldStatus(field: StaffAdEditErrorField, hintId?: string): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    if (errorMessage === null || errorField !== field) return hintId === undefined ? {} : { "aria-describedby": hintId };
    return { "aria-invalid": true, "aria-describedby": hintId === undefined ? ERROR_ID : `${ERROR_ID} ${hintId}` };
  }

  return (
    // Remounted after a refusal so the fields show what was typed: they read their defaultValue only on mount.
    <form
      key={state.status === "error" ? JSON.stringify(state.values) : "idle"}
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        // A picture was chosen but could not be cut (not a picture, or too small): saving without it would be a surprise.
        if (picture.source === null || cutPicture !== null) return;
        event.preventDefault();
        setPictureBlocked(true);
        document.getElementById(PICTURE_ID)?.focus();
      }}
      noValidate
      className="mt-4 max-w-3xl space-y-6"
    >
      {ids.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <input type="hidden" name="pictureChange" value={pictureChange} />
      <p className="text-sm text-ink-soft">{where}. Changes apply to every week of this booking still to run. To change where or when it shows, take it down and place a new one.</p>

      {isLink ? (
        <Field id="edit-link" label="Link the ad opens" hint={{ id: "edit-link-hint", text: "It opens in a new tab. Any web address works." }}>
          <input
            id="edit-link"
            name="link"
            type="text"
            inputMode="url"
            required
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            maxLength={500}
            defaultValue={values.link}
            className={fieldClasses}
            {...fieldStatus("link", "edit-link-hint")}
          />
        </Field>
      ) : (
        <input type="hidden" name="link" value="" />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="edit-name" label={isLink ? "Headline" : "Business name"}>
          <input id="edit-name" name="businessName" required maxLength={200} defaultValue={values.businessName} className={fieldClasses} {...fieldStatus("businessName")} />
        </Field>
        <Field id="edit-tagline" label="Ad line" optional>
          <input
            id="edit-tagline"
            name="tagline"
            maxLength={80}
            defaultValue={values.tagline}
            placeholder="Painless treatment, open on Sundays"
            className={fieldClasses}
            {...fieldStatus("tagline")}
          />
        </Field>
      </div>

      <div>
        <p className={labelClasses}>
          Picture <span className="text-ink-soft">(optional)</span>
        </p>
        {showsCurrent ? (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a staff-only preview of a file served by this app */}
            <img src={`/staff-ad-pictures/${pictureId}`} alt="The picture the ad shows now" className="h-28 w-auto rounded-control bg-paper-deep" />
            <button
              type="button"
              onClick={() => setRemoveCurrent(true)}
              className="mt-1 text-sm text-ink-soft underline-offset-[3px] hover:text-accent hover:underline"
            >
              Remove this picture
            </button>
          </div>
        ) : null}
        {removeCurrent && picture.source === null ? (
          <p className={hintClasses}>
            The picture comes off when you save.{" "}
            <button type="button" onClick={() => setRemoveCurrent(false)} className="underline underline-offset-[3px] hover:text-accent">
              Keep it
            </button>
          </p>
        ) : null}
        <div className="mt-3">
          <StaffAdPictureField
            id={PICTURE_ID}
            state={picture}
            onChange={(next) => {
              setPicture(next);
              setPictureBlocked(false);
            }}
            onCut={setCutPicture}
            blocked={pictureBlocked}
            size={pictureSize}
            spotLabel={spotLabel}
            invalid={errorMessage !== null && errorField === "picture"}
            describedBy={errorMessage !== null && errorField === "picture" ? ERROR_ID : undefined}
            hint={pictureId === null ? `Shown in ${spotLabel}. JPEG, PNG or WebP.` : `Choose another to replace it. Shown in ${spotLabel}. JPEG, PNG or WebP.`}
          />
        </div>
        <input ref={hiddenPicture} type="file" name="picture" tabIndex={-1} aria-hidden="true" className="hidden" />
      </div>

      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field id="edit-price" label="Agreed price a week (₹)" optional>
          <input
            id="edit-price"
            name="price"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            defaultValue={values.price}
            placeholder="1500"
            className={`${fieldClasses} tabular-nums`}
            {...fieldStatus("price")}
          />
        </Field>
        <Field id="edit-note" label="Note" optional hint={{ id: "edit-note-hint", text: "For the team only, e.g. how it was paid. No bill is raised here." }}>
          <input id="edit-note" name="note" maxLength={200} defaultValue={values.note} className={fieldClasses} {...fieldStatus("note", "edit-note-hint")} />
        </Field>
      </div>

      {errorMessage === null ? null : (
        <p ref={errorRef} id={ERROR_ID} role="alert" tabIndex={-1} className="border-l-2 border-accent py-1 pl-4 text-sm text-accent outline-none">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isPending} className={buttonPrimary}>
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <Link href={cancelHref} className={buttonSecondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
