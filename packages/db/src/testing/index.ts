import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabase, type DatabaseHandle } from "../client";
import { loadLocalEnv, requireEnv } from "../local-env";

export interface TestDatabases {
  readonly app: DatabaseHandle;
  /** The insert-only connection the public marketing form uses. */
  readonly publicRole: DatabaseHandle;
  readonly staff: DatabaseHandle;
  readonly owner: DatabaseHandle;
  readonly closeAll: () => Promise<void>;
}

function parseConnectionUrl(connectionString: string): URL {
  try {
    return new URL(connectionString);
  } catch {
    throw new Error(
      "A test database URL in apps/platform/.env.local is not a valid URL (value hidden because it may contain a password).",
    );
  }
}

/** Truncation is destructive, so refuse any URL that could reach something other than a *_test database. */
export function testDatabaseName(connectionString: string): string {
  const url = parseConnectionUrl(connectionString);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Refusing a test database URL that is not postgres:// or postgresql://.");
  }
  if (url.searchParams.has("host")) {
    throw new Error("Refusing a test database URL with a host query parameter: it can redirect the connection.");
  }
  const database = url.pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to use "${database}" for tests: the database name must end with "_test".`);
  }
  return database;
}

export function openTestDatabases(): TestDatabases {
  loadLocalEnv();
  const appUrl = requireEnv("DATABASE_URL_TEST");
  const staffUrl = requireEnv("DATABASE_URL_STAFF_TEST");
  const ownerUrl = requireEnv("DATABASE_URL_OWNER_TEST");
  const publicUrl = requireEnv("DATABASE_URL_PUBLIC_TEST");

  const appName = testDatabaseName(appUrl);
  const staffName = testDatabaseName(staffUrl);
  const ownerName = testDatabaseName(ownerUrl);
  const publicName = testDatabaseName(publicUrl);
  if (appName !== staffName || appName !== ownerName || appName !== publicName) {
    throw new Error(
      `Every test database URL must name the same database, found: ${appName}, ${staffName}, ${ownerName}, ${publicName}`,
    );
  }

  const app = createDatabase(appUrl);
  const staff = createDatabase(staffUrl);
  const owner = createDatabase(ownerUrl, { max: 1 });
  const publicRole = createDatabase(publicUrl, { max: 2 });

  return {
    app,
    publicRole,
    staff,
    owner,
    closeAll: async () => {
      await Promise.all([app.close(), publicRole.close(), staff.close(), owner.close()]);
    },
  };
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Empties every table in the public schema of a *_test database. Tables added by later migrations are included. */
export async function resetTestDatabase(owner: DatabaseHandle): Promise<void> {
  const current = await owner.db.execute<{ name: string }>(sql`select current_database() as name`);
  const name = current.rows[0]?.name ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to truncate "${name}": it is not a *_test database.`);
  }
  const tables = await owner.db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  if (tables.rows.length === 0) return;
  const list = tables.rows.map((row) => `public.${quoteIdentifier(row.tablename)}`).join(", ");
  await owner.db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}

const MAX_CAUSE_DEPTH = 10;

/** Drizzle wraps driver errors; this joins the cause chain so tests can match the Postgres message. */
export function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) return String(error);
  if (error.cause === undefined || depth >= MAX_CAUSE_DEPTH) return error.message;
  return `${error.message}\n${describeError(error.cause, depth + 1)}`;
}

export async function captureErrorText(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the operation to fail, but it succeeded.");
}

/** The migration that replaced Fynix's Care and Premium rows with Managed Website, the only plan on sale. */
const MANAGED_PLAN_MIGRATION = new URL("../../migrations/0180_managed_plan.sql", import.meta.url);

/** One statement out of a migration file, found by what it contains, so tests run exactly what ships. */
async function statementFrom(migrationUrl: URL, marker: string): Promise<string> {
  const migration = await readFile(migrationUrl, "utf8");
  const statement = migration.split("--> statement-breakpoint").find((part) => part.includes(marker));
  if (statement === undefined) throw new Error(`${migrationUrl.pathname} no longer contains "${marker}".`);
  return statement;
}

/** resetTestDatabase empties every table, the seeded plan included. This re-applies the Managed Website INSERT from 0180. */
export async function seedPlansFromMigrations(owner: DatabaseHandle): Promise<void> {
  await owner.db.execute(sql.raw(await statementFrom(MANAGED_PLAN_MIGRATION, 'INSERT INTO "plans"')));
}

/**
 * Runs one statement on the owner connection, for tests in packages that do not carry the query builder (shared's
 * integration tests arrange state with it). The statement is test code, never built from input.
 */
export async function execSql(owner: DatabaseHandle, statement: string): Promise<void> {
  await owner.db.execute(sql.raw(statement));
}

/** Runs one SELECT on the owner connection and returns its rows. */
export async function querySql<Row extends Record<string, unknown>>(owner: DatabaseHandle, statement: string): Promise<Row[]> {
  const result = await owner.db.execute<Row>(sql.raw(statement));
  return result.rows as Row[];
}
