import type { GeoAdminArea, GeoAdminCategory, GeoAdminDistrict } from "@fynix/db";
import { INDIA_STATES } from "@fynix/db/india-states";
import { LockIcon } from "@fynix/shared/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { checkboxClasses, fieldClasses } from "@/components/console/field-styles";
import { StatusDot } from "@/components/console/status-dot";
import { GeoForm, GeoPointFields } from "@/components/geo-form";
import {
  addAreaAction,
  addCategoryAction,
  addDistrictAction,
  saveAreaAction,
  saveCategoryAction,
  saveDistrictAction,
} from "@/app/(protected)/geography/actions";

/*
 * The rows and add forms of the Geography page. Each row is its own small form: edit in place, press Save. An address
 * that has been published is shown, locked; one still a draft is an input until the row is first switched on.
 */

/** A control small enough to sit in a row. */
const input = cn(fieldClasses, "!mt-0 !rounded-xl !px-3 !py-2 !text-sm");
const caption = "mb-1 block text-xs font-medium text-ink-soft";

/** An address is lowercase words joined by single hyphens, at most GEO_SLUG_MAX (60) long. */
const ADDRESS_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
const ADDRESS_TITLE = "Lowercase letters, digits and single hyphens";
const ADDRESS_MAX_LENGTH = 60;
/** A name is at most GEO_NAME_MAX (80) long. */
const NAME_MAX_LENGTH = 80;
/** Six-digit PIN codes (not starting with 0), split by commas, semicolons or spaces. */
const PIN_LIST_PATTERN = "[,;\\s]*(?:[1-9][0-9]{5}[,;\\s]*)*";

/**
 * A caption above a control. A text field sits inside the label; a dropdown has a button that must be named by
 * `htmlFor`, so the label stands beside it instead.
 */
function Labelled({
  label,
  children,
  className,
  required = false,
  htmlFor,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly required?: boolean;
  readonly htmlFor?: string;
}): ReactElement {
  const text = (
    <span className={caption}>
      {label}
      {required ? <RequiredMark /> : null}
    </span>
  );
  if (htmlFor !== undefined) {
    return (
      <div className={cn("block min-w-0", className)}>
        <label htmlFor={htmlFor} className="block">
          {text}
        </label>
        {children}
      </div>
    );
  }
  return (
    <label className={cn("block min-w-0", className)}>
      {text}
      {children}
    </label>
  );
}

/**
 * One list row: a single line that says what it is, and opens in place to the form that edits it. A native details
 * element, so it works without script and keeps a long list to one line per row.
 */
function RowShell({ summary, children }: { readonly summary: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <li className="border-b border-line">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-4 py-2.5 marker:hidden hover:bg-ink/[0.03] [&::-webkit-details-marker]:hidden">
          {summary}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-sm text-ink-soft group-open:text-ink">
            Edit
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 transition-transform duration-300 ease-calm group-open:rotate-180">
              <path d="m3.5 6 4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </summary>
        <div className="pb-5 pt-2">{children}</div>
      </details>
    </li>
  );
}

