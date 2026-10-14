import { buildCmsConfig } from "./src/config";

/**
 * The Payload config the `payload migrate` CLI loads (`pnpm cms:migrate`), pointed at by PAYLOAD_CONFIG_PATH.
 *
 * Separate from each app's `payload.config.ts` on purpose. Those read `serverEnv()`, which pulls in `server-only`
 * and Next's `@/` path alias — neither of which exists outside a Next build, so the CLI cannot load them. There is
 * also only one Payload database and one set of collections, so migrations belong to the workspace rather than to
 * either app; running them "from the platform" or "from the admin" would be a distinction without a difference.
 *
 * The apps keep their own configs: they need the full validated environment, and they never run migrations.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is not set. The migrate commands read it from apps/platform/.env.local; run "pnpm env:init" if you have not.`,
    );
  }
  return value;
}

export default buildCmsConfig({
  secret: required("PAYLOAD_SECRET"),
  databaseUrl: required("DATABASE_URL_PAYLOAD"),
});
