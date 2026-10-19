import "server-only";
import { countUnseenBookings, listEnabledModules, withTenantScope, type BusinessModule } from "@brandbasket/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireCustomerAccess } from "./customer-access";
import { getAppDb } from "./db";

/** The optional modules switched on for the signed-in customer's own business, read once per request through the
 * tenant-scoped app connection: the nav and every module-gated page share this result. */
export const getEnabledModules = cache(async (): Promise<readonly BusinessModule[]> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, (tx) => listEnabledModules(tx, tenant.businessId));
});

/** Call at the top of every Appointments page: 404s the same way a page for an id that doesn't exist would, so a
 * business without the module sees nothing different from a page that was never there. */
export async function requireAppointmentsModule(): Promise<void> {
  const modules = await getEnabledModules();
  if (!modules.includes("appointments")) notFound();
}

/** How many booked appointments the clinic dashboard has never shown yet, for the nav badge -- "new" is tracked
 * per booking (`seen_at`, stamped by `markAppointmentSeen` the moment its own details panel is opened), not by a
 * single last-visit timestamp, so this reflects reality even mid-visit: opening one booking's details lowers this
 * by exactly one, the next time anything reads it. Skips the count query entirely when the module is off, so a
 * business without Appointments never pays for it. */
export const getNewAppointmentCount = cache(async (): Promise<number> => {
  const modules = await getEnabledModules();
  if (!modules.includes("appointments")) return 0;

  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, (tx) => countUnseenBookings(tx));
});
