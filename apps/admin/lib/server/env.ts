import "server-only";
import { z } from "zod";
import { clientSiteBaseDomain } from "@brandbasket/shared/lib/onboarding/domain-form";

const POSTGRES_PROTOCOL = /^postgresql?$/;

/** Checked by the same rule as the platform (clientSiteBaseDomain), so both apps agree on what is a valid domain. */
const optionalClientSiteBaseDomain = z
  .string()
  .optional()
  .refine(
    (value) => {
      try {
        clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: value });
        return true;
      } catch {
        return false;
      }
    },
    { error: "CLIENT_SITE_BASE_DOMAIN must be a domain such as sites.example.com" },
  );

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
  /** The domain free addresses are made on (<name>.<this>). Optional: unset, no free address is offered. */
  CLIENT_SITE_BASE_DOMAIN: optionalClientSiteBaseDomain,
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
