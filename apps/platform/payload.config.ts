import { buildCmsConfig } from "@fynix/cms";
import { serverEnv } from "@/lib/server/env";

/**
 * Payload's config for this app. The collections and their access rules live in `@fynix/cms`, shared with
 * apps/admin; this file only supplies this app's own secrets.
 *
 * `serverEnv()` is safe to call here even though this file is loaded directly by Node — both real entry points
 * populate process.env first: Next.js loads apps/platform/.env.local before importing this config, and the
 * `payload` CLI calls the same `@next/env` loader.
 */
export default buildCmsConfig({
  secret: serverEnv().PAYLOAD_SECRET,
  databaseUrl: serverEnv().DATABASE_URL_PAYLOAD,
});
