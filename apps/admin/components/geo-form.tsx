"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { initialGeoFormState, type GeoFormState } from "@/lib/geo-form-state";

type GeoAction = (state: GeoFormState, formData: FormData) => Promise<GeoFormState>;

interface GeoFormProps {
  readonly action: GeoAction;
  readonly children: ReactNode;
  readonly submitLabel: string;
  /** "primary" for an add form, "quiet" for a row's Save. */
  readonly tone?: "primary" | "quiet";
  /** Empties the fields once the save works, for an add form. */
  readonly clearOnSave?: boolean;
  readonly className?: string;
}

/**
 * One Geography form: the fields come in as children, the result of the save shows beneath them as a short line (a
 * dot and a sentence, no box).
 */
export function GeoForm({ action, children, submitLabel, tone = "quiet", clearOnSave = false, className }: GeoFormProps): ReactElement {
  const [state, formAction, pending] = useActionState(action, initialGeoFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (clearOnSave && state.status === "saved") formRef.current?.reset();
  }, [clearOnSave, state]);
  return (
    <form ref={formRef} action={formAction} className={cn("flex flex-col gap-3", className)} aria-busy={pending}>
      {children}
      <div className="flex flex-wrap items-center gap-4">
        <GatedSubmitButton className={cn(tone === "primary" ? buttonPrimary : buttonSecondary, "!py-2")} pendingLabel="Saving…">
          {submitLabel}
        </GatedSubmitButton>
        {state.status === "idle" ? null : (
          <p role="status" className={cn("text-sm", state.status === "error" ? "text-accent" : "text-[#3d7a4a]")}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

/** A decimal degree, which may be negative: the server reads it with Number() and checks nothing more. */
const DEGREES_PATTERN = "-?[0-9]{1,3}(?:\\.[0-9]+)?";

interface GeoPointFieldsProps {
  /** Ties the two inputs' ids to their row, so several rows on one page never share one. */
  readonly idPrefix: string;
  readonly latLabel: string;
  readonly lonLabel: string;
  readonly defaultLat: string;
  readonly defaultLon: string;
  readonly placeholder?: string;
  /** The look of each input and of the small caption above it, as the rest of the row's fields have them. */
  readonly inputClassName: string;
  readonly captionClassName: string;
}

/**
 * An area's map point: latitude and longitude, two cells in the row's grid. They come as a pair or not at all (the
 * server refuses one without the other), so each is required once the other has something in it.
 */
export function GeoPointFields({
  idPrefix,
  latLabel,
  lonLabel,
  defaultLat,
  defaultLon,
  placeholder,
  inputClassName,
  captionClassName,
}: GeoPointFieldsProps): ReactElement {
  const [lat, setLat] = useState(defaultLat);
  const [lon, setLon] = useState(defaultLon);
  const latRef = useRef<HTMLInputElement>(null);
  // The inputs stay uncontrolled so a form reset empties them; the form's reset event brings the tracked text back in step.
  useEffect(() => {
    const owner = latRef.current?.form;
    if (owner === null || owner === undefined) return undefined;
    const restore = (): void => {
      setLat(defaultLat);
      setLon(defaultLon);
    };
    owner.addEventListener("reset", restore);
    return () => owner.removeEventListener("reset", restore);
  }, [defaultLat, defaultLon]);
  const latRequired = lon.trim() !== "";
  const lonRequired = lat.trim() !== "";
  return (
    <>
      <div className="block min-w-0">
        <label htmlFor={`${idPrefix}-lat`} className={captionClassName}>
          {latLabel}
          {latRequired ? <RequiredMark /> : null}
        </label>
        <input
          ref={latRef}
          id={`${idPrefix}-lat`}
          name="lat"
          required={latRequired}
          pattern={DEGREES_PATTERN}
          title="Degrees as a decimal, like 19.2183"
          maxLength={20}
          autoComplete="off"
          inputMode="decimal"
          placeholder={placeholder}
          defaultValue={defaultLat}
          onChange={(event) => setLat(event.target.value)}
          className={inputClassName}
        />
      </div>
      <div className="block min-w-0">
        <label htmlFor={`${idPrefix}-lon`} className={captionClassName}>
          {lonLabel}
          {lonRequired ? <RequiredMark /> : null}
        </label>
        <input
          id={`${idPrefix}-lon`}
          name="lon"
          required={lonRequired}
          pattern={DEGREES_PATTERN}
          title="Degrees as a decimal, like 72.9781"
          maxLength={20}
          autoComplete="off"
          inputMode="decimal"
          placeholder={placeholder}
          defaultValue={defaultLon}
          onChange={(event) => setLon(event.target.value)}
          className={inputClassName}
        />
      </div>
    </>
  );
}
