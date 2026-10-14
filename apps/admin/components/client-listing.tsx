import type { ReactElement } from "react";
import {
  PLACE_URL_CHANGE_REASON_MAX,
  PLACE_URL_SLUG_MAX,
  type DirectoryPlace,
  type ListingPlacement,
} from "@firstfold/db";
import {
  DIRECTORY_AREAS,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CITIES,
  DIRECTORY_ORIGIN,
  directoryCategoryPath,
  slugifyBusinessName,
} from "@firstfold/shared/lib/directory/places";
import { PLACEMENT_FIELD_MESSAGES, type PlacementField } from "@firstfold/shared/lib/directory/placement-form";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";
import { saveListingPlacementAction } from "@/app/(protected)/clients/[businessId]/actions";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { WebAddress } from "@/components/web-address";
import { webAddressOf } from "@/lib/server/web-address";

export type ListingNotice =
  | { readonly kind: "saved" }
  | { readonly kind: "taken" }
  /** Another client's listing already is the business named to take over. */
  | { readonly kind: "place-taken" }
  /** The business named to take over was added by its owner. */
  | { readonly kind: "place-added" }
  /** The listing already is a directory business, and another was named. */
  | { readonly kind: "place-fixed" }
  /** A business ID was given before the directory's businesses have IDs. */
  | { readonly kind: "no-places" }
  | { readonly kind: "invalid"; readonly field: PlacementField | null };

interface ClientListingProps {
  readonly businessId: string;
  /** The name on their website, used to suggest the name part of a new listing's address. */
  readonly displayName: string;
  readonly placement: ListingPlacement | null;
  /** The directory business the listing is, with its web address; null before it has one. */
  readonly place: DirectoryPlace | null;
  /** Whether the client's website has launched (the listing is only public after that). */
  readonly live: boolean;
  /** The paid tag running now, already worked out and formatted, or null. */
  readonly promotion: ListingPromotionLine | null;
  readonly notice: ListingNotice | null;
}

/** The client's running paid tag, as the Listing section's one line about it. */
export interface ListingPromotionLine {
  /** "Hot & New · Ad". */
  readonly label: string;
  /** When the last paid week ends, e.g. "6 Oct". */
  readonly until: string;
  /** False when the client has switched the tag off. */
  readonly visible: boolean;
}

const CHOOSE = "Choose\u2026";

const CATEGORY_OPTIONS: readonly SelectOption[] = DIRECTORY_CATEGORIES.map((category) => ({ value: category.slug, label: category.label }));
const CITY_OPTIONS: readonly SelectOption[] = DIRECTORY_CITIES.map((city) => ({ value: city.slug, label: city.name }));
/** Every area, under its city's name, in the order the cities are listed. */
const AREA_OPTIONS: readonly SelectOption[] = DIRECTORY_CITIES.flatMap((city) =>
  DIRECTORY_AREAS.filter((area) => area.city === city.slug).map((area) => ({ value: area.slug, label: area.name, group: city.name })),
);

/** Lowercase words joined by single hyphens: the server's address-name rule. */
const SLUG_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
/** A decimal degree: the server checks the range around Thane. */
const DEGREES_PATTERN = "[0-9]{1,3}(?:\\.[0-9]+)?";
/** An https address with no spaces; the server refuses any other scheme. */
const BOOKING_PATTERN = "https://\\S+";
/** A full international number: a plus sign, then 8 to 15 digits, with spaces or hyphens between them. */
const WHATSAPP_PATTERN = "[\\s\\-]*\\+(?:[\\s\\-]*[0-9]){8,15}[\\s\\-]*";

function noticeText(notice: ListingNotice): string {
  if (notice.kind === "saved") return "Saved. The directory picks it up within a minute.";
  if (notice.kind === "taken") return "Another client already has that exact address. Change the name part.";
  if (notice.kind === "place-taken") return "Another client's listing is already that business.";
  if (notice.kind === "place-added") return "That business was added by its owner; it can't be taken over.";
  if (notice.kind === "place-fixed") return "This listing is already a business on the directory. It can't become another one.";
  if (notice.kind === "no-places") return "Business IDs aren't set up yet. Leave the ID empty for now.";
  return notice.field === null ? "Check the form." : PLACEMENT_FIELD_MESSAGES[notice.field];
}

