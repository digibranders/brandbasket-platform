"use client";

import { useActionState, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { NO_PICTURE, StaffAdPictureField, useHiddenPictureInput, type StaffAdPictureState } from "@/components/staff-ad-picture-field";
import type { CropSize } from "@/lib/staff-ad-crop";
import type { StaffAdErrorField, StaffAdFormState, StaffAdKind, StaffAdValues } from "@/lib/staff-ad-form";

export interface PlaceAdOption {
  readonly value: string;
  readonly label: string;
}

interface PlaceAdFormProps {
  /** Redirects to the list of placed ads on success, so it only ever returns an error state. */
  readonly action: (state: StaffAdFormState, formData: FormData) => Promise<StaffAdFormState>;
  /** Every category, A to Z. */
  readonly categories: readonly PlaceAdOption[];
  /** Every area as "city/area", grouped by its city. */
  readonly areasByCity: readonly { readonly city: string; readonly areas: readonly PlaceAdOption[] }[];
  /** Every city, A to Z: where a home page ad shows, since it has no category or area. */
  readonly cities: readonly PlaceAdOption[];
  readonly spots: readonly PlaceAdOption[];
  /** The weeks an ad may start in, this week first. */
  readonly weeks: readonly PlaceAdOption[];
  readonly maxWeeks: number;
  /** The pixels a picture is stored at: the first side spot and home tile are tall, every other spot is wide. */
  readonly pictureSizes: { readonly tall: CropSize; readonly wide: CropSize };
}

const ERROR_ID = "place-ad-error";
/** What a category or area is when the ad is for all of them: the same word the home market uses (AD_ALL_SLUG in @firstfold/db). */
const ALL_VALUE = "all";
/** Whole weeks, because the customers' auctions run Monday to Sunday: a month is four of them. */
const DURATION_CHOICES = [
  { label: "1 month", weeks: 4 },
  { label: "2 months", weeks: 8 },
  { label: "3 months", weeks: 12 },
] as const;
/** The agreed price is in whole rupees, and the server caps it at ₹1,00,000. */
const PRICE_PATTERN = "[0-9]{1,6}";
const INITIAL_STATE: StaffAdFormState = { status: "idle" };

function Field({
  id,
  label,
  optional = false,
  required = false,
  hint,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly required?: boolean;
  readonly hint?: { readonly id: string; readonly text: ReactNode };
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
        {required ? <RequiredMark /> : null}
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
 * Placing an ad by hand: which business, where it shows (any category and area), which spot, and for which weeks.
 * Parsed on the server (lib/staff-ad-form.ts); a refusal points at its field and keeps what was typed.
 */
export function PlaceAdForm({ action, categories, areasByCity, cities, spots, weeks, maxWeeks, pictureSizes }: PlaceAdFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [spotValue, setSpotValue] = useState<string | null>(null);
  const [kindValue, setKindValue] = useState<StaffAdKind | null>(null);
  const [weeksValue, setWeeksValue] = useState<string | null>(null);
  // The picture is held here, not in the form, which remounts after a refusal: choosing it again would be a nuisance.
  const [picture, setPicture] = useState<StaffAdPictureState>(NO_PICTURE);
  const [cutPicture, setCutPicture] = useState<File | null>(null);
  const [pictureBlocked, setPictureBlocked] = useState(false);

  useEffect(() => {
    if (state.status !== "error") return;
    const target = state.field === null ? null : (formRef.current?.elements.namedItem(state.field) ?? null);
    if (target instanceof HTMLElement) target.focus();
    else errorRef.current?.focus();
  }, [state]);

  const errorMessage = state.status === "error" && !isPending ? state.message : null;
  const errorField: StaffAdErrorField | null = state.status === "error" ? state.field : null;
  const values: Partial<StaffAdValues> = state.status === "error" ? state.values : {};
  // What the spot dropdown shows: the choice made since the page opened, else what a refused form had.
  const chosenSpot = spotValue ?? values.spot ?? spots[0]?.value ?? "";
  const isHome = chosenSpot.startsWith("home:");
  const tallSpot = chosenSpot === "side:1" || chosenSpot === "home:1";
  const pictureSize = tallSpot ? pictureSizes.tall : pictureSizes.wide;
  const spotLabel = spots.find((spot) => spot.value === chosenSpot)?.label ?? "the chosen spot";
  const hiddenPicture = useHiddenPictureInput(cutPicture);
  const kind: StaffAdKind = kindValue ?? (values.kind === "link" ? "link" : "business");
  const isLink = kind === "link";
  const weeksText = weeksValue ?? values.weeks ?? "1";

  // A business ad may leave these blank (its own city, category and area are read from its page); a link ad has no business to read them from.
  const homeCityOptions: readonly SelectOption[] = [{ value: "", label: isLink ? "Choose a city" : "The business’s own city" }, ...cities];
  const categoryOptions: readonly SelectOption[] = [
    { value: "", label: isLink ? "Choose a category" : "The business’s own category" },
    { value: ALL_VALUE, label: "All categories" },
    ...categories,
  ];
  const areaOptions: readonly SelectOption[] = [
    { value: "", label: isLink ? "Choose an area" : "The business’s own area" },
    // Each city leads its group with "all areas", which is `<city>/all`.
    ...areasByCity.flatMap((group) => {
      const citySlug = group.areas[0]?.value.split("/")[0];
      const all: readonly SelectOption[] = citySlug === undefined ? [] : [{ value: `${citySlug}/${ALL_VALUE}`, label: `All areas of ${group.city}`, group: group.city }];
      return [...all, ...group.areas.map((area) => ({ value: area.value, label: area.label, group: group.city }))];
    }),
  ];
  const weeksPattern = `0?(?:${Array.from({ length: maxWeeks }, (_, index) => String(index + 1)).join("|")})`;

  function fieldStatus(field: StaffAdErrorField, hintId?: string): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    if (errorMessage === null || errorField !== field) return hintId === undefined ? {} : { "aria-describedby": hintId };
    return { "aria-invalid": true, "aria-describedby": hintId === undefined ? ERROR_ID : `${ERROR_ID} ${hintId}` };
  }

  return (
    // Remounted after a refusal so the dropdowns show what was chosen: a dropdown reads its defaultValue only on mount.
    <form
      key={state.status === "error" ? JSON.stringify(state.values) : "idle"}
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        // A picture was chosen but could not be cut (not a picture, or too small): placing the ad without it would be a surprise.
        if (picture.source === null || cutPicture !== null) return;
        event.preventDefault();
        setPictureBlocked(true);
        document.getElementById("place-picture")?.focus();
      }}
      noValidate
      className="mt-6 max-w-3xl space-y-6"
    >
      <fieldset>
        <legend className={labelClasses}>The ad leads to</legend>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          {(
            [
              ["business", "A business page on the website"],
              ["link", "A link I choose"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2.5 text-[0.9375rem]">
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKindValue(value)}
                className="size-4 accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {isLink ? (
        <Field
          id="place-link"
          label="Link the ad opens"
          required
          hint={{ id: "place-link-hint", text: "Where a visitor goes when they click the ad. It opens in a new tab. Any web address works." }}
        >
          <input
            id="place-link"
            name="link"
            type="text"
            inputMode="url"
            required
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            maxLength={500}
            defaultValue={values.link ?? ""}
            placeholder="https://example.com/summer-offer"
            className={fieldClasses}
            {...fieldStatus("link", "place-link-hint")}
          />
        </Field>
      ) : (
        <Field
          id="place-listing"
          label="Business page on the website"
          required
          hint={{ id: "place-listing-hint", text: "Paste the address from the browser. The ad leads to this page." }}
        >
          <input
            id="place-listing"
            name="listing"
            type="text"
            inputMode="url"
            required
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            maxLength={2000}
            defaultValue={values.listing ?? ""}
            placeholder="firstfold.io/in/mh/business/smile-dental/9f94ykmdjp"
            className={fieldClasses}
            {...fieldStatus("listing", "place-listing-hint")}
          />
        </Field>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="place-name" label={isLink ? "Headline" : "Business name"} required>
          <input
            id="place-name"
            name="businessName"
            required
            maxLength={200}
            defaultValue={values.businessName ?? ""}
            className={fieldClasses}
            {...fieldStatus("businessName")}
          />
        </Field>
        <Field id="place-tagline" label="Ad line" optional>
          <input
            id="place-tagline"
            name="tagline"
            maxLength={80}
            defaultValue={values.tagline ?? ""}
            placeholder="Painless treatment, open on Sundays"
            className={fieldClasses}
            {...fieldStatus("tagline")}
          />
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field id="place-spot" label="Where" required>
          <SelectField
            id="place-spot"
            name="spot"
            required
            options={spots}
            value={chosenSpot}
            onChange={setSpotValue}
            className={fieldClasses}
            {...fieldStatus("spot")}
          />
        </Field>
        {isHome ? (
          // A home page ad has no category or area: it shows on its city's home page, whatever the category.
          <Field id="place-area" label="Home page of city">
            <SelectField
              id="place-area"
              name="area"
              options={homeCityOptions}
              defaultValue={values.area?.split("/")[0] ?? ""}
              className={fieldClasses}
              {...fieldStatus("area")}
            />
          </Field>
        ) : (
          <>
            <Field id="place-category" label="Show under category">
              <SelectField
                id="place-category"
                name="category"
                options={categoryOptions}
                defaultValue={values.category ?? ""}
                className={fieldClasses}
                {...fieldStatus("category")}
              />
            </Field>
            <Field id="place-area" label="Show in area">
              <SelectField
                id="place-area"
                name="area"
                options={areaOptions}
                defaultValue={values.area ?? ""}
                className={fieldClasses}
                {...fieldStatus("area")}
              />
            </Field>
          </>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="place-from" label="Starts" required>
          <SelectField
            id="place-from"
            name="fromWeek"
            required
            options={weeks}
            defaultValue={values.fromWeek ?? weeks[0]?.value ?? ""}
            className={`${fieldClasses} tabular-nums`}
            {...fieldStatus("fromWeek")}
          />
        </Field>
        <Field
          id="place-weeks"
          label="How long"
          required
          hint={{ id: "place-weeks-hint", text: "In whole weeks, Monday to Sunday, from the week it starts. Customers see the last day as the date the spot opens again." }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                aria-pressed={weeksText === String(choice.weeks)}
                onClick={() => setWeeksValue(String(choice.weeks))}
                className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium ring-1 ring-inset transition-colors ${
                  weeksText === String(choice.weeks) ? "bg-ink text-paper ring-ink" : "text-ink-soft ring-ink-soft/65 hover:bg-paper-deep hover:text-ink"
                }`}
              >
                {choice.label}
              </button>
            ))}
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              or
              <RuleInput
                rule="digits"
                id="place-weeks"
                name="weeks"
                required
                pattern={weeksPattern}
                title={`A whole number of weeks, from 1 to ${String(maxWeeks)}`}
                maxLength={String(maxWeeks).length + 1}
                autoComplete="off"
                value={weeksText}
                onChange={(event) => setWeeksValue(event.target.value)}
                aria-label="Weeks"
                className={`${fieldClasses} w-20 tabular-nums`}
                {...fieldStatus("weeks", "place-weeks-hint")}
              />
              weeks
            </span>
          </div>
        </Field>
      </div>

      <StaffAdPictureField
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
        describedBy={errorMessage !== null && errorField === "picture" ? ERROR_ID : "place-picture-hint"}
      />
      <input ref={hiddenPicture} type="file" name="picture" tabIndex={-1} aria-hidden="true" className="hidden" />

      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field id="place-price" label="Agreed price a week (₹)" optional>
          <RuleInput
            rule="digits"
            id="place-price"
            name="price"
            pattern={PRICE_PATTERN}
            title="Whole rupees, like 1500"
            maxLength={6}
            autoComplete="off"
            defaultValue={values.price ?? ""}
            placeholder="1500"
            className={`${fieldClasses} tabular-nums`}
            {...fieldStatus("price")}
          />
        </Field>
        <Field
          id="place-note"
          label="Note"
          optional
          hint={{ id: "place-note-hint", text: "For the team only, e.g. how it was paid. No bill is raised here." }}
        >
          <input
            id="place-note"
            name="note"
            maxLength={200}
            defaultValue={values.note ?? ""}
            className={fieldClasses}
            {...fieldStatus("note", "place-note-hint")}
          />
        </Field>
      </div>

      {errorMessage === null ? null : (
        <p
          ref={errorRef}
          id={ERROR_ID}
          role="alert"
          tabIndex={-1}
          className="border-l-2 border-accent py-1 pl-4 text-sm text-accent outline-none"
        >
          {errorMessage}
        </p>
      )}

      <GatedSubmitButton className={buttonPrimary} pendingLabel="Placing…">
        Place ad
      </GatedSubmitButton>
    </form>
  );
}
