import {
  countAppointments,
  findBusinessTimeZone,
  findBusinessWebsiteUrl,
  findListingPlacement,
  findPlaces,
  getSiteKey,
  hasLiveProject,
  lastSiteHitAt,
  listEnabledModules,
  listUpcomingDirectoryPromotions,
  readDirectoryStatuses,
} from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { readBusinessModuleNotice } from "@brandbasket/shared/lib/business-module-notices";
import { formatPromotionDay, promotionStatus, promotionTagDisplay } from "@brandbasket/shared/lib/directory/promotion";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { ClientFeatures } from "@/components/client-features";
import { ClientListing } from "@/components/client-listing";
import { ClientListingTags } from "@/components/client-listing-tags";
import { labelClasses } from "@/components/console/field-styles";
import { Quiet, Section } from "@/components/console/section";
import { adminBrand } from "@/lib/brand";
import { clientListingKey, readClientTagNotice } from "@/lib/client-tags";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { getSiteApiToken } from "@/lib/server/site-token";
import { addressOf, CustomerLink, Facts, hoursForDay, readListingNotice, SiteApiTokenBlock, TrackingBlock, WebsiteUrlBlock } from "../parts";

export const metadata: Metadata = { title: "Client website" };

export default async function ClientWebsitePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { client } = await openClientTab(businessId, "website");
  const sp = await searchParams;
  const db = getStaffDb();
  const renderedAt = new Date();
  const [siteApiToken, siteKey, lastEventAt, websiteUrl, timeZone, enabledModules, appointmentCounts, listingPlacement, listingLive, promotions] = await Promise.all([
    getSiteApiToken(client.businessId),
    getSiteKey(db, client.businessId),
    lastSiteHitAt(db, client.businessId),
    findBusinessWebsiteUrl(db, client.businessId),
    findBusinessTimeZone(db, client.businessId),
    listEnabledModules(db, client.businessId),
    countAppointments(db, client.businessId),
    findListingPlacement(db, client.businessId),
    hasLiveProject(db, client.businessId),
    listUpcomingDirectoryPromotions(db, client.businessId, renderedAt),
  ]);
  const websiteNotice = sp.website === "saved" || sp.website === "invalid" ? sp.website : null;
  const featuresNotice = readBusinessModuleNotice(sp.features);
  const listingNotice = readListingNotice(sp.listing, sp.listingField);
  const tagsNotice = readClientTagNotice(sp.tags);
  const listingPlaceId = listingPlacement?.placeId ?? null;
  // The tags are kept under the listing's place, or under its key until it has one.
  const listingKey = listingPlacement === null ? null : clientListingKey(listingPlacement);
  const listingStatus =
    listingKey === null
      ? undefined
      : (await readDirectoryStatuses(db, listingPlaceId === null ? { placeIds: [], unplacedKeys: [listingKey] } : { placeIds: [listingPlaceId], unplacedKeys: [] })).get(
          listingPlaceId ?? listingKey,
        );
  const listingPlace = listingPlaceId === null ? null : ((await findPlaces(db, [listingPlaceId])).get(listingPlaceId) ?? null);
  const promotion = promotionStatus(promotions, renderedAt);
  const listingPromotion =
    promotion.running === null || promotion.endsAt === null
      ? null
      : { label: promotionTagDisplay(promotion.running.tag), until: formatPromotionDay(promotion.endsAt), visible: promotion.visible };
  const { profile } = client;

  return (
    <>
      <Section title="Their website">
        <div className="max-w-2xl space-y-8">
          <WebsiteUrlBlock businessId={client.businessId} websiteUrl={websiteUrl} notice={websiteNotice} />
          <div>
            <h3 className={labelClasses}>Site API token</h3>
            <div className="mt-2">
              <SiteApiTokenBlock businessId={client.businessId} token={siteApiToken} />
            </div>
          </div>
          <div>
            <h3 className={labelClasses}>Site tracking</h3>
            <div className="mt-2">
              <TrackingBlock businessId={client.businessId} siteKey={siteKey?.key ?? null} appOrigin={serverEnv().APP_ORIGIN} lastEventAt={lastEventAt} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Features" id="features" aside="Time zone and modules">
        <ClientFeatures
          businessId={client.businessId}
          timeZone={timeZone}
          enabledModules={enabledModules}
          appointmentCounts={appointmentCounts}
          notice={featuresNotice}
        />
      </Section>

      {adminBrand().sellsDirectory ? (
        <Section title="Listing" id="listing" aside={adminBrand().directoryName}>
          <ClientListing
            businessId={client.businessId}
            displayName={profile?.displayName ?? client.businessName}
            placement={listingPlacement}
            place={listingPlace}
            live={listingLive}
            promotion={listingPromotion}
            notice={listingNotice}
          />
          {listingPlacement === null ? null : (
            <div className="mt-10">
              <ClientListingTags
                businessId={client.businessId}
                businessName={profile?.displayName ?? client.businessName}
                staffVerified={listingStatus !== undefined}
                trusted={listingStatus?.trusted ?? false}
                notice={tagsNotice}
              />
            </div>
          )}
        </Section>
      ) : null}

      <Section title="Business details">
        {profile === null ? (
          <Quiet>Not filled in yet.</Quiet>
        ) : (
          <Facts
            items={[
              { label: "Name on the website", value: profile.displayName },
              { label: "Tagline", value: profile.tagline },
              { label: "Public phone", value: displayPhoneText(profile.phone) },
              { label: "Public email", value: profile.email },
              { label: "Address", value: addressOf(profile) },
              { label: "Areas they serve", value: profile.serviceAreas },
              { label: "Google Business Profile", value: profile.googleBusinessUrl === null ? null : <CustomerLink url={profile.googleBusinessUrl} /> },
              { label: "About the business", value: profile.description },
            ]}
          />
        )}
      </Section>

      <Section title="Opening hours">
        {client.hours.length === 0 ? (
          <Quiet>Not filled in yet.</Quiet>
        ) : (
          <dl className="max-w-md divide-y divide-line">
            {WEEKDAYS.map((label, day) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt>{label}</dt>
                <dd className="text-right tabular-nums text-ink-2">{hoursForDay(client.hours, day)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title="What they offer" aside={client.services.length === 0 ? undefined : `${client.services.length} listed`}>
        {client.services.length === 0 ? (
          <Quiet>None added yet.</Quiet>
        ) : (
          <ol className="max-w-2xl divide-y divide-line">
            {client.services.map((service) => (
              <li key={service.id} className="py-3 first:pt-0">
                <p className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{service.name}</span>
                  {service.priceText === null ? null : <span className="tabular-nums text-ink-2">{service.priceText}</span>}
                </p>
                {service.summary === null ? null : <p className="mt-1 text-sm text-ink-2">{service.summary}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
