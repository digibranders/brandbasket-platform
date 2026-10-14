import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where Payload's generated migrations live: `packages/cms/src/migrations`, beside the collections they migrate.
 *
 * Absolute, and resolved from this module's own location rather than `process.cwd()`. Payload's default would look
 * for `src/migrations` under whatever directory the command happened to run from, which in this workspace means a
 * different answer for every app — and both apps open the *same* Payload database, so there is only one correct
 * set of migrations. The same mistake, resolving a shared path from the caller's working directory, is what broke
 * media storage after the apps were split.
 *
 * Only the `payload migrate` CLI reads this, and that runs from the repository source. Nothing calls
 * `payload.db.migrate()` at runtime, so a bundled server never needs this path to be meaningful.
 */
export const CMS_MIGRATION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Where Payload writes its generated types. Kept inside this package and out of every app's tsconfig `include`,
 * so booting the CLI cannot change how application code type-checks. Nothing imports it; it is a build artefact.
 */
export const CMS_TYPES_OUTPUT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "payload-types.ts",
);
