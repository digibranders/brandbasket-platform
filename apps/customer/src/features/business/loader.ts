import "server-only";
import {
  findAnnouncement,
  findBusinessTimeZone,
  getBusinessHours,
  getBusinessProfile,
  getOwnerContact,
  listClosures,
  listMediaAssets,
  withTenantScope,
  type MediaAsset,
} from "@brandbasket/db";
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { FALLBACK_PHONE_COUNTRY } from "@brandbasket/shared/lib/phone/fields";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { savedPhoneStart, visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { headers } from "next/headers";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { brandImageOf, type BrandImage } from "./brand-media";
import {
  DEFAULT_ANNOUNCEMENT_DAYS,
  hoursFormValues,
  upcomingClosures,
  type Announcement,
  type Closure,
} from "./rules";

export interface ContactView {
  readonly displayName: string;
  /** The country the phone number is typed for, and its dial code, e.g. IN and +91. */
  readonly phoneCountry: string;
  readonly dialCode: string;
  readonly phone: string;
  readonly email: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly serviceAreas: string;
}

/** What the website shows around the business's hours: the facts `/api/site/info` serves, read back for editing. */
export interface SiteFactsView {
  /** Today where the business is (YYYY-MM-DD). */
  readonly today: string;
  /** Starting values of the hours form: `hours.{day}.mode|opens|closes`. */
  readonly hours: Readonly<Record<string, string>>;
  /** Upcoming closures only, soonest first. */
  readonly closures: readonly Closure[];
  readonly announcement: Announcement | null;
  readonly defaultStartsOn: string;
  readonly defaultEndsOn: string;
}

export interface BrandView {
  /** The newest logo. */
  readonly logo: BrandImage | null;
  readonly photos: readonly BrandImage[];
}

/**
 * Contact details: what is saved, else (for the owner only) what the owner gave at sign-up. A saved number shows in its own country's layout; with
 * none saved, the visitor's country is the best guess for the dial code.
 */
export function loadContact(customer: CustomerContext): Promise<Loaded<ContactView>> {
  return load("business.contact", async () => {
    const { profile, ownerContact } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => {
      const profile = await getBusinessProfile(tx);
      // Nothing saved yet: offer what the owner gave at sign-up, only to the owner. For anyone else the signed-in person's
      // own address would show as the business's, and saving the form would make it so.
      return { profile, ownerContact: profile === null && customer.role === "owner" ? await getOwnerContact(tx, customer.user.id) : null };
    });
    const saved = savedPhoneStart(profile?.phone ?? ownerContact?.phone ?? null);
    const phoneCountry = saved.country ?? visitorPhoneCountry(await headers());
    const options = phoneCountryOptions();
    const dialCode = (options.find((option) => option.code === phoneCountry) ?? options.find((option) => option.code === FALLBACK_PHONE_COUNTRY))?.dialCode ?? "+91";
    return {
      displayName: profile?.displayName ?? customer.businessName,
      phoneCountry,
      dialCode,
      phone: saved.number,
      email: profile?.email ?? ownerContact?.email ?? "",
      addressLine1: profile?.addressLine1 ?? "",
      addressLine2: profile?.addressLine2 ?? "",
      city: profile?.city ?? "",
      region: profile?.region ?? "",
      postalCode: profile?.postalCode ?? "",
      country: profile?.country ?? "",
      serviceAreas: profile?.serviceAreas ?? "",
    };
  });
}

/**
 * Hours, holidays and the announcement: only for a business with the Managed Website, read in one transaction with the
 * business's time zone (businesses is readable by the app role for its own row only, through findBusinessTimeZone).
 */
export function loadSiteFacts(customer: CustomerContext): Promise<Loaded<SiteFactsView>> {
  return load("business.site-facts", async () => {
    const { timeZone, hourRows, closures, announcement } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => ({
      timeZone: await findBusinessTimeZone(tx, customer.businessId),
      hourRows: await getBusinessHours(tx),
      closures: await listClosures(tx),
      announcement: await findAnnouncement(tx),
    }));
    const today = localDateIn(timeZone ?? "UTC", new Date());
    return {
      today,
      hours: hoursFormValues(hourRows),
      closures: upcomingClosures(closures, today),
      announcement,
      defaultStartsOn: today,
      defaultEndsOn: addDays(today, DEFAULT_ANNOUNCEMENT_DAYS),
    };
  });
}

const imageList = (assets: readonly MediaAsset[]): BrandImage[] => assets.map(brandImageOf);

/** The logo (the newest one) and the photos. A failed read is an error panel, never an empty library that looks like having none. */
export function loadBrand(customer: CustomerContext): Promise<Loaded<BrandView>> {
  return load("business.brand", async () => {
    const [logos, photos] = await withTenantScope(getAppDb(), customer.tenant, (tx) => Promise.all([listMediaAssets(tx, "logo"), listMediaAssets(tx, "photo")]));
    const logo = logos.at(-1);
    return { logo: logo === undefined ? null : brandImageOf(logo), photos: imageList(photos) };
  });
}
