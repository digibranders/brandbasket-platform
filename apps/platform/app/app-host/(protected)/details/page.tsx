import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { findAnnouncement, findBusinessTimeZone, findOwnListing, getBusinessHours, listClosures, withTenantScope } from "@brandbasket/db";
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { upcomingClosures } from "@brandbasket/shared/lib/business-facts/closures";
import { fromStoredHours, type OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { cn } from "@brandbasket/shared/lib/cn";
import { SOFT_BUTTON, STACK } from "@/components/v2/classes";
import { ActionRow, PageFrame, PageSection } from "@/components/v2/page";
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
    <PageFrame title="Business profile" lede="Hours, holidays and the announcement update your website in about a minute.">
      <LivePreviewLayout section="about" source={livePreviewSource(listing?.placement.placeId ?? null, new Date())}>
        <div className={cn(STACK, "max-w-[42rem]")}>
          <PageSection id="announcement" title="Announcement">
            <p className="mb-4 text-[0.84375rem] leading-relaxed text-ink-2">A banner across the top of your website, shown between the dates you choose.</p>
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
            <p className="mb-4 text-[0.84375rem] leading-relaxed text-ink-2">The hours your website shows to visitors, day by day.</p>
            <HoursPanel hours={hours} action={saveHoursAction} />
          </PageSection>

          <PageSection id="else" title="Everything else">
            <ActionRow
              text="Contact details, services, photos and your logo go to the team."
              action={
                <Link href={askAboutHref("Business details")} className={SOFT_BUTTON}>
                  Ask for a change
                </Link>
              }
            />
          </PageSection>
        </div>
      </LivePreviewLayout>
    </PageFrame>
  );
}
