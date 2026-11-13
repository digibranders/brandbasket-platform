export interface RollupRunRequest {
  readonly dryRun: boolean;
}

/**
 * Reads `?dryRun=1` from the job's URL. Any other query is refused rather than guessed at, because the job also deletes
 * the old hits.
 */
export function parseRollupRunRequest(url: URL): RollupRunRequest | null {
  for (const name of url.searchParams.keys()) if (name !== "dryRun") return null;
  const dryParam = url.searchParams.get("dryRun");
  if (dryParam !== null && dryParam !== "1" && dryParam !== "0") return null;
  return { dryRun: dryParam === "1" };
}
