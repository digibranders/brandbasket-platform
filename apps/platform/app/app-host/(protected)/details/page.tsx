import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { findAnnouncement, findBusinessTimeZone, findOwnListing, getBusinessHours, getBusinessProfile, listClosures, withTenantScope } from "@brandbasket/db";
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { upcomingClosures } from "@brandbasket/shared/lib/business-facts/closures";
import { fromStoredHours, type OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { cn } from "@brandbasket/shared/lib/cn";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { savedPhoneStart, visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { STACK } from "@/components/v2/classes";
import { PageFrame, PageSection } from "@/components/v2/page";
import { AnnouncementPanel } from "@/components/panel/details/announcement-panel";
import { ClosuresPanel } from "@/components/panel/details/closures-panel";
import { BrandAssetsPanel } from "@/components/panel/details/brand-assets-panel";
import { ContactPanel, type SavedContact } from "@/components/panel/details/contact-panel";
import { HoursPanel } from "@/components/panel/details/hours-panel";
import { LivePreviewLayout } from "@/components/panel/live-preview/live-preview-layout";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadBrandAssets } from "@/lib/server/brand-assets";
import { getAppDb } from "@/lib/server/db";
import { livePreviewSource } from "@/lib/server/live-preview";
import { removeBrandAssetAction } from "./brand-actions";
import { addClosureAction, clearAnnouncementAction, deleteClosureAction, saveAnnouncementAction, saveContactAction, saveHoursAction } from "./actions";

export const metadata: Metadata = { title: "Business" };

/** How far ahead a fresh announcement defaults to running, when nothing is saved yet. */
const DEFAULT_ANNOUNCEMENT_DAYS = 2;

/**
 * The business's own facts. Contact details are every paying customer's to keep current. Hours, holidays and the
 * announcement banner feed the client's own website, so they appear only with the Managed Website service; they are read
 * on the same tenant-scoped transaction as the rest, with findBusinessTimeZone, since businesses is only readable by the
 * app role for its own row.
 */
export default async function DetailsPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  const hasWebsite = billing.hasWebsite;
  const assets = await loadBrandAssets(tenant);

  const { profile, timeZone, hoursRows, closures, announcement, listing } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    profile: await getBusinessProfile(tx),
    timeZone: await findBusinessTimeZone(tx, tenant.businessId),
    hoursRows: hasWebsite ? await getBusinessHours(tx) : [],
    closures: hasWebsite ? await listClosures(tx) : [],
    announcement: hasWebsite ? await findAnnouncement(tx) : null,
    // Only a business with a listing has a page to preview.
    listing: hasWebsite ? await findOwnListing(tx) : null,
  }));

  const today = localDateIn(timeZone ?? "UTC", new Date());
  const hours = hoursRows.map(fromStoredHours).filter((day): day is OpeningHours => day !== null);

  // The saved number shows in its own country's layout; with nothing saved, the visitor's country is the best guess.
  const savedPhone = savedPhoneStart(profile?.phone ?? null);
  const defaultPhoneCountry = savedPhone.country ?? visitorPhoneCountry(await headers());
  const contact: SavedContact = {
    displayName: profile?.displayName ?? tenant.businessName,
    phone: savedPhone.number === "" ? null : savedPhone.number,
    email: profile?.email ?? null,
    addressLine1: profile?.addressLine1 ?? null,
    addressLine2: profile?.addressLine2 ?? null,
    city: profile?.city ?? null,
    region: profile?.region ?? null,
    postalCode: profile?.postalCode ?? null,
    country: profile?.country ?? null,
    serviceAreas: profile?.serviceAreas ?? null,
  };

  const sections = (
    <div className={cn(STACK, "max-w-[42rem]")}>
      <PageSection id="contact" title="Contact details">
        <ContactPanel contact={contact} phoneCountries={phoneCountryOptions()} defaultPhoneCountry={defaultPhoneCountry} action={saveContactAction} />
      </PageSection>

      {hasWebsite ? (
        <>
          <PageSection id="announcement" title="Announcement">
            <p className="mb-4 text-[0.9375rem] leading-relaxed text-ink-2">A banner across the top of your website, shown between the dates you choose.</p>
            <AnnouncementPanel
              announcement={announcement}
              today={today}
              defaultStartsOn={today}
              defaultEndsOn={addDays(today, DEFAULT_ANNOUNCEMENT_DAYS)}
              saveAction={saveAnnouncementAction}
              clearAction={clearAnnouncementAction}
            />
          </PageSection>

          {/* ClosuresPanel draws its own section and heading (it owns the focus target after a removal). */}
          <ClosuresPanel
            closures={upcomingClosures(closures, today)}
            today={today}
            addAction={addClosureAction}
            deleteAction={deleteClosureAction}
            heading="Holidays"
            note="Days your website shows you as closed, or open on different hours."
            itemNoun="holiday"
            notePlaceholder="Diwali"
            withHours
          />

          <PageSection id="hours" title="Opening hours">
            <p className="mb-4 text-[0.9375rem] leading-relaxed text-ink-2">The hours your website shows to visitors, day by day.</p>
            <HoursPanel hours={hours} action={saveHoursAction} />
          </PageSection>
        </>
      ) : null}

      <PageSection id="assets" title="Logo and photos">
        <BrandAssetsPanel assets={assets} remove={removeBrandAssetAction} />
      </PageSection>
    </div>
  );

  return (
    <PageFrame title="Business" lede={hasWebsite ? "Hours, holidays and the announcement update your website in about a minute." : "Keep your business details up to date."}>
      {hasWebsite ? (
        <LivePreviewLayout section="about" source={livePreviewSource(listing?.placement.placeId ?? null, new Date())}>
          {sections}
        </LivePreviewLayout>
      ) : (
        sections
      )}
    </PageFrame>
  );
}
