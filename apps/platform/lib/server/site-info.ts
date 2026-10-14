import type { BookingContext, PractitionerScheduleRow, SiteFacts } from "@fynix/db";
import { localDateIn } from "@fynix/shared/lib/calendar/local-date";
import { activeAnnouncement } from "@fynix/shared/lib/business-facts/announcement";
import { upcomingClosures } from "@fynix/shared/lib/business-facts/closures";
import type { SiteInfo, SiteInfoBooking, SiteInfoClosure, SiteInfoHours, SiteInfoPractitioner } from "@/lib/site-info";

export interface BuildSiteInfoInput {
  readonly businessName: string;
  readonly facts: SiteFacts;
  readonly booking: BookingContext;
  /** The clinic's active doctors in display order, as readPractitionerSchedules returns them. */
  readonly practitioners: readonly PractitionerScheduleRow[];
  readonly now: Date;
}

/** "HH:MM:SS" (or "HH:MM") as Postgres returns a `time`, sliced to the "HH:MM" the client site shows. Null stays null. */
function toDisplayTime(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

function toHours(facts: SiteFacts): readonly SiteInfoHours[] {
  return facts.hours.map(
    (row): SiteInfoHours => ({
      dayOfWeek: row.dayOfWeek,
      opensAt: toDisplayTime(row.opensAt),
      closesAt: toDisplayTime(row.closesAt),
      closed: row.closed,
      openAllDay: row.openAllDay,
    }),
  );
}

function toClosures(facts: SiteFacts, today: string): readonly SiteInfoClosure[] {
  return upcomingClosures(facts.closures, today).map(
    (closure): SiteInfoClosure => ({
      startsOn: closure.startsOn,
      endsOn: closure.endsOn,
      note: closure.note,
      ...(typeof closure.opensAt === "string" && typeof closure.closesAt === "string"
        ? { opensAt: closure.opensAt, closesAt: closure.closesAt }
        : {}),
    }),
  );
}

/**
 * Only what a patient choosing a doctor needs to see. Hours and leave stay out: the availability endpoint already
 * turns them into slots, and a leave note is private to the clinic. `photoUrl` is always null for now -- the site
 * shows initials -- until practitioner photos have a public URL to hand out; the field exists in the contract from
 * the start so adding photos later is not a contract change.
 */
function toPractitioner(practitioner: PractitionerScheduleRow): SiteInfoPractitioner {
  return { id: practitioner.id, name: practitioner.name, title: practitioner.title, photoUrl: null };
}

/** Whether the site gets a booking block at all: the module is on and fully set up (time zone and settings). The
 * route reads the doctors only when this holds, since they are shown nowhere else. */
export function offersBooking(
  booking: BookingContext,
): booking is BookingContext & { readonly timeZone: string; readonly settings: NonNullable<BookingContext["settings"]> } {
  return booking.enabled && booking.timeZone !== null && booking.settings !== null;
}

function toBooking(booking: BookingContext, practitioners: readonly PractitionerScheduleRow[]): SiteInfoBooking | null {
  if (!offersBooking(booking)) return null;
  return {
    accepting: booking.settings.accepting,
    pausedMessage: booking.settings.pausedMessage,
    services: booking.services.map((service) => ({ id: service.id, name: service.name })),
    slotMinutes: booking.settings.slotMinutes,
    practitioners: practitioners.map(toPractitioner),
  };
}

/** Pure: turns a business's facts and booking context into what `GET /api/site/info` returns. No I/O. */
export function buildSiteInfo(input: BuildSiteInfoInput): SiteInfo {
  const today = localDateIn(input.facts.timeZone ?? "UTC", input.now);
  const announcement = activeAnnouncement(input.facts.announcement, today);

  return {
    business: input.businessName,
    timeZone: input.facts.timeZone,
    today,
    hours: toHours(input.facts),
    closures: toClosures(input.facts, today),
    announcement: announcement === null ? null : { message: announcement.message, endsOn: announcement.endsOn },
    booking: toBooking(input.booking, input.practitioners),
  };
}
