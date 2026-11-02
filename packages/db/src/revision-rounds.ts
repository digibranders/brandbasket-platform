/**
 * How many rounds of changes a new website build includes. Staff set it in the console (site_settings); a project copies
 * the number when it is opened, so changing the setting never touches builds already under way. Pure and browser-safe.
 */

/** The name the setting is stored under (site_settings.key). */
export const REVISION_ROUNDS_KEY = "revision_rounds_included";

/** The name of the box the console's Settings form posts the number in. */
export const REVISION_ROUNDS_FIELD = "revisionRounds";

export const DEFAULT_REVISION_ROUNDS = 2;
export const MIN_REVISION_ROUNDS = 0;
export const MAX_REVISION_ROUNDS = 10;

export type RevisionRoundsReading = { readonly ok: true; readonly rounds: number } | { readonly ok: false };

/** Reads what staff typed: a whole number from MIN to MAX and nothing else. */
export function readRevisionRounds(input: string): RevisionRoundsReading {
  const text = input.trim();
  if (!/^\d{1,2}$/.test(text)) return { ok: false };
  const rounds = Number(text);
  return rounds >= MIN_REVISION_ROUNDS && rounds <= MAX_REVISION_ROUNDS ? { ok: true, rounds } : { ok: false };
}

/** The stored value as a number; a missing or unreadable value means the default, so a bad row never blocks a sign-up. */
export function revisionRoundsFromSetting(value: string | null): number {
  if (value === null) return DEFAULT_REVISION_ROUNDS;
  const reading = readRevisionRounds(value);
  return reading.ok ? reading.rounds : DEFAULT_REVISION_ROUNDS;
}
