import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { serviceSetup, type AddOnSubscription, type BundledAddOn, type ServiceSetup, type SetupService } from "../schema";
import { listAddOnSubscriptionsForBusiness } from "./add-ons";
import { listBundledAddOnsForBusiness } from "./bundled-add-ons";

type Runner = Database | ScopedTransaction;

/** The business's saved answers, one row per service it has saved something for. Read through row-level security. */
export async function listServiceSetups(db: Runner, businessId: string): Promise<ServiceSetup[]> {
  return db.select().from(serviceSetup).where(eq(serviceSetup.businessId, businessId));
}

/** Saves some answers for a service, merging into what is there so one item never erases another. */
export async function saveServiceSetup(
  db: Runner,
  input: { readonly businessId: string; readonly service: SetupService; readonly answers: Readonly<Record<string, unknown>>; readonly now: Date },
): Promise<void> {
  const patch = JSON.stringify(input.answers);
  await db
    .insert(serviceSetup)
    .values({ businessId: input.businessId, service: input.service, answers: input.answers as Record<string, unknown> })
    .onConflictDoUpdate({
      target: [serviceSetup.businessId, serviceSetup.service],
      set: { answers: sql`${serviceSetup.answers} || ${patch}::jsonb`, updatedAt: input.now },
    });
}

const SERVICE_OF_ADD_ON: Readonly<Record<string, SetupService>> = { "digital-growth": "social", "local-seo-aeo": "search" };
const SERVICE_ORDER: readonly SetupService[] = ["social", "search"];
const PAID_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "scheduled", "past_due"];

/** Which of Social & Ads and Search the business has bought, from its add-ons taken with the plan and those bought later. */
export function boughtSetupServicesFrom(
  bundled: readonly Pick<BundledAddOn, "addOn" | "status" | "endRequestedAt">[],
  subscriptions: readonly Pick<AddOnSubscription, "addOn" | "status">[],
): SetupService[] {
  const bought = new Set<SetupService>();
  for (const row of bundled) {
    const service = SERVICE_OF_ADD_ON[row.addOn];
    if (service !== undefined && (row.status === "pending" || row.status === "active") && row.endRequestedAt === null) bought.add(service);
  }
  for (const row of subscriptions) {
    const service = SERVICE_OF_ADD_ON[row.addOn];
    if (service !== undefined && PAID_SUBSCRIPTION_STATUSES.includes(row.status)) bought.add(service);
  }
  return SERVICE_ORDER.filter((service) => bought.has(service));
}

/**
 * The services the business has bought, in the order Social then Search: the one rule behind the customer's To do and
 * Overview pages and the console's numbers form. Both reads are plain selects the customer role may run on its own
 * business, so this works on the customer connection (inside withTenantScope) and the staff connection.
 */
export async function listBoughtSetupServices(db: Runner, businessId: string): Promise<SetupService[]> {
  const [bundled, subscriptions] = await Promise.all([listBundledAddOnsForBusiness(db, businessId), listAddOnSubscriptionsForBusiness(db, businessId)]);
  return boughtSetupServicesFrom(bundled, subscriptions);
}
