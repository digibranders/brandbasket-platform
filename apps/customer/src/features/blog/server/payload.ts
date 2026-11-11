import "server-only";
import { buildCmsConfig } from "@brandbasket/cms";
import { getPayload, type Payload } from "payload";
import { z } from "zod";

/*
 * Payload's Local API for the blog, from the same `@brandbasket/cms` config apps/platform uses, so both apps read and write
 * one CMS database. Collections deny every REST request; every call here passes `overrideAccess: true` and filters by the
 * session's business itself. The CMS secrets are read here rather than in src/lib/env.ts so the app runs without them until
 * a blog page is opened.
 */

const cmsEnvSchema = z.object({
  DATABASE_URL_PAYLOAD: z.url({ protocol: /^postgres(ql)?$/, error: "DATABASE_URL_PAYLOAD must be a postgresql:// URL" }),
  PAYLOAD_SECRET: z.string().min(32, "PAYLOAD_SECRET must be at least 32 characters"),
});

let config: ReturnType<typeof buildCmsConfig> | undefined;

function cmsConfig(): ReturnType<typeof buildCmsConfig> {
  if (config === undefined) {
    const parsed = cmsEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid blog configuration. Add the CMS settings to apps/customer/.env.local.\n${z.prettifyError(parsed.error)}`);
    }
    config = buildCmsConfig({ secret: parsed.data.PAYLOAD_SECRET, databaseUrl: parsed.data.DATABASE_URL_PAYLOAD });
  }
  return config;
}

/** The shared Payload instance (Payload caches it per process). */
export function getBlogPayload(): Promise<Payload> {
  return getPayload({ config: cmsConfig() });
}
