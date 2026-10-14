"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { ListingAddressLine } from "@/components/panel/business/listing-address-line";
import { OptionList, PILL_CLASSES, Step } from "@/components/panel/business/pick-steps";
import {
  DIRECTORY_DISTRICTS,
  initialBusinessListingFormState,
  listedAtAddress,
  type BusinessListingFormState,
  type ListedAtPart,
  type ListingFormOptions,
} from "@/lib/business-listing-form";
import type { PickOption } from "@/lib/listing-address";

/** Where the business is listed now, when the tab is reopened. */
export interface SavedListing {
  readonly districtSlug: string;
  readonly areaSlug: string;
  readonly categorySlug: string;
}

interface ListingFormProps {
  readonly action: (state: BusinessListingFormState, formData: FormData) => Promise<BusinessListingFormState>;
  readonly saved: SavedListing | null;
  /** The areas and categories on offer, read by the server page: the browser's own copy of the places is never updated. */
  readonly options: ListingFormOptions;
  /** Where an owner whose area or category is not on the lists writes to. */
  readonly supportEmail: string;
}

type PickStep = "district" | "area" | "category";

const DISTRICTS: readonly PickOption[] = DIRECTORY_DISTRICTS.map((district) => ({ value: district.slug, label: district.name }));
const ERROR_ID = "listing-error";

function optionFor(options: readonly PickOption[], value: string | undefined): PickOption | null {
  return options.find((option) => option.value === value) ?? null;
}

/** The areas of a district, none for a district the lists do not have. */
function areasOf(options: ListingFormOptions, districtSlug: string | null | undefined): readonly PickOption[] {
  return districtSlug === null || districtSlug === undefined ? [] : (options.areasByDistrict[districtSlug] ?? []);
}

/** The first question a saved listing leaves unanswered (a slug the lists no longer have), or none. */
function firstUnanswered(saved: SavedListing | null, options: ListingFormOptions): PickStep | null {
  if (optionFor(DISTRICTS, saved?.districtSlug) === null) return "district";
  if (optionFor(areasOf(options, saved?.districtSlug), saved?.areaSlug) === null) return "area";
  if (optionFor(options.categories, saved?.categorySlug) === null) return "category";
  return null;
}

/**
 * The Listing tab's questions, in the order of the address they build: district, area, category. The address of the
 * page the business is listed on fills in above as they are answered. Saving the first time gives the business its
 * Business ID; until it is published, the same form moves it.
 */
export function ListingForm({ action, saved, options, supportEmail }: ListingFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialBusinessListingFormState);
  const [district, setDistrict] = useState<PickOption | null>(() => optionFor(DISTRICTS, saved?.districtSlug) ?? (DISTRICTS.length === 1 ? (DISTRICTS[0] ?? null) : null));
  const [area, setArea] = useState<PickOption | null>(() => optionFor(areasOf(options, saved?.districtSlug), saved?.areaSlug));
  const [category, setCategory] = useState<PickOption | null>(() => optionFor(options.categories, saved?.categorySlug));
  // One district today, so a new business starts at the area; a saved one opens with every step closed.
  const [open, setOpen] = useState<PickStep | null>(() => (saved === null ? (DISTRICTS.length === 1 ? "area" : "district") : firstUnanswered(saved, options)));
  const [started, setStarted] = useState(false);
  const submitRef = useRef<HTMLDivElement>(null);

  const areas = useMemo(() => areasOf(options, district?.value), [options, district]);
  const segments = listedAtAddress({ districtSlug: district?.value ?? null, areaSlug: area?.value ?? null, categorySlug: category?.value ?? null });
  const picked = district !== null && area !== null && category !== null;
  const active: ListedAtPart | null = open;
  const changed = saved === null || saved.districtSlug !== district?.value || saved.areaSlug !== area?.value || saved.categorySlug !== category?.value;
  const errorMessage = state.status === "error" && !isPending ? state.message : null;

  // Once the last answer is in, the cursor goes on to Save, rather than back to the top of the document.
  useEffect(() => {
    if (started && open === null && picked) submitRef.current?.querySelector("button")?.focus();
  }, [open, picked, started]);

  function show(step: PickStep | null): void {
    setStarted(true);
    setOpen(step);
  }

  return (
    <form action={formAction} noValidate className="max-w-3xl">
      <input type="hidden" name="district" value={district?.value ?? ""} />
      <input type="hidden" name="area" value={area?.value ?? ""} />
      <input type="hidden" name="category" value={category?.value ?? ""} />

      <div className="mt-8">
        <p className="text-[0.8125rem] text-ink-soft">Where you&rsquo;ll be listed</p>
        <div className="mt-1.5">
          <ListingAddressLine segments={segments} active={active} />
        </div>
      </div>

      <div className="mt-8 border-b border-line">
        <Step number={1} question="Your district" answer={district?.label ?? null} open={open === "district"} locked={false} onChange={() => show("district")}>
          <ul aria-label="Choose your district" className="flex flex-wrap gap-2">
            {DISTRICTS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  aria-pressed={option.value === district?.value}
                  onClick={() => {
                    if (option.value !== district?.value) setArea(null);
                    setDistrict(option);
                    show(area === null || option.value !== district?.value ? "area" : category === null ? "category" : null);
                  }}
                  className={PILL_CLASSES}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">More districts are coming soon.</p>
        </Step>

        <Step number={2} question="Your area" answer={area?.label ?? null} open={open === "area"} locked={district === null} onChange={() => show("area")}>
          <OptionList
            key={district?.value ?? "none"}
            noun="area"
            plural="areas"
            focusSearch={started}
            options={areas}
            selected={area?.value ?? null}
            onPick={(option) => {
              setArea(option);
              show(category === null ? "category" : null);
            }}
          />
          <p className="mt-4 text-sm text-ink-soft">
            Area not on the list?{" "}
            <a href={`mailto:${supportEmail}`} className="link-underline text-ink">
              Email us
            </a>
          </p>
        </Step>

        <Step
          number={3}
          question="Your business category"
          answer={category?.label ?? null}
          open={open === "category"}
          locked={area === null}
          onChange={() => show("category")}
        >
          <OptionList
            noun="category"
            plural="categories"
            focusSearch
            options={options.categories}
            selected={category?.value ?? null}
            onPick={(option) => {
              setCategory(option);
              show(null);
            }}
          />
          <p className="mt-4 text-sm text-ink-soft">
            Not on the list?{" "}
            <a href={`mailto:${supportEmail}`} className="link-underline text-ink">
              Email us
            </a>
          </p>
        </Step>
      </div>

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="mt-6 max-w-2xl rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      {picked && changed ? (
        <div ref={submitRef} className="mt-8">
          <SubmitButton disabled={isPending} aria-describedby={errorMessage === null ? undefined : ERROR_ID}>
            {isPending ? "Saving…" : saved === null ? "Save and get my Business ID" : "Save changes"}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