/** A cell in a row's summary line: the main text, with an optional quiet line beneath it on narrow screens. */
function Cell({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return <span className={cn("min-w-0 truncate text-sm text-ink", className)}>{children}</span>;
}

function onOffTone(status: "on" | "off"): "done" | "quiet" {
  return status === "on" ? "done" : "quiet";
}

/** A published address, read only; a draft's, editable. */
function Address({ prefix, slug, locked }: { readonly prefix: string; readonly slug: string; readonly locked: boolean }): ReactElement {
  if (locked) {
    return (
      <div className="min-w-0">
        <span className={caption}>Address</span>
        <p className="flex items-center gap-2 truncate py-2 text-sm text-ink-soft">
          <LockIcon className="size-3.5 shrink-0" />
          <span className="sr-only">Permanent address: </span>
          <span className="truncate">{prefix}{slug}</span>
        </p>
      </div>
    );
  }
  return (
    <Labelled label="Address (free until switched on)" required>
      <input
        name="slug"
        required
        defaultValue={slug}
        pattern={ADDRESS_PATTERN}
        title={ADDRESS_TITLE}
        maxLength={ADDRESS_MAX_LENGTH}
        className={input}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
    </Labelled>
  );
}

/* ---------- districts ---------- */

const STATE_NAMES = new Map(INDIA_STATES.map((state) => [state.code, state.name]));
const STATE_OPTIONS: readonly SelectOption[] = INDIA_STATES.map((state) => ({ value: state.code, label: state.name }));
const ON_OFF_OPTIONS: readonly SelectOption[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
const DISTRICT_STATUS_OPTIONS: readonly SelectOption[] = [
  { value: "live", label: "Live" },
  { value: "soon", label: "Soon" },
  { value: "off", label: "Off" },
];
const DISTRICT_START_OPTIONS: readonly SelectOption[] = [
  { value: "off", label: "Off" },
  { value: "soon", label: "Soon" },
];

/** A free address field of an add form: optional, because the server makes one from the name. */
function OptionalAddress(): ReactElement {
  return (
    <Labelled label="Address (optional)">
      <input
        name="slug"
        pattern={ADDRESS_PATTERN}
        title={ADDRESS_TITLE}
        maxLength={ADDRESS_MAX_LENGTH}
        className={input}
        placeholder="from the name"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
    </Labelled>
  );
}

export function AddDistrictForm(): ReactElement {
  return (
    <GeoForm action={addDistrictAction} submitLabel="Add district" tone="primary" clearOnSave>
      <div className="grid gap-3 sm:grid-cols-4">
        <Labelled label="Name" required>
          <input name="name" required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} placeholder="Kolhapur" />
        </Labelled>
        <Labelled label="State" required htmlFor="add-district-state">
          <SelectField id="add-district-state" name="state" required options={STATE_OPTIONS} defaultValue="mh" className={input} />
        </Labelled>
        <OptionalAddress />
        <Labelled label="Start as" htmlFor="add-district-status">
          <SelectField id="add-district-status" name="status" options={DISTRICT_START_OPTIONS} defaultValue="off" className={input} />
        </Labelled>
      </div>
    </GeoForm>
  );
}

function districtTone(district: GeoAdminDistrict): "done" | "waiting" | "quiet" {
  if (district.status === "live") return "done";
  return district.status === "soon" ? "waiting" : "quiet";
}

export function DistrictRow({ district }: { readonly district: GeoAdminDistrict }): ReactElement {
  const state = STATE_NAMES.get(district.stateCode) ?? district.stateCode.toUpperCase();
  return (
    <RowShell
      summary={
        <>
          <Cell className="w-44 shrink-0 font-medium sm:w-56">{district.name}</Cell>
          <Cell className="hidden flex-1 text-ink-soft sm:block">
            /in/{district.stateCode}/{district.slug}
          </Cell>
          <StatusDot
            tone={districtTone(district)}
            label={`${district.status === "live" ? "Live" : district.status === "soon" ? "Soon" : "Off"} · ${district.areaCount} ${district.areaCount === 1 ? "area" : "areas"}`}
          />
        </>
      }
    >
      <GeoForm action={saveDistrictAction} submitLabel="Save">
        <input type="hidden" name="id" value={district.id} />
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_8rem_auto]">
          <Labelled label={`Name · ${state}`} required>
            <input name="name" defaultValue={district.name} required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} />
          </Labelled>
          <Address prefix={`/in/${district.stateCode}/`} slug={district.slug} locked={district.slugLocked} />
          <Labelled label="Status" required htmlFor={`district-status-${district.id}`}>
            <SelectField
              id={`district-status-${district.id}`}
              name="status"
              required
              options={DISTRICT_STATUS_OPTIONS}
              defaultValue={district.status}
              className={input}
            />
          </Labelled>
          <div className="pb-2">
            <StatusDot
              tone={districtTone(district)}
              label={`${district.areaCount} ${district.areaCount === 1 ? "area" : "areas"}${district.slugLocked ? "" : " · draft"}`}
            />
          </div>
        </div>
      </GeoForm>
    </RowShell>
  );
}

