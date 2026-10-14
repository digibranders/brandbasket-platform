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

const PLAN_SEED_MIGRATION = new URL("../../migrations/0009_billing.sql", import.meta.url);
/** Every later migration that changes a seeded plan's price, in the order they run. */
const PLAN_PRICE_MIGRATIONS: readonly URL[] = [
  new URL("../../migrations/0012_inr_one_month_plan.sql", import.meta.url),
  new URL("../../migrations/0021_usd_monthly_plan.sql", import.meta.url),
  new URL("../../migrations/0023_inr_3500_plan.sql", import.meta.url),
  new URL("../../migrations/0026_hourly_changes_and_blog_blocks.sql", import.meta.url),
];

/**
 * Price changes that add plan rows rather than editing them (see 0039 for why), run whole: every statement in the
 * file, in order. Each retires the plans on sale and inserts the new ones.
 */
const PLAN_REPLACEMENT_MIGRATIONS: readonly URL[] = [
  new URL("../../migrations/0039_plans_69_and_2999.sql", import.meta.url),
];

/** 0098 adds the Care plan; its data statements are replayed on top of the schema the tests already run on. */
const CARE_PLAN_MIGRATION = new URL("../../migrations/0098_care_plan_tier.sql", import.meta.url);

/** 0110 puts Premium on sale at ₹6,999 as a new plan version; the whole file is replayed, statement by statement. */
const PREMIUM_PRICE_MIGRATION = new URL("../../migrations/0110_premium_price_6999.sql", import.meta.url);

/** 0164 does the same at ₹9,999, on top of 0110. */
const PREMIUM_PRICE_9999_MIGRATION = new URL("../../migrations/0164_premium_price_9999.sql", import.meta.url);

/** Every statement in a migration file, in order, skipping the comment-only fragments between breakpoints. */
async function statementsFrom(migrationUrl: URL): Promise<string[]> {
  const migration = await readFile(migrationUrl, "utf8");
  return migration
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter((part) => part.split("\n").some((line) => line.trim() !== "" && !line.trim().startsWith("--")));
}

/** One statement out of a migration file, found by what it contains, so tests run exactly what ships. */
async function statementFrom(migrationUrl: URL, marker: string): Promise<string> {
  const migration = await readFile(migrationUrl, "utf8");
  const statement = migration.split("--> statement-breakpoint").find((part) => part.includes(marker));
  if (statement === undefined) throw new Error(`${migrationUrl.pathname} no longer contains "${marker}".`);
  return statement;
}

/**
 * resetTestDatabase empties every table, the seeded plans included. This re-applies the plan INSERT from 0009,
 * then each later in-place price change (0012, 0023 and 0026 for INR, 0021 for USD), then 0039, which retires those
 * plans and adds the $69 and ₹2,999-plus-GST ones, then 0098, which names those Premium and adds the Care plan, in
 * migration order, then 0110 and 0164, which put Premium on sale at ₹6,999 and then ₹9,999 as new versions, so tests check
 * the prices that actually ship. `withPremiumPrice: false` stops short of 0110, for a test that needs Premium as it was before it.
 * The retired plans are still there, as they are in every real database, for tests about subscriptions sold on them.
 */
export async function seedPlansFromMigrations(owner: DatabaseHandle, options: { readonly withPremiumPrice?: boolean } = {}): Promise<void> {
  await owner.db.execute(sql.raw(await statementFrom(PLAN_SEED_MIGRATION, "INSERT INTO plans")));
  for (const migration of PLAN_PRICE_MIGRATIONS) {
    await owner.db.execute(sql.raw(await statementFrom(migration, "UPDATE plans")));
  }
  for (const migration of PLAN_REPLACEMENT_MIGRATIONS) {
    for (const statement of await statementsFrom(migration)) await owner.db.execute(sql.raw(statement));
  }
  // Last, as in a real database: Premium's plans are renamed and the Care plan is added beside them.
  for (const marker of ['UPDATE "plans"', 'INSERT INTO "plans"']) {
    await owner.db.execute(sql.raw(await statementFrom(CARE_PLAN_MIGRATION, marker)));
  }
  if (options.withPremiumPrice !== false) {
    await applyPremiumPriceMigration(owner);
    await applyPremiumPrice9999Migration(owner);
  }
}

/** Runs 0164, Premium at ₹9,999, on a database that has had 0110. */
export async function applyPremiumPrice9999Migration(owner: DatabaseHandle): Promise<void> {
  for (const statement of await statementsFrom(PREMIUM_PRICE_9999_MIGRATION)) await owner.db.execute(sql.raw(statement));
}

/** Runs 0110, Premium at ₹6,999, on a database that has the plans from before it. */
export async function applyPremiumPriceMigration(owner: DatabaseHandle): Promise<void> {
  for (const statement of await statementsFrom(PREMIUM_PRICE_MIGRATION)) await owner.db.execute(sql.raw(statement));
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
