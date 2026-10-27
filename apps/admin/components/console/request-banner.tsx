import { getChangeWithEvents } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { stateLabel } from "@/lib/request-controls";
import { getStaffDb } from "@/lib/server/db";

/**
 * On a ticket that is a request for a change: a line saying so, with where it is and a link to the client page, where quotes
 * and moves live. Nothing for a plain ticket.
 */
export async function RequestBanner({ ticketId, businessId }: { readonly ticketId: string; readonly businessId: string | null }): Promise<ReactElement | null> {
  const found = await getChangeWithEvents(getStaffDb(), ticketId);
  if (found === null) return null;
  return (
    <p className="mt-6 max-w-2xl text-sm">
      This is a request for a change: {stateLabel(found.change.state)}.{" "}
      {businessId === null ? null : (
        <Link href={`/clients/${businessId}#requests`} className="text-accent underline">
          Send a quote or move it along on the client page
        </Link>
      )}
    </p>
  );
}
