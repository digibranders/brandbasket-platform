import "server-only";
import { readSocialAutoCursor, saveSocialAutoCursor } from "@brandbasket/db";
import { readEvents, socialAutoSettings } from "@/legacy-social/server/social-auto";
import { getStaffDb } from "./db";
import { socialAutoDeps } from "./social-auto-deps";
import { catchUpSocialEvents, type ReadEvents, type SocialAutoDeps } from "./social-auto-webhook";

export interface SocialAutoCatchUpDeps {
  readonly webhook: SocialAutoDeps;
  /** Null when social-auto's address or key is not set here. */
  readonly read: ReadEvents | null;
  readonly cursor: { readonly read: () => Promise<number>; readonly save: (seq: number) => Promise<void> };
}

export type SocialAutoCatchUpResult =
  | { readonly kind: "skipped" }
  | { readonly kind: "done"; readonly after: number; readonly handled: number; readonly duplicates: number; readonly ignored: number; readonly lastSeq: number };

/**
 * Reads the events social-auto holds past the stored seq, in pages of 100, through the same path as a webhook delivery (each event
 * id is acted on once), then stores the highest seq read. Does nothing when the webhook secret or social-auto's address is not set.
 * A read that fails throws before the seq moves, so the next run starts from the same place.
 */
export async function runSocialAutoCatchUp(deps: SocialAutoCatchUpDeps): Promise<SocialAutoCatchUpResult> {
  if (deps.webhook.secret === null || deps.read === null) return { kind: "skipped" };
  const after = await deps.cursor.read();
  const report = await catchUpSocialEvents(after, deps.read, deps.webhook);
  if (report.lastSeq > after) await deps.cursor.save(report.lastSeq);
  return { kind: "done", after, handled: report.handled, duplicates: report.duplicates, ignored: report.ignored, lastSeq: report.lastSeq };
}

/** The real dependencies, read when the job runs. */
export function liveSocialAutoCatchUpDeps(): SocialAutoCatchUpDeps {
  const settings = socialAutoSettings();
  const db = getStaffDb();
  return {
    webhook: socialAutoDeps(),
    read: settings === null ? null : (after, limit) => readEvents(settings, after, limit),
    cursor: { read: () => readSocialAutoCursor(db), save: (seq) => saveSocialAutoCursor(db, seq) },
  };
}
