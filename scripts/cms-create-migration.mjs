#!/usr/bin/env node
/**
 * Generates a Payload migration, safely.
 *
 * `payload migrate:create` writes the difference between the collections and *the database it connects to*. In
 * development Payload pushes schema changes straight to `brandbasket_platform_payload` as you edit a collection, so by the time
 * you think to create a migration that database already matches — and the command cheerfully writes an empty one.
 * Nothing fails, nothing warns, and production comes up missing the column.
 *
 * So this never points the generator at the development database. It builds a scratch database, applies the
 * migrations that already exist to bring it to the last released schema, and generates the difference against
 * that. The scratch database is dropped afterwards, whether or not the generation succeeded.
 *
 * Usage: pnpm cms:migrate:create <name>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = path.join(ROOT, "apps", "platform");
const ENV_FILE = path.join(PLATFORM, ".env.local");
const SCRATCH_SUFFIX = "_migrate_scratch";

const name = process.argv[2];
if (name === undefined || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
  console.error('Usage: pnpm cms:migrate:create <name>   (lowercase letters, digits, "-" and "_")');
  process.exit(1);
}

/** The one variable we need out of .env.local. Values there are unquoted (see packages/db/src/local-env-template.ts). */
function readPayloadUrl() {
  let contents;
  try {
    contents = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(`${ENV_FILE} does not exist. Run "pnpm env:init" first.`);
  }
  const line = contents.split("\n").find((l) => l.startsWith("DATABASE_URL_PAYLOAD="));
  if (line === undefined) throw new Error(`DATABASE_URL_PAYLOAD is not set in ${ENV_FILE}.`);
  return line.slice("DATABASE_URL_PAYLOAD=".length).trim();
}

const developmentUrl = new URL(readPayloadUrl());
const developmentDatabase = developmentUrl.pathname.replace(/^\//, "");
if (developmentDatabase.endsWith(SCRATCH_SUFFIX)) {
  throw new Error(`DATABASE_URL_PAYLOAD already points at a scratch database (${developmentDatabase}).`);
}

const scratchDatabase = `${developmentDatabase}${SCRATCH_SUFFIX}`;
const scratchUrl = new URL(developmentUrl.toString());
scratchUrl.pathname = `/${scratchDatabase}`;

/** Connects to `postgres` on the same server, which is where a database can be created and dropped. */
function adminPsql(sql) {
  const url = new URL(developmentUrl.toString());
  url.pathname = "/postgres";
  execFileSync("psql", [url.toString(), "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: "inherit" });
}

function payload(...args) {
  execFileSync("pnpm", ["exec", "payload", ...args], {
    cwd: PLATFORM,
    stdio: "inherit",
    env: {
      ...process.env,
      PAYLOAD_CONFIG_PATH: path.join(ROOT, "packages", "cms", "payload.config.ts"),
      DATABASE_URL_PAYLOAD: scratchUrl.toString(),
    },
  });
}

console.log(`Building ${scratchDatabase} to generate against.`);
adminPsql(`DROP DATABASE IF EXISTS "${scratchDatabase}"`);
adminPsql(`CREATE DATABASE "${scratchDatabase}"`);

try {
  // Brings the scratch database to the schema the existing migrations describe, so the generated difference is
  // exactly what this change adds — not an empty file, and not a second copy of everything.
  payload("migrate");
  payload("migrate:create", "--name", name);
} finally {
  adminPsql(`DROP DATABASE IF EXISTS "${scratchDatabase}"`);
}

console.log(`\nWrote the migration to packages/cms/src/migrations. Commit it with the collection change.`);
