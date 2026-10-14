import type { Metadata } from "next";
import type { ReactElement } from "react";
import { findAnnouncement, findBusinessTimeZone, findOwnListing, getBusinessHours, listClosures, withTenantScope } from "@firstfold/db";
import { addDays, localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import { upcomingClosures } from "@firstfold/shared/lib/business-facts/closures";
import { fromStoredHours, type OpeningHours } from "@firstfold/shared/lib/onboarding/hours";
import { AnnouncementPanel } from "@/components/panel/details/announcement-panel";
import { ClosuresPanel } from "@/components/panel/details/closures-panel";
import { HoursPanel } from "@/components/panel/details/hours-panel";
import { LivePreviewLayout } from "@/components/panel/live-preview/live-preview-layout";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { livePreviewSource } from "@/lib/server/live-preview";
import { addClosureAction, clearAnnouncementAction, deleteClosureAction, saveAnnouncementAction, saveHoursAction } from "./actions";

export const metadata: Metadata = { title: "Your details" };

/** How far ahead a fresh announcement defaults to running, when nothing is saved yet. */
const DEFAULT_ANNOUNCEMENT_DAYS = 2;

/** The facts a client's own website reads about hours, closures and the announcement banner, all read on the
 * same tenant-scoped transaction: findBusinessTimeZone runs there too, since businesses is only readable by the
 * app role for its own row. */
export default async function DetailsPage(): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess();

  const { timeZone, hoursRows, closures, announcement, listing } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    timeZone: await findBusinessTimeZone(tx, tenant.businessId),
    hoursRows: await getBusinessHours(tx),
    closures: await listClosures(tx),
    announcement: await findAnnouncement(tx),
    // Only a business with a listing has a page to preview.
    listing: await findOwnListing(tx),
  }));

  const today = localDateIn(timeZone ?? "UTC", new Date());
  const hours = hoursRows.map(fromStoredHours).filter((day): day is OpeningHours => day !== null);

  return (
    <LivePreviewLayout section="about" source={livePreviewSource(listing?.placement.placeId ?? null, new Date())}>
      <h1 className="panel-title">Your details</h1>

      <div className="mt-8">
        <h2 className="panel-section">Announcement</h2>
        <div className="mt-5">
          <AnnouncementPanel
            announcement={announcement}
            today={today}
            defaultStartsOn={today}
            defaultEndsOn={addDays(today, DEFAULT_ANNOUNCEMENT_DAYS)}
            saveAction={saveAnnouncementAction}
            clearAction={clearAnnouncementAction}
          />
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <ClosuresPanel
          closures={upcomingClosures(closures, today)}
          today={today}
          addAction={addClosureAction}
          deleteAction={deleteClosureAction}
          heading="Holidays"
          itemNoun="holiday"
          notePlaceholder="Diwali"
          withHours
        />
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="panel-section">Opening hours</h2>
        <div className="mt-5">
          <HoursPanel hours={hours} action={saveHoursAction} />
        </div>
      </div>
    </LivePreviewLayout>
  );
}
