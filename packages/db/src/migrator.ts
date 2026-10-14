import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Pool, PoolClient } from "pg";

/** Drizzle's own bookkeeping location. Every database migrated so far has its history here, so it cannot move. */
const MIGRATIONS_SCHEMA = '"drizzle"';
const MIGRATIONS_TABLE = `${MIGRATIONS_SCHEMA}."__drizzle_migrations"`;

/** A migration failed. It was rolled back on its own; every migration before it stays applied. */
export class MigrationFailedError extends Error {
  constructor(
    readonly migration: string,
    options: { readonly cause: unknown },
  ) {
    const reason = options.cause instanceof Error ? options.cause.message : String(options.cause);
    super(`Migration ${migration} failed and was rolled back; nothing after it was applied. ${reason}`, options);
    this.name = "MigrationFailedError";
  }
}

/** The migration names, in order, from drizzle-kit's journal — Drizzle's own reader discards them. */
function readMigrationTags(migrationsFolder: string): readonly string[] {
  const journal: unknown = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
  const entries = (journal as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw new Error(`${migrationsFolder}/meta/_journal.json has no entries list.`);
  return entries.map((entry: unknown, index) => {
    const tag = (entry as { tag?: unknown }).tag;
    if (typeof tag !== "string") throw new Error(`Journal entry ${index} in ${migrationsFolder} has no tag.`);
    return tag;
  });
}

async function applyOne(client: PoolClient, statements: readonly string[], hash: string, createdAt: number): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const statement of statements) await client.query(statement);
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES ($1, $2)`, [hash, createdAt]);
    await client.query("COMMIT");
  } catch (error) {
    // A connection that has lost the transaction cannot roll back; the original error is the one worth reporting.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

/**
 * Applies pending migrations exactly as drizzle-orm's migrator does — the same files, the same bookkeeping table and
 * hashes, the same "newer than the last applied migration" rule — except that **each migration commits on its own**.
 *
 * Drizzle runs every pending migration inside one transaction. Postgres refuses to use an enum value in the same
 * transaction that added it (55P04), so a database migrated from scratch could never get past
 * 0017_manual_payments (which adds `'manual'` to `billing_provider`) followed by 0020 (which uses it). Nobody saw it,
 * because every existing database received those two migrations on different days; the first fresh database, on the
 * production droplet, was also the first to fail. Committing per migration is what Rails and Flyway do for the
 * same reason.
 *
 * A failing migration is rolled back by itself and stops the run: everything before it stays applied, nothing after
 * it is attempted, and the error names it.
 */
export async function runMigrations(pool: Pool, migrationsFolder: string): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder });
  const tags = readMigrationTags(migrationsFolder);
  if (tags.length !== migrations.length) {
    throw new Error(`${migrationsFolder} lists ${tags.length} migrations in its journal but has ${migrations.length}.`);
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${MIGRATIONS_SCHEMA}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );
    const last = await client.query<{ created_at: string | null }>(
      `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    );
    // Drizzle compares against the newest recorded migration only; keep the same rule so both runners agree.
    const lastApplied = last.rows[0] === undefined ? null : Number(last.rows[0].created_at);

    for (const [index, migration] of migrations.entries()) {
      if (lastApplied !== null && lastApplied >= migration.folderMillis) continue;
      try {
        await applyOne(client, migration.sql, migration.hash, migration.folderMillis);
      } catch (error) {
        throw new MigrationFailedError(tags[index] ?? `#${index}`, { cause: error });
      }
    }
  } finally {
    client.release();
  }
}