/* ---------- areas ---------- */

export function AddAreaForm({ districts, selected }: { readonly districts: readonly GeoAdminDistrict[]; readonly selected: string }): ReactElement {
  const districtOptions: readonly SelectOption[] = districts.map((district) => ({ value: district.id, label: district.name }));
  return (
    <GeoForm action={addAreaAction} submitLabel="Add area" tone="primary" clearOnSave>
      <div className="grid gap-3 sm:grid-cols-4">
        <Labelled label="District" required htmlFor="add-area-district">
          <SelectField
            id="add-area-district"
            name="district"
            required
            options={districtOptions}
            defaultValue={selected}
            placeholder="Choose a district"
            className={input}
          />
        </Labelled>
        <Labelled label="Name" required>
          <input name="name" required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} placeholder="Ghodbunder Road" />
        </Labelled>
        <Labelled label="Town" required>
          <input name="town" required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} placeholder="Thane" />
        </Labelled>
        <OptionalAddress />
        <Labelled label="PIN codes" className="sm:col-span-2">
          <input
            name="pins"
            pattern={PIN_LIST_PATTERN}
            title="6 digit PIN codes, separated by commas"
            autoComplete="off"
            className={input}
            placeholder="400607, 400615"
            inputMode="numeric"
          />
        </Labelled>
        <GeoPointFields
          idPrefix="add-area"
          latLabel="Latitude (auto)"
          lonLabel="Longitude (auto)"
          defaultLat=""
          defaultLon=""
          placeholder="found for you"
          inputClassName={input}
          captionClassName={caption}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="on" className={checkboxClasses} />
        Switch on now (the address becomes permanent)
      </label>
    </GeoForm>
  );
}

export function AreaRow({ area }: { readonly area: GeoAdminArea }): ReactElement {
  return (
    <RowShell
      summary={
        <>
          <Cell className="w-44 shrink-0 font-medium sm:w-56">{area.name}</Cell>
          <Cell className="hidden w-32 shrink-0 text-ink-soft sm:block">{area.cityName}</Cell>
          <Cell className="hidden flex-1 text-ink-soft md:block">{area.pincodes.join(", ")}</Cell>
          <StatusDot tone={onOffTone(area.status)} label={area.status === "on" ? "On" : "Off"} />
        </>
      }
    >
      <GeoForm action={saveAreaAction} submitLabel="Save">
        <input type="hidden" name="id" value={area.id} />
        <div className="grid items-end gap-3 sm:grid-cols-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_6.5rem_6rem]">
          <Labelled label="Name" required>
            <input name="name" defaultValue={area.name} required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} />
          </Labelled>
          <Labelled label="Town" required>
            <input name="town" defaultValue={area.cityName} required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} />
          </Labelled>
          <Labelled label="PIN codes">
            <input
              name="pins"
              defaultValue={area.pincodes.join(", ")}
              pattern={PIN_LIST_PATTERN}
              title="6 digit PIN codes, separated by commas"
              autoComplete="off"
              className={input}
              inputMode="numeric"
            />
          </Labelled>
          <GeoPointFields
            idPrefix={`area-${area.id}`}
            latLabel="Latitude"
            lonLabel="Longitude"
            defaultLat={String(area.lat ?? "")}
            defaultLon={String(area.lon ?? "")}
            inputClassName={input}
            captionClassName={caption}
          />
          <Labelled label="Status" htmlFor={`area-status-${area.id}`}>
            <SelectField id={`area-status-${area.id}`} name="status" options={ON_OFF_OPTIONS} defaultValue={area.status} className={input} />
          </Labelled>
        </div>
        <Address prefix={`/in/${area.stateCode}/${area.districtSlug}/`} slug={area.slug} locked={area.slugLocked} />
      </GeoForm>
    </RowShell>
  );
}

