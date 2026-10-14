import "server-only";
import { createDatabase, type Database } from "@firstfold/db";
import { z } from "zod";

// Kept on globalThis so hot reloads reuse the pool instead of opening new ones.
const holder = globalThis as typeof globalThis & { firstfoldPublicDb?: Database };

const publicEnvSchema = z.object({
  DATABASE_URL_PUBLIC: z.url({ protocol: /^postgres(ql)?$/ }),
});

/**
 * The lead intake connection. The firstfold_public role may only insert leads, rate-limit rows and outbox
 * messages, so a mistake in the public enquiry path (POST /api/leads) cannot read customer data.
 */
export function getPublicDb(): Database {
  if (holder.firstfoldPublicDb === undefined) {
    const parsed = publicEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("DATABASE_URL_PUBLIC is missing or not a postgres URL. Add it to apps/platform/.env.local.");
    }
    holder.firstfoldPublicDb = createDatabase(parsed.data.DATABASE_URL_PUBLIC, { max: 5 }).db;
  }
  return holder.firstfoldPublicDb;
}
