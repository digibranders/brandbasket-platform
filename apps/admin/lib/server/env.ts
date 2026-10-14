import "server-only";
import { z } from "zod";

const POSTGRES_PROTOCOL = /^postgresql?$/;

/**
 * The staff console's environment.
 *
 * Deliberately narrower than the platform's. There is no `DATABASE_URL` (the customer's row-level-security-bound
 * connection) and no `DATABASE_URL_PUBLIC` (insert-only, for the marketing lead form): the admin has no reason to
 * hold either, and a connection an app never needs is a connection that can only ever be a liability.
 */
const serverEnvSchema = z.object({
  DATABASE_URL_STAFF: z.url({
    protocol: POSTGRES_PROTOCOL,
    error: "DATABASE_URL_STAFF must be a postgresql:// URL",
  }),
  DATABASE_URL_PAYLOAD: z.url({
    protocol: POSTGRES_PROTOCOL,
    error: "DATABASE_URL_PAYLOAD must be a postgresql:// URL",
  }),
  PAYLOAD_SECRET: z.string().min(32, "PAYLOAD_SECRET must be at least 32 characters"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  ADMIN_ORIGIN: z.url({
    protocol: /^https?$/,
    error: "ADMIN_ORIGIN must be an absolute http:// or https:// URL",
  }),
  /** The customer app's URL. Setup links staff send point there, not here. */
  APP_ORIGIN: z.url({
    protocol: /^https?$/,
    error: "APP_ORIGIN must be an absolute http:// or https:// URL",
  }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached === undefined) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid server configuration. Check apps/admin/.env.local.\n${z.prettifyError(parsed.error)}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}
