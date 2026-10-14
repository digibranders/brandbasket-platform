import "server-only";
import {
  changePlaceUrl,
  findPlaces,
  InvalidPlaceUrlChangeReasonError,
  InvalidPlaceUrlError,
  PlaceUrlNotLiveError,
  placeUrlPath,
  UnknownPlaceError,
  type DirectoryPlace,
} from "@fynix/db";
import { z } from "zod";
import { isElsewhereCitySlug } from "@fynix/shared/lib/directory/opened-districts";
import { isPlaceCitySlug, isPlaceId, isPlaceUrlChangeReason, isPlaceUrlSlug } from "@fynix/shared/lib/directory/place-id";
import { DIRECTORY_ORIGIN, DIRECTORY_STATE, isDirectoryCity } from "@fynix/shared/lib/directory/places";
import {
  WEB_ADDRESS_FIELDS,
  WEB_ADDRESS_MESSAGES,
  webAddressValuesFrom,
  type WebAddressField,
  type WebAddressFormState,
  type WebAddressValues,
} from "../web-address-form";
import { getStaffDb } from "./db";

/*
 * Staff change a live business's web address, /in/mh/<city>/business/<name>/<id> (Task 9 of
 * docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md): a rebrand, or a move to another city. The id
 * stays, so its reviews, Verified and counts stay too, and the old address 301s to the new one. Every change is
 * audited with who made it and why (changePlaceUrl).
 */

const formSchema = z.object({
  urlSlug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isPlaceUrlSlug, { message: WEB_ADDRESS_MESSAGES.urlSlug }),
  // Known cities are checked against the place below: its current city may be one the lists do not have yet.
  citySlug: z.string().trim().refine(isPlaceCitySlug, { message: WEB_ADDRESS_MESSAGES.citySlug }),
  reason: z.string().trim().refine(isPlaceUrlChangeReason, { message: WEB_ADDRESS_MESSAGES.reason }),
});

function isWebAddressField(value: PropertyKey | undefined): value is WebAddressField {
  return (WEB_ADDRESS_FIELDS as readonly PropertyKey[]).includes(value ?? "");
}

function refused(field: WebAddressField | null, message: string, values: WebAddressValues): WebAddressFormState {
  return { status: "error", field, message, values };
}

/** The typed refusals changePlaceUrl can give, as the form's messages; anything else is not the form's to answer. */
function refusalFor(error: unknown, values: WebAddressValues): WebAddressFormState | null {
  if (error instanceof PlaceUrlNotLiveError) return refused(null, WEB_ADDRESS_MESSAGES.notLive, values);
  if (error instanceof UnknownPlaceError) return refused(null, WEB_ADDRESS_MESSAGES.unknown, values);
  if (error instanceof InvalidPlaceUrlError) return refused("urlSlug", WEB_ADDRESS_MESSAGES.urlSlug, values);
  if (error instanceof InvalidPlaceUrlChangeReasonError) return refused("reason", WEB_ADDRESS_MESSAGES.reason, values);
  return null;
}

/** The business's full address on the website. */
export function webAddressOf(place: Pick<DirectoryPlace, "id" | "stateCode" | "citySlug" | "urlSlug">): string {
  return `${DIRECTORY_ORIGIN}${placeUrlPath(place)}`;
}

/**
 * Validates the form and changes the business's URL in one transaction, answering with its new full address or a
 * refusal for the form. The caller has already checked the session is staff's. A form that does not name a business
 * by its id was not made by the console, and throws.
 */
export async function changeWebAddress(input: {
  readonly formData: FormData;
  readonly staffUserId: string;
  readonly now: Date;
}): Promise<WebAddressFormState> {
  const placeId = input.formData.get("placeId");
  if (typeof placeId !== "string" || !isPlaceId(placeId)) throw new Error("The web address form must name a business id.");
  const values = webAddressValuesFrom((name) => input.formData.get(name));

  const parsed = formSchema.safeParse(values);
  if (!parsed.success) {
    // The first problem in the form's own order, so the box staff reach first is the one marked.
    const issue = WEB_ADDRESS_FIELDS.map((field) => parsed.error.issues.find((candidate) => candidate.path[0] === field)).find(
      (candidate) => candidate !== undefined,
    );
    const field = isWebAddressField(issue?.path[0]) ? issue.path[0] : null;
    return refused(field, issue?.message ?? WEB_ADDRESS_MESSAGES.urlSlug, values);
  }
  const { urlSlug, citySlug, reason } = parsed.data;

  try {
    return await getStaffDb().transaction(async (tx): Promise<WebAddressFormState> => {
      const current = (await findPlaces(tx, [placeId])).get(placeId);
      if (current === undefined) return refused(null, WEB_ADDRESS_MESSAGES.unknown, values);
      if (citySlug !== current.citySlug) {
        // The city lists are the opened state's towns. A business elsewhere has <state>-<district> from its PIN, which
        // only its owner's PIN can change, and it must never move into a town whose state it is not in.
        if (current.stateCode !== DIRECTORY_STATE.code || isElsewhereCitySlug(current.citySlug)) {
          return refused("citySlug", WEB_ADDRESS_MESSAGES.otherState, values);
        }
        // A city the directory's lists do not have is kept only where the business already is (open data covers more).
        if (!isDirectoryCity(citySlug)) return refused("citySlug", WEB_ADDRESS_MESSAGES.citySlug, values);
      }
      if (current.citySlug === citySlug && current.urlSlug === urlSlug) return refused("urlSlug", WEB_ADDRESS_MESSAGES.same, values);
      await changePlaceUrl(tx, placeId, { citySlug, urlSlug }, { staffUserId: input.staffUserId, reason }, input.now);
      return { status: "changed", url: webAddressOf({ ...current, citySlug, urlSlug }) };
    });
  } catch (error) {
    const refusal = refusalFor(error, values);
    if (refusal === null) throw error;
    return refusal;
  }
}
