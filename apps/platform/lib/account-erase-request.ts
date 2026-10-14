/** One run erases at most this many accounts, so a backlog cannot hold a request open for ever. */
export const ERASE_RUN_DEFAULT_LIMIT = 25;
export const ERASE_RUN_MAX_LIMIT = 100;

export interface EraseRunRequest {
  readonly dryRun: boolean;
  readonly limit: number;
}

/**
 * Reads `?dryRun=1` and `?limit=N` from the job's URL. Anything else, or a limit that is not a whole number from 1 to
 * ERASE_RUN_MAX_LIMIT, is a mistake worth refusing rather than guessing at, because the job deletes people's data.
 */
export function parseEraseRunRequest(url: URL): EraseRunRequest | null {
  const dryParam = url.searchParams.get("dryRun");
  if (dryParam !== null && dryParam !== "1" && dryParam !== "0") return null;
  const limitParam = url.searchParams.get("limit");
  let limit = ERASE_RUN_DEFAULT_LIMIT;
  if (limitParam !== null) {
    if (!/^[1-9][0-9]{0,2}$/.test(limitParam)) return null;
    limit = Number(limitParam);
    if (limit > ERASE_RUN_MAX_LIMIT) return null;
  }
  return { dryRun: dryParam === "1", limit };
}
