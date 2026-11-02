import "server-only";
import { clearSiteSetting, findSiteSettingWithEditor, REVISION_ROUNDS_KEY, revisionRoundsFromSetting, saveSiteSetting } from "@brandbasket/db";
import { SETUP_CALL_URL_KEY } from "@brandbasket/shared/lib/setup-call-link";
import { getStaffDb } from "./db";

export interface SetupCallSetting {
  /** The link customers are sent to, or null when there is none. */
  readonly url: string | null;
  readonly changedAt: Date | null;
  /** The address of the staff member who last changed it, or null when unknown. */
  readonly changedBy: string | null;
}

/** The setup call link as it stands, for the Settings page. */
export async function loadSetupCallSetting(): Promise<SetupCallSetting> {
  const setting = await findSiteSettingWithEditor(getStaffDb(), SETUP_CALL_URL_KEY);
  if (setting === null) return { url: null, changedAt: null, changedBy: null };
  return { url: setting.value, changedAt: setting.updatedAt, changedBy: setting.updatedByEmail };
}

/** Saves the link, or clears it when `url` is null. The caller has already read and checked the address. */
export async function saveSetupCallUrl(input: { readonly url: string | null; readonly staffUserId: string }, now: Date): Promise<void> {
  const db = getStaffDb();
  if (input.url === null) {
    await clearSiteSetting(db, SETUP_CALL_URL_KEY);
    return;
  }
  await saveSiteSetting(db, { key: SETUP_CALL_URL_KEY, value: input.url, staffUserId: input.staffUserId, now });
}

export interface RevisionRoundsSetting {
  readonly rounds: number;
  /** False while nobody has saved it, so the number shown is the default. */
  readonly isSaved: boolean;
  readonly changedAt: Date | null;
  readonly changedBy: string | null;
}

/** The rounds of changes a new build includes, as it stands, for the Settings page. */
export async function loadRevisionRoundsSetting(): Promise<RevisionRoundsSetting> {
  const setting = await findSiteSettingWithEditor(getStaffDb(), REVISION_ROUNDS_KEY);
  return {
    rounds: revisionRoundsFromSetting(setting?.value ?? null),
    isSaved: setting !== null,
    changedAt: setting?.updatedAt ?? null,
    changedBy: setting?.updatedByEmail ?? null,
  };
}

/** Saves the rounds a new build includes. The caller has already read and checked the number. */
export async function saveRevisionRounds(input: { readonly rounds: number; readonly staffUserId: string }, now: Date): Promise<void> {
  await saveSiteSetting(getStaffDb(), { key: REVISION_ROUNDS_KEY, value: String(input.rounds), staffUserId: input.staffUserId, now });
}
