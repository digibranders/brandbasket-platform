import { countActiveErrorIssues, deliveryHealth } from "@brandbasket/db";
import { staffCan } from "@brandbasket/shared/lib/access";
import { TEAMS_DESTINATIONS } from "@brandbasket/shared/lib/teams-webhook";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { buttonSmall } from "@/components/console/buttons";
import { FOCAL_CARD } from "@/components/console/classes";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { StatusPill } from "@/components/console/status-pill";
import { getStaffDb } from "@/lib/server/db";
import { loadGoogleStates } from "@/lib/server/google-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { loadTeamsStates } from "@/lib/server/teams-admin";
import { HEALTH_STATE_TONES, HEALTH_STATE_WORDS, healthRows, needsLookCount } from "@/lib/system-health-view";

export const metadata: Metadata = { title: "Health" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** One read that fails alone: its row says "Could not check" and the rest of the page still loads. */
async function readOrNull<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error(`[system-health] could not read ${name}`, errorLogInfo(error));
    return null;
  }
}

/** Is the machinery working: failed emails, webhooks, app errors, Google and Teams in one place. */
export default async function SystemHealthPage(): Promise<ReactElement> {
  const { staff } = await requireStaffAccess();
  const canSeeAccounts = staffCan(staff.role, "integrations");
  const db = getStaffDb();
  const since = new Date(new Date().getTime() - DAY_MS);
  const [deliveries, openErrors, google, teams] = await Promise.all([
    readOrNull("deliveries", () => deliveryHealth(db, since)),
    readOrNull("errors", () => countActiveErrorIssues(db)),
    canSeeAccounts ? readOrNull("google", loadGoogleStates) : Promise.resolve(null),
    canSeeAccounts ? readOrNull("teams", loadTeamsStates) : Promise.resolve(null),
  ]);
  const rows = healthRows({
    deliveries,
    openErrors,
    googleStatuses: google === null ? null : google.map((state) => state.connection?.status ?? null),
    teamsMissing: teams === null ? null : TEAMS_DESTINATIONS.filter((destination) => teams[destination].state !== "set").length,
    teamsKinds: TEAMS_DESTINATIONS.length,
  });
  const look = needsLookCount(rows);

  return (
    <>
      <PageHeader title="System" meta="Failed emails, webhooks, app errors, Google connections and Teams alerts in one place." />
      <SectionTabs page="/system" />
      <p role="status" className="mt-6 text-sm font-semibold tabular-nums text-ink">
        {look === 0 ? "Nothing needs a look right now." : `${look} ${look === 1 ? "thing needs" : "things need"} a look.`}
      </p>
      <section aria-label="System health" className={`${FOCAL_CARD} mt-4`}>
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{row.label}</p>
                <p className="mt-0.5 text-sm text-ink-2">{row.detail}</p>
              </div>
              <StatusPill tone={HEALTH_STATE_TONES[row.state]}>{HEALTH_STATE_WORDS[row.state]}</StatusPill>
              <Link href={row.href} className={buttonSmall}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
