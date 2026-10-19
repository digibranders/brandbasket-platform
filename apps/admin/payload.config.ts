import { buildCmsConfig } from "@brandbasket/cms";
import { serverEnv } from "@/lib/server/env";

/**
 * Payload's config for the staff console. The collections and their access rules live in `@brandbasket/cms`,
 * shared with apps/platform; this file only supplies this app's own secrets.
 *
 * The admin reads Payload for one thing: the blog API token shown on a client page.
 */
export default buildCmsConfig({
  secret: serverEnv().PAYLOAD_SECRET,
  databaseUrl: serverEnv().DATABASE_URL_PAYLOAD,
});
