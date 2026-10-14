import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, type SanitizedConfig } from "payload";
import { BlogAuthors } from "./collections/BlogAuthors";
import { BlogCategories } from "./collections/BlogCategories";
import { BlogPosts } from "./collections/BlogPosts";
import { Media } from "./collections/Media";
import { Tenants } from "./collections/Tenants";
import { CMS_MIGRATION_DIR, CMS_TYPES_OUTPUT_FILE } from "./migration-dir";

export interface CmsConfigInput {
  readonly secret: string;
  readonly databaseUrl: string;
}

/**
 * Payload's config, shared by every app that reads the CMS.
 *
 * Takes its secrets as arguments rather than reading an environment. This package is imported by two apps whose
 * env shapes differ (apps/platform holds the customer connections, apps/admin deliberately does not), and a
 * package that reaches into process.env behind its callers' backs is one that breaks one of them silently.
 *
 * Uses its own database, separate from packages/db's hand-written schema and migrations, so Payload's generated
 * migrations never mix with the main app's.
 *
 * `push` is left at its default: Payload pushes the schema straight to the database in development and refuses to
 * in production, where `payload migrate` is the only way the schema changes. Without `migrationDir` pointing here,
 * production would come up against an empty database — schema push does not run there, and Payload would look for
 * migrations under the working directory and find none.
 *
 * No plugins: `@payloadcms/plugin-multi-tenant` was explored and turned out unnecessary — nobody opens Payload's
 * own admin UI, every caller is our server code using the Local API. Isolation is the plain way instead: every
 * collection carries a `businessId` and every query filters by it explicitly, derived from the authenticated
 * session or from a site API token, never from client input.
 */
export function buildCmsConfig(input: CmsConfigInput): Promise<SanitizedConfig> {
  return buildConfig({
    secret: input.secret,
    db: postgresAdapter({
      pool: { connectionString: input.databaseUrl },
      migrationDir: CMS_MIGRATION_DIR,
    }),
    editor: lexicalEditor(),
    // Payload regenerates its types whenever the CLI boots, and its default target is `payload-types.ts` in the
    // working directory. `pnpm cms:migrate` runs from apps/platform, so the default dropped a generated file into
    // that app's TypeScript scope, where it retyped every `payload.create` call and failed the build. Deploys then
    // ran the migrations before the build, so production would have been the first to notice.
    typescript: { outputFile: CMS_TYPES_OUTPUT_FILE },
    collections: [Tenants, Media, BlogCategories, BlogAuthors, BlogPosts],
    plugins: [],
  });
}
