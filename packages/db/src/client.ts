import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { readonly $client: Pool };

export interface DatabaseHandle {
  readonly db: Database;
  /** Ends the pool. Safe to call more than once. */
  readonly close: () => Promise<void>;
}

export interface DatabaseOptions {
  /** Maximum pooled connections. */
  readonly max?: number;
  /**
   * Called when an idle pooled connection fails, for example when Postgres restarts. Without a listener
   * Node would crash the process on the pool's "error" event. Defaults to logging to stderr.
   */
  readonly onIdleConnectionError?: (error: Error) => void;
}

const DEFAULT_POOL_SIZE = 10;
/** Fail fast instead of waiting forever when every pooled connection is busy or the server is down. */
const CONNECTION_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;

function logIdleConnectionError(error: Error): void {
  console.error("An idle Postgres connection failed; the pool opens a new one when needed.", error);
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: options.max ?? DEFAULT_POOL_SIZE,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
  pool.on("error", options.onIdleConnectionError ?? logIdleConnectionError);
  const db = drizzle({ client: pool, schema });

  let closing: Promise<void> | undefined;
  return {
    db,
    close: () => {
      closing ??= pool.end();
      return closing;
    },
  };
}