/** The listing's address, linked only once it is public so staff never open a page that isn't there yet. */
function ListingAddress({ path, live }: { readonly path: string; readonly live: boolean }): ReactElement {
  const shown = `${DIRECTORY_ORIGIN.replace(/^https:\/\//, "")}${path}`;
  return (
    <p className="text-sm">
      {live ? (
        <a
          href={`${DIRECTORY_ORIGIN}${path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link-underline break-all"
        >
          {shown}
        </a>
      ) : (
        <span className="break-all">{shown}</span>
      )}{" "}
      <span className="text-ink-soft">{live ? "\u00b7 website launched" : "\u00b7 goes live with their website"}</span>
    </p>
  );
}

/**
 * Where the client's Featured listing sits on Firstfold Local. Every field here shapes its address or was checked by
 * us, which is why the client cannot change any of them (spec 2026-09-29-customer-listing-tab-design.md).
 */
export function ClientListing({
  businessId,
  displayName,
  placement,
  place,
  live,
  promotion,
  notice,
}: ClientListingProps): ReactElement {
  // Before the listing has a place, the client is found on its category's page in its area.
  const path = placement === null ? null : directoryCategoryPath(placement.areaSlug, placement.categorySlug);
  const invalidField = notice?.kind === "invalid" ? notice.field : null;
  const invalid = (field: PlacementField): true | undefined => (invalidField === field ? true : undefined);

  return (
    <div className="max-w-2xl space-y-6">
      {notice === null ? null : (
        <Notice tone={notice.kind === "saved" ? "ok" : "problem"}>{noticeText(notice)}</Notice>
      )}

      {/* A listing with a place is at its web address; one without is shown as its category's page in its area. */}
      {path === null ? (
        <p className="text-sm text-ink-soft">
          No listing yet. Saving this creates one, and the client sees a Listing tab.
        </p>
      ) : place === null ? (
        <ListingAddress path={path} live={live} />
      ) : (
        <WebAddress
          businessId={businessId}
          place={{ id: place.id, citySlug: place.citySlug, urlSlug: place.urlSlug, locked: place.urlLockedAt !== null }}
          url={webAddressOf(place)}
          linked={live}
          note={live ? "website launched" : "goes live with their website"}
          cities={DIRECTORY_CITIES.map((city) => ({ slug: city.slug, name: city.name }))}
          nameMaxLength={PLACE_URL_SLUG_MAX}
          reasonMaxLength={PLACE_URL_CHANGE_REASON_MAX}
        />
      )}

      {promotion === null ? null : (
        <p className="text-sm">
          Paid tag: {promotion.label}{" "}
          <span className="text-ink-soft">
            {`\u00b7 until ${promotion.until}`}
            {promotion.visible ? null : " \u00b7 switched off by the client"}
          </span>
        </p>
      )}

      <form action={saveListingPlacementAction} className="grid gap-5 sm:grid-cols-2">
        <input type="hidden" name="businessId" value={businessId} />

        <div>
          <label htmlFor="listing-category" className={labelClasses}>
            Category
            <RequiredMark />
          </label>
          <SelectField
            id="listing-category"
            name="category"
            required
            options={CATEGORY_OPTIONS}
            defaultValue={placement?.categorySlug ?? ""}
            placeholder={CHOOSE}
            aria-invalid={invalid("category")}
            className={fieldClasses}
          />
        </div>

        <div>
          <label htmlFor="listing-city" className={labelClasses}>
            City
            <RequiredMark />
          </label>
          <SelectField
            id="listing-city"
            name="city"
            required
            options={CITY_OPTIONS}
            defaultValue={placement?.citySlug ?? "thane"}
            aria-invalid={invalid("city")}
            className={fieldClasses}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="listing-area" className={labelClasses}>
            Area
            <RequiredMark />
          </label>
          <SelectField
            id="listing-area"
            name="area"
            required
            options={AREA_OPTIONS}
            defaultValue={placement?.areaSlug ?? ""}
            placeholder={CHOOSE}
            aria-invalid={invalid("area")}
            aria-describedby="listing-area-hint"
            className={fieldClasses}
          />
          <p id="listing-area-hint" className={hintClasses}>
            Must be in the city above.
          </p>
        </div>

        {/* Once the listing is a directory business its web address is the place's; the slug is only the legacy
            address's last part (until the contract step), so it is kept as it is, not offered for editing. */}
        {placement !== null && placement.placeId !== null ? (
          <input type="hidden" name="slug" value={placement.slug} />
        ) : (
          <div className="sm:col-span-2">
            <label htmlFor="listing-slug" className={labelClasses}>
              Name in the address
              <RequiredMark />
            </label>
            <input
              id="listing-slug"
              name="slug"
              required
              maxLength={80}
              pattern={SLUG_PATTERN}
              title="Lowercase letters, digits and single hyphens"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              defaultValue={placement?.slug ?? slugifyBusinessName(displayName)}
              aria-invalid={invalid("slug")}
              aria-describedby="listing-slug-hint"
              className={fieldClasses}
            />
            <p id="listing-slug-hint" className={hintClasses}>
              {placement === null
                ? "Lowercase letters, digits and hyphens."
                : "Changing category, city, area or this changes the address. The old one redirects."}
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="listing-lat" className={labelClasses}>
                Latitude
                <RequiredMark />
              </label>
              <input
                id="listing-lat"
                name="lat"
                required
                inputMode="decimal"
                pattern={DEGREES_PATTERN}
                title="Degrees as a decimal, like 19.19"
                maxLength={20}
                autoComplete="off"
                defaultValue={placement?.lat ?? ""}
                aria-invalid={invalid("lat")}
                aria-describedby="listing-pin-hint"
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="listing-lon" className={labelClasses}>
                Longitude
                <RequiredMark />
              </label>
              <input
                id="listing-lon"
                name="lon"
                required
                inputMode="decimal"
                pattern={DEGREES_PATTERN}
                title="Degrees as a decimal, like 72.97"
                maxLength={20}
                autoComplete="off"
                defaultValue={placement?.lon ?? ""}
                aria-invalid={invalid("lon")}
                aria-describedby="listing-pin-hint"
                className={fieldClasses}
              />
            </div>
          </div>
          <p id="listing-pin-hint" className={hintClasses}>
            In Google Maps, right-click the building and click the numbers to copy them.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="listing-pin-label" className={labelClasses}>
            Pin label
            <RequiredMark />
          </label>
          <input
            id="listing-pin-label"
            name="pinLabel"
            required
            maxLength={120}
            autoComplete="off"
            defaultValue={placement?.pinLabel ?? ""}
            aria-invalid={invalid("pinLabel")}
            aria-describedby="listing-pin-label-hint"
            className={fieldClasses}
          />
          <p id="listing-pin-label-hint" className={hintClasses}>
            The client sees this, e.g. the road or landmark.
          </p>
        </div>

        <div>
          <label htmlFor="listing-whatsapp" className={labelClasses}>
            WhatsApp number
          </label>
          <RuleInput
            rule="phone"
            id="listing-whatsapp"
            name="whatsappPhone"
            type="tel"
            pattern={WHATSAPP_PATTERN}
            title="A full number with country code, like +91 90000 00000"
            maxLength={30}
            autoComplete="off"
            defaultValue={placement?.whatsappPhone ?? ""}
            aria-invalid={invalid("whatsappPhone")}
            aria-describedby="listing-whatsapp-hint"
            className={fieldClasses}
          />
          <p id="listing-whatsapp-hint" className={hintClasses}>
            Optional. Empty uses their main phone.
          </p>
        </div>
        <div>
          <label htmlFor="listing-booking" className={labelClasses}>
            Booking page
          </label>
          <input
            id="listing-booking"
            name="bookingUrl"
            type="url"
            inputMode="url"
            pattern={BOOKING_PATTERN}
            title="An address starting with https://"
            maxLength={2048}
            placeholder="https://"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            defaultValue={placement?.bookingUrl ?? ""}
            aria-invalid={invalid("bookingUrl")}
            aria-describedby="listing-booking-hint"
            className={fieldClasses}
          />
          <p id="listing-booking-hint" className={hintClasses}>
            Optional.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="listing-replaces" className={labelClasses}>
            Replaces unconfirmed listing
          </label>
          <input
            id="listing-replaces"
            name="replacesSourcePath"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            placeholder={"/in/dentists/mh/thane/naupada/\u2026"}
            defaultValue={placement?.replacesSourcePath ?? ""}
            aria-invalid={invalid("replacesSourcePath")}
            aria-describedby="listing-replaces-hint"
            className={fieldClasses}
          />
          <p id="listing-replaces-hint" className={hintClasses}>
            Optional. Paste its firstfold.io/in address so it disappears and nothing shows twice.
          </p>
        </div>

        {(placement?.placeId ?? null) === null ? (
          <div className="sm:col-span-2">
            <label htmlFor="listing-take-over" className={labelClasses}>
              Takes over business ID
            </label>
            <input
              id="listing-take-over"
              name="takeOverPlaceId"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={invalid("takeOverPlaceId")}
              aria-describedby="listing-take-over-hint"
              className={fieldClasses}
            />
            <p id="listing-take-over-hint" className={hintClasses}>
              Optional. It keeps that business&rsquo;s ID, address and reviews.
            </p>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <GatedSubmitButton className={buttonPrimary}>{placement === null ? "Create listing" : "Save listing"}</GatedSubmitButton>
        </div>
      </form>

      {placement === null || placement.previousPaths.length === 0 ? null : (
        <div className="text-sm text-ink-soft">
          <p className="font-medium text-ink">Old addresses</p>
          <p>They redirect here.</p>
          <ul className="mt-2 space-y-1 break-all">
            {placement.previousPaths.map((old) => (
              <li key={old}>{old}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
