import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { runMigrations } from "../src/migrator";
import { APPLICATION_ROLES } from "../src/roles";

const TARGET_CONNECTIONS = {
  dev: "DATABASE_URL_OWNER",
  test: "DATABASE_URL_OWNER_TEST",
} as const;

type Target = keyof typeof TARGET_CONNECTIONS;

function isTarget(value: string): value is Target {
  return Object.hasOwn(TARGET_CONNECTIONS, value);
}

const { values } = parseArgs({ options: { target: { type: "string" } } });
const target = values.target;
if (target === undefined || !isTarget(target)) {
  throw new Error(`--target must be "dev" or "test", received ${JSON.stringify(target)}`);
}

loadLocalEnv();

const pool = new Pool({ connectionString: requireEnv(TARGET_CONNECTIONS[target]), max: 1 });
try {
  // Migrations grant privileges to the application roles, so they must exist first.
  const requiredRoles: readonly string[] = APPLICATION_ROLES.map((role) => role.name);
  const found = await pool.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [
    requiredRoles,
  ]);
  const missingRoles = requiredRoles.filter((name) => !found.rows.some((row) => row.rolname === name));
  if (missingRoles.length > 0) {
    throw new Error(`Missing database roles: ${missingRoles.join(", ")}. Run "pnpm db:roles" before migrating.`);
  }

  // Not drizzle-orm's migrate(): it applies every pending migration in one transaction, which a fresh database
  // cannot survive. See src/migrator.ts.
  await runMigrations(pool, fileURLToPath(new URL("../migrations", import.meta.url)));
  console.log(`Migrations applied to the ${target} database.`);
} finally {
  await pool.end();
}
