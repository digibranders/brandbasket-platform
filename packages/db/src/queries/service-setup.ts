import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { serviceSetup, type ServiceSetup, type SetupService } from "../schema";

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
