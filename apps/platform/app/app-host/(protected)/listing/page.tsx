import type { Metadata } from "next";

import { requestBrand } from "@/lib/server/request-brand";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import {
  findAnnouncement,
  findBusinessTimeZone,
  findBusinessWebsiteUrl,
  findOwnListing,
  findPlaces,
  getBusinessHours,
  getBusinessProfile,
  listClosures,
  hasLiveProject,
  listListingEnquiries,
  placeUrlPath,
  resolveListingKey,
  withTenantScope,
} from "@brandbasket/db";
import { DEFAULT_BUSINESS_TIME_ZONE, addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import type { ListingButton } from "@brandbasket/shared/lib/directory/listing-content";
import { DIRECTORY_ORIGIN, areaName, categoryLabel, cityName, directoryCategoryPath } from "@brandbasket/shared/lib/directory/places";
import { LISTING_STAGE_LABELS, listingStage, type ListingStage } from "@brandbasket/shared/lib/directory/stage";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { describeHours, describeOpenStatus, describeStoredDay } from "@brandbasket/shared/lib/onboarding/hours";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import {
  ListingDetails,
  type ListingAnnouncement,
  type ListingHoursLine,
} from "@/components/panel/listing/listing-details";
import { EnquiriesList } from "@/components/panel/listing/enquiries-list";
import { ListingLink } from "@/components/panel/listing/listing-link";
import { LivePreviewLayout } from "@/components/panel/live-preview/live-preview-layout";
import { getEnabledModules } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { livePreviewSource } from "@/lib/server/live-preview";
import {
  saveListingAboutAction,
  saveListingButtonsAction,
  saveListingTagsAction,
  saveListingTaglineAction,
  setListingVisibleAction,
} from "./actions";
import { listingHeadline } from "./headline";

export const metadata: Metadata = { title: "Your listing" };

/** The status dot. Live borrows the StatTile "good" green, building the gold-deep waiting shade. */
const STAGE_DOT: Readonly<Record<ListingStage, string>> = {
  building: "bg-gold-deep",
  live: "bg-emerald-600",
  hidden: "bg-ink-soft",
  paused: "bg-ink-soft",
};

/** How many enquiries the page lists; older ones stay with us. */
const ENQUIRIES_SHOWN = 20;

function hasText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

/**
 * The client's Featured listing on the local directory: where it stands, its address, the fields they edit, and the
 * ones staff set. Everything is read on one tenant-scoped transaction, like Your details. 404s until staff create
 * the listing, which is also when Listing appears in the nav.
 */
export default async function ListingPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess({ plan: "premium" });
  const now = new Date();

  const [data, modules] = await Promise.all([
    withTenantScope(getAppDb(), tenant, async (tx) => ({
      listing: await findOwnListing(tx),
      live: await hasLiveProject(tx, tenant.businessId),
      websiteUrl: await findBusinessWebsiteUrl(tx, tenant.businessId),
      timeZone: await findBusinessTimeZone(tx, tenant.businessId),
      hoursRows: await getBusinessHours(tx),
      closures: await listClosures(tx),
      announcement: await findAnnouncement(tx),
      profile: await getBusinessProfile(tx),
    })),
    getEnabledModules(),
  ]);
  if (data.listing === null) notFound();

  const { placement, content } = data.listing;
  // Enquiries are kept for staff, not in the customer's own rows: read here for this client's own business only, by
  // its place (every address it has had), or, while the listing has none, by the place or key its address names.
  const staffDb = getStaffDb();
  const business =
    placement.placeId === null
      ? await resolveListingKey(staffDb, `${placement.categorySlug}/${placement.citySlug}/${placement.areaSlug}/${placement.slug}`)
      : { placeId: placement.placeId, listingKey: null };
  const enquiries = await listListingEnquiries(staffDb, business, ENQUIRIES_SHOWN);
  const stage = listingStage({ hasLiveProject: data.live, billingStatus: billing.status, visible: content.visible });
  // Its own page once it has a place (its Business ID); before that, its category's page in its area.
  const place = placement.placeId === null ? undefined : (await findPlaces(staffDb, [placement.placeId])).get(placement.placeId);
  const url = `${DIRECTORY_ORIGIN}${place === undefined ? directoryCategoryPath(placement.areaSlug, placement.categorySlug) : placeUrlPath(place)}`;
  const category = categoryLabel(placement.categorySlug) ?? placement.categorySlug;
  const area = areaName(placement.citySlug, placement.areaSlug) ?? placement.areaSlug;
  const city = cityName(placement.citySlug) ?? placement.citySlug;
  const brand = await requestBrand();
  const headline = listingHeadline({ stage, visible: content.visible, category, area });

  // Same "today" as Your details and the directory feed, so all three agree on whether the announcement is showing.
  const today = localDateIn(data.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE, now);
  const announcement: ListingAnnouncement | null =
    data.announcement !== null && data.announcement.startsOn <= today && today <= data.announcement.endsOn
      ? { message: data.announcement.message, until: formatStoredDate(data.announcement.endsOn) }
      : null;
  // This week, Monday first, with a holiday standing in for the usual hours on its own date.
  const weekdayToday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const hours: readonly ListingHoursLine[] = WEEKDAYS.map((day, dayOfWeek) => {
    const date = addDays(today, dayOfWeek - weekdayToday);
    const holiday = data.closures.find((closure) => closure.startsOn <= date && date <= closure.endsOn);
    if (holiday === undefined) {
      return { day, hours: describeStoredDay(data.hoursRows.filter((row) => row.dayOfWeek === dayOfWeek)) ?? "Not set" };
    }
    const hoursText =
      typeof holiday.opensAt === "string" && typeof holiday.closesAt === "string"
        ? describeHours({ dayOfWeek, mode: "open", opensAt: holiday.opensAt, closesAt: holiday.closesAt })
        : "Closed";
    return { day, hours: holiday.note === null ? hoursText : `${hoursText} · ${holiday.note}` };
  });

  const hoursStatus = describeOpenStatus(data.hoursRows, data.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE, now, data.closures);

  // A button the directory would not show is marked here too, so the Buttons row never claims one it won't have.
  const phone = data.profile?.phone ?? null;
  const unavailable: Partial<Record<ListingButton, string>> = {
    ...(hasText(phone) ? {} : { call: "Needs a phone number" }),
    ...(hasText(placement.whatsappPhone ?? phone) ? {} : { whatsapp: "Needs a phone number" }),
    ...(modules.includes("appointments") ? {} : { book: "Needs Appointments" }),
    ...(modules.includes("appointments") && placement.bookingUrl === null ? { book: "We'll set this up" } : {}),
    ...(data.websiteUrl === null ? { website: "After your website launches" } : {}),
  };

  // The account menu's Help address, prefilled, until change requests exist.
  const requestSubject = encodeURIComponent("Change to my listing");
  const requestBody = encodeURIComponent(
    `Please change my listing (${url}).\n\nWhat to change (name, category, area, phone or map pin):\n`,
  );
  const requestHref = `mailto:${brand.contactEmail ?? siteConfig.email}?subject=${requestSubject}&body=${requestBody}`;

  const setByUs: readonly (readonly [string, string])[] = [
    ["Name", data.profile?.displayName ?? tenant.businessName],
    ["Category", category],
    ["Area", `${area}, ${city}`],
    ["Phone", hasText(phone) ? (displayPhoneText(phone) ?? phone) : "Not set"],
    ["Map pin", placement.pinLabel],
  ];

  return (
    <LivePreviewLayout section="about" source={livePreviewSource(placement.placeId, now)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="panel-title">Your listing</h1>
        <p className="inline-flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className={`size-2.5 rounded-full ${STAGE_DOT[stage]}`} />
          {LISTING_STAGE_LABELS[stage]}
        </p>
      </div>

      {/* The layout's billing banner already asks for payment; this only says why nothing below can be changed. */}
      {billing.hasAccess ? null : <p className="mt-6 text-sm text-ink-soft">Changes open once your plan is paid.</p>}

      <div className="mt-8 max-w-2xl space-y-5">
        <p className="font-serif text-2xl leading-snug">{headline}</p>
        <ListingLink url={url} live={stage === "live"} />
      </div>

      <div className="mt-14 grid gap-12 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="listing-details">
          <h2 id="listing-details" className="panel-section border-b border-line pb-3">
            Your details
          </h2>
          <ListingDetails
            content={content}
            editable={billing.hasAccess}
            unavailable={unavailable}
            hours={hours}
            hoursStatus={hoursStatus}
            announcement={announcement}
            actions={{
              about: saveListingAboutAction,
              tagline: saveListingTaglineAction,
              tags: saveListingTagsAction,
              buttons: saveListingButtonsAction,
              visible: setListingVisibleAction,
            }}
          />
        </section>

        <section aria-labelledby="listing-ours">
          <h2 id="listing-ours" className="panel-section border-b border-line pb-3">
            Set by us
          </h2>
          <dl className="text-sm">
            {setByUs.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b border-line py-3">
                <dt className="font-semibold text-ink-soft">{label}</dt>
                <dd className="break-words text-ink-soft">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4">
            <a href={requestHref} className="group inline-flex items-center gap-2 text-sm font-semibold text-accent">
              Request a change
              <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
            </a>
          </p>
        </section>
      </div>

      <section id="enquiries" aria-labelledby="listing-enquiries" className="mt-14 max-w-2xl scroll-mt-8">
        <h2 id="listing-enquiries" className="panel-section border-b border-line pb-3">
          Enquiries
        </h2>
        <div className="mt-5">
          <EnquiriesList enquiries={enquiries} limit={ENQUIRIES_SHOWN} />
        </div>
      </section>
    </LivePreviewLayout>
  );
}
