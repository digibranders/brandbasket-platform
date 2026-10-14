import { listAddOnsToContact, listClients, listLeads, listPaymentsNeedingAttention } from "@firstfold/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { countPayingClients } from "@firstfold/shared/lib/billing/client-payment";
import { firstName } from "@firstfold/shared/lib/names";
import { FocusMode, type FocusItem } from "@/components/console/focus-mode";
import { JourneyMap, stageHref } from "@/components/console/journey-map";
import { JourneyRows } from "@/components/console/journey-rows";
import { attentionBySubject, attentionItems, journeySubjects } from "@/lib/pipeline";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";

export const metadata: Metadata = { title: "Journey" };

/** Flagged payments read for the map; far more than are ever open at once, so none goes unringed. */
const FLAGGED_READ_LIMIT = 100;

/** Add-on purchases waiting for a first contact; read in full for the same reason. */
const ADD_ONS_READ_LIMIT = 100;

export default async function JourneyPage(): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const db = getStaffDb();
  const now = new Date();
  const [clients, leads, flagged, addOns] = await Promise.all([
    listClients(db),
    listLeads(db, {}),
    listPaymentsNeedingAttention(db, { limit: FLAGGED_READ_LIMIT }),
    listAddOnsToContact(db, ADD_ONS_READ_LIMIT),
  ]);

  const items = attentionItems({
    flagged,
    addOns,
    waiting: clientsWaitingOnUs(clients, now),
    newLeads: leads.filter((lead) => lead.status === "new"),
    now,
  });
  const journey = journeySubjects(clients, leads, attentionBySubject(items));
  const focusItems: FocusItem[] = items.map((item) => ({
    key: item.key,
    kind: item.kind,
    subjectId: item.subjectId,
    href: item.href,
    name: item.name,
    reason: item.reason,
    at: item.at?.toISOString() ?? null,
  }));

  return (
    <FocusMode
      items={focusItems}
      paying={countPayingClients(clients, now)}
      greeting={
        <h1 className="heading-display text-[clamp(2.4rem,5.5vw,3.5rem)] font-normal">
          Hello, <em>{firstName(user.name)}.</em>
        </h1>
      }
    >
      <JourneyMap journey={journey} />
      <JourneyRows journey={journey} />
      {journey.paused === 0 ? null : (
        <p className="mt-6 text-sm tabular-nums text-ink-soft">
          <Link href={stageHref("paused")} className="link-underline">
            Paused · {journey.paused}
          </Link>
        </p>
      )}
    </FocusMode>
  );
}
