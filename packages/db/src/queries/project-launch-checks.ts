import { and, asc, eq } from "drizzle-orm";
import { projectLaunchChecks } from "../schema";
import type { Runner } from "./projects";

/** The checks staff tick by hand before a project goes live, in the order the console shows them. */
export const LAUNCH_CHECK_KEYS = [
  "approved_version_identified",
  "production_deployment",
  "hostname_configured",
  "dns_and_https",
  "key_pages_load",
  "mobile_checked",
  "contact_paths_work",
  "customer_informed",
] as const;

export type LaunchCheckKey = (typeof LAUNCH_CHECK_KEYS)[number];

function isLaunchCheckKey(value: string): value is LaunchCheckKey {
  return (LAUNCH_CHECK_KEYS as readonly string[]).includes(value);
}

/**
 * Ticks or unticks one launch check. A check is a row: ticking inserts it (a tick already there keeps its first staff member
 * and time), unticking deletes it.
 */
export async function setLaunchCheck(
  db: Runner,
  input: {
    readonly projectId: string;
    readonly businessId: string;
    readonly key: LaunchCheckKey;
    readonly staffId: string;
    readonly checked: boolean;
    readonly now: Date;
  },
): Promise<void> {
  if (input.checked) {
    await db
      .insert(projectLaunchChecks)
      .values({
        projectId: input.projectId,
        businessId: input.businessId,
        checkKey: input.key,
        checkedByStaffId: input.staffId,
        checkedAt: input.now,
      })
      .onConflictDoNothing({ target: [projectLaunchChecks.projectId, projectLaunchChecks.checkKey] });
    return;
  }
  await db
    .delete(projectLaunchChecks)
    .where(
      and(
        eq(projectLaunchChecks.projectId, input.projectId),
        eq(projectLaunchChecks.businessId, input.businessId),
        eq(projectLaunchChecks.checkKey, input.key),
      ),
    );
}

/** The checks ticked on one project, oldest first. Scoped by the business as well as the project. Keys this build does not list are left out. */
export async function listLaunchChecks(
  db: Runner,
  input: { readonly projectId: string; readonly businessId: string },
): Promise<readonly { readonly key: LaunchCheckKey; readonly checkedByStaffId: string; readonly checkedAt: Date }[]> {
  const rows = await db
    .select({
      key: projectLaunchChecks.checkKey,
      checkedByStaffId: projectLaunchChecks.checkedByStaffId,
      checkedAt: projectLaunchChecks.checkedAt,
    })
    .from(projectLaunchChecks)
    .where(and(eq(projectLaunchChecks.projectId, input.projectId), eq(projectLaunchChecks.businessId, input.businessId)))
    .orderBy(asc(projectLaunchChecks.checkedAt), asc(projectLaunchChecks.checkKey));
  return rows.flatMap((row) => (isLaunchCheckKey(row.key) ? [{ key: row.key, checkedByStaffId: row.checkedByStaffId, checkedAt: row.checkedAt }] : []));
}

/** The checks not yet ticked, in the order the console shows them. Pure: the caller passes the keys already ticked. */
export function missingLaunchChecks(done: readonly LaunchCheckKey[]): readonly LaunchCheckKey[] {
  return LAUNCH_CHECK_KEYS.filter((key) => !done.includes(key));
}
