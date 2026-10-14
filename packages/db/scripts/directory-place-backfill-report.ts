import type { DirectoryPlaceBackfillResult } from "../src/queries/directory-place-backfill";

/** What a place_id backfill did, for the operator: per table, then places, merges and keys left without a place. */
export function formatBackfillReport(result: DirectoryPlaceBackfillResult): string {
  const tables = Object.entries(result.perTable).map(
    ([table, counts]) => `  ${table.padEnd(24)} ${String(counts.backfilled).padStart(7)} backfilled ${String(counts.leftNull).padStart(7)} left NULL`,
  );
  const lines = [
    "Directory place ids:",
    ...tables,
    `Places created: ${result.createdPlaces}. Open-data businesses taken over by a client: ${result.takenOver}. Legacy keys added: ${result.legacyKeysAdded}.`,
    `Duplicates merged: ${result.reviewsHidden} reviews hidden, ${result.dailyCountsMerged} daily counts added up, ${result.verificationsRemoved} verifications removed.`,
  ];
  if (result.unknownKeys.length > 0) {
    lines.push(`Keys with no place (dead or renumbered URLs; first ${result.unknownKeys.length}):`, ...result.unknownKeys.map((key) => `  ${key}`));
  }
  return lines.join("\n");
}
