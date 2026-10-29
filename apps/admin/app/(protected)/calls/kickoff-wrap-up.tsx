import { listKickoffBoard } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { addOnById, isAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { buttonDanger, buttonPrimary } from "@/components/console/buttons";
import { EmptyLine } from "@/components/console/hairline-list";
import { Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";
import { clock, weekdayDate } from "@/lib/team-time";
import { completeKickoffAction, kickoffDidNotHappenAction } from "./kickoff-actions";

/** How far back a finished call is still asked about. */
const LOOK_BACK_DAYS = 14;

/**
 * Kickoff calls that are over and not marked held. Nothing here is required for a normal call: the customer's Home moves
 * on when the call ends, and the website build starts by itself two hours later. This is where staff write the notes the
 * customer reads on Home (which starts the build at once), or say the call did not happen so the customer picks a new time.
 */
export async function KickoffWrapUp({ now }: { readonly now: Date }): Promise<ReactElement> {
  const board = await listKickoffBoard(getStaffDb(), { now, lookBackDays: LOOK_BACK_DAYS });
  const finished = board.filter((row) => row.heldAt === null && row.endsAt !== null && row.endsAt <= now);
  return (
    <Section title="Just finished">
      {finished.length === 0 ? (
        <EmptyLine>No calls waiting for a word from you.</EmptyLine>
      ) : (
        <ul className="grid gap-6">
          {finished.map((row) => (
            <li key={row.businessId} className="grid gap-3 border-b border-line pb-6 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/clients/${row.businessId}`} className="font-semibold text-ink">
                  {row.businessName}
                </Link>
                <span className="text-sm text-ink-2">
                  {row.endsAt === null ? "" : `Ended ${weekdayDate(row.endsAt)}, ${clock(row.endsAt)}`}
                </span>
              </div>
              <p className="text-sm text-ink-2">
                {row.services.filter(isAddOnId).map((id) => addOnById(id).title).join(", ") || "No active service"}
                {row.hasWebsite ? (row.projectStatus === "onboarding" ? " · build starts by itself" : ` · website ${row.projectStatus ?? "not started"}`) : ""}
              </p>
              <form action={completeKickoffAction} className="grid gap-2">
                <input type="hidden" name="businessId" value={row.businessId} />
                <label className="grid gap-1 text-sm font-semibold text-ink">
                  What was agreed (the customer reads this on Home)
                  <textarea name="notes" rows={3} maxLength={600} className="rounded-md border border-ink-2/65 bg-surface px-3 py-2 text-sm font-normal" />
                </label>
                <div>
                  <button type="submit" className={buttonPrimary}>
                    Save and start the build
                  </button>
                </div>
              </form>
              <form action={kickoffDidNotHappenAction}>
                <input type="hidden" name="businessId" value={row.businessId} />
                <button type="submit" className={buttonDanger}>
                  Did not happen
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
