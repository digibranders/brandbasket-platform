import "server-only";
import { z } from "zod";

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;

const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL must be a postgresql:// URL" }),
  DATABASE_URL_STAFF: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL_STAFF must be a postgresql:// URL" }),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // Normalised to the origin, so a trailing slash or a path cannot change the auth base URL or trusted origins.
  APP_ORIGIN: z
    .url({ protocol: /^https?$/, error: "APP_ORIGIN must be an absolute http:// or https:// URL" })
    .transform((value) => new URL(value).origin),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed on first use, so a build does not need these secrets. */
export function serverEnv(): ServerEnv {
  if (cached === undefined) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid server configuration. Check apps/customer/.env.local against .env.example.\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
