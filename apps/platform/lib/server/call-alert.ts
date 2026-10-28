import "server-only";
import type { CallReason } from "@brandbasket/db/call-reasons";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { callAlert } from "@/lib/calls/alert-facts";
import { SERVICE_NAMES } from "@/lib/first-look";
import { loadServicesBought } from "./first-look";
import { announceCustomerToTeams } from "./teams";

interface CallBooked {
  readonly tenant: TenantContext;
  readonly kind: "kickoff" | "call";
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The call this booking replaces, or null for a first booking. */
  readonly replaced: { readonly startsAt: Date; readonly endsAt: Date } | null;
  readonly meetingUrl: string | null;
  readonly reason?: CallReason;
  readonly note?: string | null;
}

/**
 * Tells the Customers channel a call was booked or moved, with who, when, what the plan covers, what a later call is about and
 * the meeting link. Call it after the booking is recorded. Best-effort: it never throws and the customer never waits on Teams.
 */
export async function announceCallBooked(call: CallBooked): Promise<void> {
  try {
    const services = (await loadServicesBought(call.tenant)).map((service) => SERVICE_NAMES[service]);
    const alert = callAlert({
      kind: call.kind,
      changed: call.replaced !== null,
      startsAt: call.startsAt,
      endsAt: call.endsAt,
      previousStartsAt: call.replaced?.startsAt ?? null,
      previousEndsAt: call.replaced?.endsAt ?? null,
      services,
      meetingUrl: call.meetingUrl,
      reason: call.reason ?? null,
      note: call.note ?? null,
    });
    await announceCustomerToTeams({ businessId: call.tenant.businessId, ...alert });
  } catch (error) {
    console.error("[teams-alert] A booked call could not be announced.", error instanceof Error ? error.name : "error");
  }
}
