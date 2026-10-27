import { findSetupCallBooking } from "@brandbasket/db";
import type { ReactElement } from "react";
import { markCallHeldAction, undoCallHeldAction } from "@/app/(protected)/clients/[businessId]/kickoff-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { FactList, Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";

const INDIA_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });

/** The kickoff call on the client page: when it was booked for, and the button that marks it held. */
export async function KickoffCallSection({ businessId }: { readonly businessId: string }): Promise<ReactElement> {
  const booking = await findSetupCallBooking(getStaffDb(), businessId);
  const held = booking?.heldAt ?? null;
  return (
    <Section title="Kickoff call" id="kickoff-call">
      <FactList
        items={[
          {
            label: "Booked for",
            value: booking?.startsAt ? `${INDIA_TIME.format(booking.startsAt)} India time` : "Not booked through the dashboard",
          },
          { label: "Marked held", value: held === null ? "Not yet" : `${INDIA_TIME.format(held)} India time` },
        ]}
      />
      <p className="mt-6 max-w-xl text-sm text-ink-soft">
        Marking the call held opens the customer&apos;s To do page and Overview. If nobody marks it, it opens two days after the call.
      </p>
      <form action={held === null ? markCallHeldAction : undoCallHeldAction} className="mt-4">
        <input type="hidden" name="businessId" value={businessId} />
        <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
          {held === null ? "Mark call as held" : "Undo"}
        </button>
      </form>
    </Section>
  );
}
