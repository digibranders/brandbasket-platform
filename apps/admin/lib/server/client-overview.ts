import "server-only";
import {
  findOpenClosureForBusiness,
  findSetupCallBooking,
  listAddOnsToContact,
  listLiveServiceLines,
  listOpenPrivacyRequests,
  listPaymentsNeedingAttention,
  type ClientDetail,
} from "@brandbasket/db";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { addOnById, isMonthlyAddOnId, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { clientExceptions, type ExceptionResult, type Read } from "@/lib/client-exceptions";
import type { ServiceToSetUp } from "@/lib/client-next-step";
import { serviceStatuses, type ServiceStatus } from "@/lib/client-services";
import { previewLateReason } from "@/lib/client-next-step";
import { getStaffDb } from "./db";

/** Purchases waiting for a follow up are read across businesses and filtered here; far more than are ever open at once. */
const TO_CONTACT_READ_LIMIT = 200;
const FLAGGED_READ_LIMIT = 50;

/** Runs one read. A failure is logged and returned as `{ ok: false }`, never as an empty result. */
export async function readOnce<T>(name: string, read: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    console.error("[client-overview] a read failed", { read: name, ...errorLogInfo(error) });
    return { ok: false };
  }
}

/**
 * The reads behind the Overview's exceptions strip, Next step card and service cards, each isolated so one failure cannot
 * blank the page or be mistaken for "nothing wrong". The booking is returned as a read too, for the customer mirror.
 */
export async function loadOverviewReads(input: { readonly client: ClientDetail; readonly now: Date; readonly seesMoney: boolean }): Promise<{
  readonly booking: Read<Awaited<ReturnType<typeof findSetupCallBooking>>>;
  readonly exceptions: ExceptionResult;
  readonly services: Read<readonly ServiceStatus[]>;
  readonly toSetUp: Read<readonly ServiceToSetUp[]>;
}> {
  const { client, now } = input;
  const db = getStaffDb();
  const ownerId = client.owner?.userId ?? null;
  const [booking, flagged, closure, privacy, lines, toContact] = await Promise.all([
    readOnce("booking", () => findSetupCallBooking(db, client.businessId)),
    input.seesMoney ? readOnce("flagged-payments", async () => (await listPaymentsNeedingAttention(db, { businessId: client.businessId, limit: FLAGGED_READ_LIMIT })).length) : Promise.resolve(null),
    readOnce("closure", () => findOpenClosureForBusiness(db, client.businessId)),
    // A privacy request names the person, not the business: it belongs to this client when it came from the owner's account.
    readOnce("privacy-requests", async () => {
      const open = ownerId === null ? [] : (await listOpenPrivacyRequests(db)).filter((request) => request.subjectUserId === ownerId);
      const soonest = open.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
      return soonest === undefined ? null : { dueAt: soonest.dueAt };
    }),
    readOnce("service-lines", () => listLiveServiceLines(db, [client.businessId])),
    readOnce("services-to-contact", () => listAddOnsToContact(db, TO_CONTACT_READ_LIMIT)),
  ]);

  const exceptions = clientExceptions({
    now,
    businessName: client.businessName,
    project: client.project,
    movingTo: client.movingTo,
    domainStatus: client.domain?.status ?? null,
    subscriptionStatus: client.billing.subscription?.status ?? null,
    lapsed: clientPaymentState(client.billing, now).kind === "lapsed",
    booking,
    flaggedPayments: flagged,
    closure: closure.ok ? { ok: true, value: closure.value === null ? null : { eraseAfter: closure.value.eraseAfter } } : closure,
    privacy,
  });

  const setUpIds: ReadonlySet<MonthlyAddOnId> | null = toContact.ok
    ? new Set(toContact.value.flatMap((purchase) => (purchase.businessId === client.businessId && isMonthlyAddOnId(purchase.addOn) ? [purchase.addOn] : [])))
    : null;
  const toSetUp: Read<readonly ServiceToSetUp[]> = setUpIds === null ? { ok: false } : { ok: true, value: [...setUpIds].map((id) => ({ id, title: addOnById(id).title })) };

  const services: Read<readonly ServiceStatus[]> =
    !lines.ok || setUpIds === null
      ? { ok: false }
      : {
          ok: true,
          value: serviceStatuses({
            // A standalone add-on subscription has no bundled line, so a paid one still to follow up counts as a live line.
            lines: [...lines.value, ...[...setUpIds].filter((id) => !lines.value.some((line) => line.addOn === id)).map((addOn) => ({ addOn, status: "active" as const }))],
            project: client.project,
            websiteLate: previewLateReason(client.project, now) !== null,
            toSetUp: setUpIds,
          }),
        };

  return { booking, exceptions, services, toSetUp };
}
