import { findSetupCallBooking, isProjectStartedWithoutCallConfirmation } from "@brandbasket/db";
import type { ReactElement } from "react";
import { FactList, Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";

const INDIA_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });

/**
 * The kickoff call on the client page: read-only status showing when it was booked for, and whether the call was completed.
 * The action lives only in the prompt popup and Today.
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

  return (
    <Section title="Kickoff call" id="kickoff-call">
      <FactList
        items={[
          {
            label: "Booked for",
            value: booking?.startsAt ? `${INDIA_TIME.format(booking.startsAt)} India time` : "Not booked through the dashboard",
          },
          { label: "Call completed", value: completedText },
        ]}
      />
      <p className="mt-6 max-w-xl text-sm text-ink-soft">
        Call confirmation readies the website build. If nobody confirms the call within 24 hours, the build starts automatically.
      </p>
    </Section>
  );
}
