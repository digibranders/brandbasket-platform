import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadLocalEnv, requireEnv } from "./local-env";
import { runMigrations } from "./migrator";

interface FixtureMigration {
  readonly tag: string;
  readonly statements: readonly string[];
}

/** Writes migrations in drizzle-kit's on-disk format: meta/_journal.json and one .sql file per tag. */
function writeMigrations(folder: string, migrations: readonly FixtureMigration[]): void {
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  const entries = migrations.map((migration, idx) => ({
    idx,
    version: "7",
    when: 1_000 + idx * 1_000,
    tag: migration.tag,
    breakpoints: true,
  }));
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
  for (const migration of migrations) {
    writeFileSync(path.join(folder, `${migration.tag}.sql`), migration.statements.join("\n--> statement-breakpoint\n"));
  }
}

/**
 * The shape of 0017_manual_payments followed by 0020_payment_audit_and_attention, in miniature: one migration adds
 * an enum value, a later one uses it in both a constraint and a row. Postgres refuses to use an enum value inside
 * the transaction that added it (55P04), so this only succeeds if each migration commits separately.
 */
const ENUM_VALUE_THEN_USE: readonly FixtureMigration[] = [
  {
    tag: "0000_create",
    statements: [
      `CREATE TYPE "provider" AS ENUM ('card');`,
      `CREATE TABLE "payments" ("id" serial PRIMARY KEY, "provider" "provider" NOT NULL);`,
      `INSERT INTO "payments" ("provider") VALUES ('card');`,
    ],
  },
  { tag: "0001_add_value", statements: [`ALTER TYPE "provider" ADD VALUE 'manual';`] },
  {
    tag: "0002_use_value",
    statements: [
      `ALTER TABLE "payments" ADD CONSTRAINT "payments_manual_check" CHECK ("provider" <> 'manual' OR "id" > 0);`,
      `INSERT INTO "payments" ("provider") VALUES ('manual');`,
    ],
  },
];

let adminUrl = "";
let databaseName = "";
let folder = "";
let pool: Pool;

async function admin(statement: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

async function rows<T>(query: string): Promise<T[]> {
  return (await pool.query(query)).rows as T[];
}

async function tableExists(name: string): Promise<boolean> {
  const result = await pool.query("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${name}`]);
  return (result.rows[0] as { exists: boolean }).exists;
}

beforeAll(() => {
  loadLocalEnv();
  // Each test needs a database that has never been migrated — the whole point — so it creates its own from the
  // owner connection, rather than sharing the already-migrated test database the other integration tests use.
  const url = new URL(requireEnv("DATABASE_URL_OWNER_TEST"));
  url.pathname = "/postgres";
  adminUrl = url.toString();
});

beforeEach(async () => {
  databaseName = `bb_migrator_${randomBytes(6).toString("hex")}`;
  await admin(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: url.toString(), max: 1 });
  folder = mkdtempSync(path.join(tmpdir(), "brandbasket-migrations-"));
}, 60_000);

afterEach(async () => {
  await pool.end();
  await admin(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  rmSync(folder, { recursive: true, force: true });
}, 60_000);

describe("runMigrations", () => {
  it("applies a migration that uses an enum value added by an earlier pending migration", async () => {
    writeMigrations(folder, ENUM_VALUE_THEN_USE);

    await runMigrations(pool, folder);

    expect(await rows<{ provider: string }>(`SELECT "provider" FROM "payments" ORDER BY "id"`)).toEqual([
      { provider: "card" },
      { provider: "manual" },
    ]);
  });

  it("records each migration exactly as Drizzle does, so Drizzle's own migrator finds nothing left to do", async () => {
    writeMigrations(folder, ENUM_VALUE_THEN_USE);

    await runMigrations(pool, folder);
    await drizzleMigrate(drizzle({ client: pool }), { migrationsFolder: folder });

    const recorded = await rows<{ created_at: string }>(
      `SELECT "created_at" FROM "drizzle"."__drizzle_migrations" ORDER BY "created_at"`,
    );
    expect(recorded.map((row) => Number(row.created_at))).toEqual([1_000, 2_000, 3_000]);
    expect(await rows(`SELECT "provider" FROM "payments"`)).toHaveLength(2);
  });

  /**
   * Every database that exists today — development, the test database, the droplet — was migrated by Drizzle's
   * own migrator. The replacement has to pick up exactly where that left off.
   */
  it("continues a database that Drizzle's own migrator started, applying only what is newer", async () => {
    writeMigrations(folder, ENUM_VALUE_THEN_USE.slice(0, 1));
    await drizzleMigrate(drizzle({ client: pool }), { migrationsFolder: folder });

    writeMigrations(folder, ENUM_VALUE_THEN_USE);
    await runMigrations(pool, folder);

    expect(await rows(`SELECT 1 FROM "drizzle"."__drizzle_migrations"`)).toHaveLength(3);
    expect(await rows<{ provider: string }>(`SELECT "provider" FROM "payments" ORDER BY "id"`)).toEqual([
      { provider: "card" },
      { provider: "manual" },
    ]);
  });

  it("stops at a failing migration: keeps what came before, undoes all of it, and runs nothing after", async () => {
    writeMigrations(folder, [
      { tag: "0000_ok", statements: [`CREATE TABLE "before" ("id" int);`] },
      { tag: "0001_broken", statements: [`CREATE TABLE "half" ("id" int);`, `SELECT * FROM "does_not_exist";`] },
      { tag: "0002_never", statements: [`CREATE TABLE "after" ("id" int);`] },
    ]);

    await expect(runMigrations(pool, folder)).rejects.toThrow(/0001_broken/);

    expect(await tableExists("before")).toBe(true);
    expect(await tableExists("half")).toBe(false);
    expect(await tableExists("after")).toBe(false);
    expect(await rows(`SELECT 1 FROM "drizzle"."__drizzle_migrations"`)).toHaveLength(1);
  });
});
