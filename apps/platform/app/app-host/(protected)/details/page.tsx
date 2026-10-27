import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { findAnnouncement, findBusinessTimeZone, findOwnListing, getBusinessHours, listClosures, withTenantScope } from "@brandbasket/db";
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { upcomingClosures } from "@brandbasket/shared/lib/business-facts/closures";
import { fromStoredHours, type OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { SECTION_TITLE } from "@/components/v2/classes";
import { AnnouncementPanel } from "@/components/panel/details/announcement-panel";
import { ClosuresPanel } from "@/components/panel/details/closures-panel";
import { HoursPanel } from "@/components/panel/details/hours-panel";
import { LivePreviewLayout } from "@/components/panel/live-preview/live-preview-layout";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { livePreviewSource } from "@/lib/server/live-preview";
import { askAboutHref } from "@/lib/website/tabs";
import { addClosureAction, clearAnnouncementAction, deleteClosureAction, saveAnnouncementAction, saveHoursAction } from "./actions";

export const metadata: Metadata = { title: "Business profile" };

/** How far ahead a fresh announcement defaults to running, when nothing is saved yet. */
const DEFAULT_ANNOUNCEMENT_DAYS = 2;

/** The facts a client's own website reads about hours, closures and the announcement banner, all read on the
 * same tenant-scoped transaction: findBusinessTimeZone runs there too, since businesses is only readable by the
 * app role for its own row. */
export default async function DetailsPage(): Promise<ReactElement> {
  const { tenant } = await requireWebsiteClient();

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
      <div className="mx-auto grid w-full max-w-[34rem] gap-8">
        <header className="grid gap-2">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Business profile</h1>
          <p className="text-[0.84375rem] text-ink-2">Hours, holidays and the announcement update your website in about a minute.</p>
        </header>

        <section className="grid gap-5">
          <h2 className={SECTION_TITLE}>Announcement</h2>
          <AnnouncementPanel
            announcement={announcement}
            today={today}
            defaultStartsOn={today}
            defaultEndsOn={addDays(today, DEFAULT_ANNOUNCEMENT_DAYS)}
            saveAction={saveAnnouncementAction}
            clearAction={clearAnnouncementAction}
          />
        </section>

        {/* ClosuresPanel renders its own heading (it owns the focus target after a removal), so it is not wrapped in a SECTION_TITLE. */}
        <section className="grid gap-5">
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
        </section>

        <section className="grid gap-5">
          <h2 className={SECTION_TITLE}>Opening hours</h2>
          <HoursPanel hours={hours} action={saveHoursAction} />
        </section>

        <section className="grid gap-4">
          <h2 className={SECTION_TITLE}>Everything else</h2>
          <p className="text-sm text-ink-soft">Contact details, services, photos and your logo go to the team.</p>
          <Link href={askAboutHref("Business details")} className="link-underline w-fit text-sm font-medium text-ink">
            Ask for a change
          </Link>
        </section>
      </div>
    </LivePreviewLayout>
  );
}
