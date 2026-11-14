import { findSetupCallBooking, isProjectStartedWithoutCallConfirmation } from "@brandbasket/db";
import type { ReactElement } from "react";
import { formatTimingWindow, kickoffMeetingLink } from "@brandbasket/shared/lib/setup-call-link";
import { buttonSecondary } from "@/components/console/buttons";
import { FactList, Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";

const INDIA_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });

/**
 * Kickoff call section on the client profile website tab.
 * Displays booking timing window, call status, and a direct join meeting action.
 */
export async function KickoffCallSection({ businessId }: { readonly businessId: string }): Promise<ReactElement> {
  const db = getStaffDb();
  const [booking, startedWithoutConfirmation] = await Promise.all([
    findSetupCallBooking(db, businessId),
    isProjectStartedWithoutCallConfirmation(db, businessId),
  ]);
  const held = booking?.heldAt ?? null;
  const completedText =
    held !== null
      ? `${INDIA_TIME.format(held)} India time`
      : startedWithoutConfirmation
        ? "Started without call confirmation"
        : "Not yet";
  const timingWindow =
    booking?.startsAt !== null && booking?.startsAt !== undefined
      ? formatTimingWindow(booking.startsAt, booking.endsAt ?? null)
      : null;
  const meetingLink = kickoffMeetingLink(booking?.inviteeUri);

  return (
    <Section title="Kickoff call" id="kickoff-call">
      <FactList
        items={[
          {
            label: "Booked for",
            value: booking?.startsAt ? `${INDIA_TIME.format(booking.startsAt)} India time` : "Not booked through the dashboard",
          },
          ...(timingWindow !== null ? [{ label: "Timing window", value: timingWindow }] : []),
          { label: "Call completed", value: completedText },
        ]}
      />
      {meetingLink !== null ? (
        <div className="mt-5">
          <a
            href={meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonSecondary} inline-flex items-center gap-1.5`}
          >
            Join meeting
          </a>
        </div>
      ) : null}
      <p className="mt-6 max-w-xl text-sm text-ink-soft">
        Call confirmation readies the website build. If nobody confirms the call within 24 hours, the build starts automatically.
      </p>
    </Section>
  );
}