/* ---------- categories ---------- */

/** "None" (a top-level category) first, then every category that can be a parent. */
function parentOptions(parents: readonly GeoAdminCategory[]): readonly SelectOption[] {
  return [{ value: "", label: "None" }, ...parents.map((parent) => ({ value: parent.slug, label: parent.label }))];
}

export function AddCategoryForm({ parents }: { readonly parents: readonly GeoAdminCategory[] }): ReactElement {
  return (
    <GeoForm action={addCategoryAction} submitLabel="Add category" tone="primary" clearOnSave>
      <div className="grid gap-3 sm:grid-cols-4">
        <Labelled label="Name (plural)" required>
          <input name="label" required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} placeholder="Yoga Studios" />
        </Labelled>
        <Labelled label="One of them" required>
          <input name="singular" required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} placeholder="Yoga Studio" />
        </Labelled>
        <OptionalAddress />
        <Labelled label="Sub-category of" htmlFor="add-category-parent">
          <SelectField id="add-category-parent" name="parent" options={parentOptions(parents)} defaultValue="" className={input} />
        </Labelled>
        <Labelled label="Name words (sub-categories)" className="sm:col-span-2">
          <input name="keywords" autoComplete="off" className={input} placeholder="jee, iit" />
        </Labelled>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="page" className={checkboxClasses} />
          Own page on the website
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="on" className={checkboxClasses} />
          Switch on now (the address becomes permanent)
        </label>
      </div>
    </GeoForm>
  );
}

export function CategoryRow({ category, parents }: { readonly category: GeoAdminCategory; readonly parents: readonly GeoAdminCategory[] }): ReactElement {
  const parent = parents.find((candidate) => candidate.slug === category.parentSlug);
  return (
    <RowShell
      summary={
        <>
          <Cell className="w-44 shrink-0 font-medium sm:w-56">{category.label}</Cell>
          <Cell className="hidden flex-1 text-ink-soft sm:block">{parent === undefined ? "" : `in ${parent.label}`}</Cell>
          <StatusDot tone={onOffTone(category.status)} label={category.status === "on" ? "On" : "Off"} />
        </>
      }
    >
      <GeoForm action={saveCategoryAction} submitLabel="Save">
        <input type="hidden" name="id" value={category.id} />
        <div className="grid items-end gap-3 sm:grid-cols-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_6rem]">
          <Labelled label="Name (plural)" required>
            <input name="label" defaultValue={category.label} required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} />
          </Labelled>
          <Labelled label="One of them" required>
            <input name="singular" defaultValue={category.singular} required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={input} />
          </Labelled>
          <Labelled label="Sub-category of" htmlFor={`category-parent-${category.id}`}>
            <SelectField
              id={`category-parent-${category.id}`}
              name="parent"
              options={parentOptions(parents.filter((parent) => parent.slug !== category.slug))}
              defaultValue={category.parentSlug ?? ""}
              className={input}
            />
          </Labelled>
          <Labelled label="Status" htmlFor={`category-status-${category.id}`}>
            <SelectField id={`category-status-${category.id}`} name="status" options={ON_OFF_OPTIONS} defaultValue={category.status} className={input} />
          </Labelled>
        </div>
        {category.parentSlug === null ? null : (
          <Labelled label="Name words">
            <input name="keywords" defaultValue={category.keywords.join(", ")} autoComplete="off" className={input} />
          </Labelled>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Address prefix="" slug={category.slug} locked={category.slugLocked} />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="page" defaultChecked={category.hasPage} className={checkboxClasses} />
            Own page on the website
          </label>
        </div>
      </GeoForm>
    </RowShell>
  );
}
