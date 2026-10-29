import { eq } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { clientIntakes, type ClientIntake } from "../schema";

type Runner = Database | ScopedTransaction;

/** The answer columns a save may set: each key present is written, each key left out is kept as it was. */
export type ClientIntakeAnswers = Partial<
  Pick<ClientIntake, "businessType" | "businessSubtype" | "primaryGoal" | "websiteState" | "existingWebsiteUrl" | "primaryAction" | "designDirection" | "searchScope">
> & {
  readonly askedForServices?: readonly string[];
  readonly socialChannels?: readonly string[];
};

/** The answers as columns: the lists are copied, because the driver takes mutable arrays. */
function columns(answers: ClientIntakeAnswers): Partial<ClientIntake> {
  const { askedForServices, socialChannels, ...rest } = answers;
  return { ...rest, ...(askedForServices === undefined ? {} : { askedForServices: [...askedForServices] }), ...(socialChannels === undefined ? {} : { socialChannels: [...socialChannels] }) };
}

/** The business's answers, or null before it has given any. Read through row-level security. */
export async function findClientIntake(db: Runner, businessId: string): Promise<ClientIntake | null> {
  const [row] = await db.select().from(clientIntakes).where(eq(clientIntakes.businessId, businessId)).limit(1);
  return row ?? null;
}

/** Saves some answers, creating the row on the first one. A column not named is left alone, so one question never erases another. */
export async function saveClientIntakeAnswers(db: Runner, input: { readonly businessId: string; readonly answers: ClientIntakeAnswers; readonly now: Date }): Promise<void> {
  await db
    .insert(clientIntakes)
    .values({ businessId: input.businessId, ...columns(input.answers) })
    .onConflictDoUpdate({ target: clientIntakes.businessId, set: { ...columns(input.answers), updatedAt: input.now } });
}

/** Marks the questions done (answered or skipped) the first time it is called; later calls keep the first moment. */
export async function completeClientIntake(db: Runner, input: { readonly businessId: string; readonly now: Date }): Promise<void> {
  const [row] = await db.select({ completedAt: clientIntakes.completedAt }).from(clientIntakes).where(eq(clientIntakes.businessId, input.businessId)).limit(1);
  if (row?.completedAt != null) return;
  await db
    .insert(clientIntakes)
    .values({ businessId: input.businessId, completedAt: input.now })
    .onConflictDoUpdate({ target: clientIntakes.businessId, set: { completedAt: input.now, updatedAt: input.now } });
}
