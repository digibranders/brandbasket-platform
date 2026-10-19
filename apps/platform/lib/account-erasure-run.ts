import type { DueClosure, ErasureOutcome, ErasureSkipReason } from "@brandbasket/db";

/*
 * One run of the 30-day erase, with everything it touches passed in so it can be tested without a database, a CMS or
 * a disk. The order is the point:
 *
 * 1. Ask whether the closure may be erased at all. Nothing is removed for a closure that will be skipped.
 * 2. Clear the account's content from the website's CMS (its own database): idempotent, so a failure here leaves the
 *    closure open and the next run does it again.
 * 3. Erase the rows in one transaction, which asks again under its own lock.
 * 4. Remove the stored files the erased rows pointed at, and the videos they named on Vimeo. A failure leaves an
 *    unreferenced file or video, which cannot be shown, and is reported rather than retried.
 */

export interface ErasureDeps {
  /** Open closures whose grace period is over, oldest first. */
  readonly listDue: (now: Date, limit: number) => Promise<readonly DueClosure[]>;
  /** Why this closure may not be erased now, or null when it may. */
  readonly findBlock: (closureId: string, now: Date) => Promise<ErasureSkipReason | null>;
  /** Removes the business's posts, authors, categories, media and tenant from the CMS. Idempotent. */
  readonly eraseWebsiteContent: (businessId: string) => Promise<void>;
  readonly eraseRows: (closureId: string, now: Date) => Promise<ErasureOutcome>;
  /** Removes stored files; resolves with the keys that could not be removed. Never throws. */
  readonly deleteFiles: (keys: readonly string[]) => Promise<readonly string[]>;
  /** Deletes videos from Vimeo; resolves with the ids that could not be deleted. Never throws. */
  readonly deleteVimeoVideos: (ids: readonly string[]) => Promise<readonly string[]>;
}

export interface ErasureRunOptions {
  readonly now: Date;
  /** The most accounts one run erases, so a backlog cannot run for ever. */
  readonly limit: number;
  /** Report what would be erased and change nothing. */
  readonly dryRun: boolean;
}

export type ErasureItemResult =
  | { readonly closureId: string; readonly status: "would-erase" }
  | {
      readonly closureId: string;
      readonly status: "erased";
      readonly files: number;
      readonly filesNotRemoved: number;
      readonly videos: number;
      readonly videosNotRemoved: number;
    }
  | { readonly closureId: string; readonly status: "skipped"; readonly reason: ErasureSkipReason }
  | { readonly closureId: string; readonly status: "failed"; readonly stage: "website-content" | "rows" };

export interface ErasureRunReport {
  readonly dryRun: boolean;
  readonly due: number;
  readonly items: readonly ErasureItemResult[];
}

export async function runAccountErasure(deps: ErasureDeps, options: ErasureRunOptions): Promise<ErasureRunReport> {
  const due = await deps.listDue(options.now, options.limit);
  const items: ErasureItemResult[] = [];
  for (const closure of due) {
    items.push(await eraseOne(deps, closure, options));
  }
  return { dryRun: options.dryRun, due: due.length, items };
}

async function eraseOne(deps: ErasureDeps, closure: DueClosure, options: ErasureRunOptions): Promise<ErasureItemResult> {
  const closureId = closure.id;
  const block = await deps.findBlock(closureId, options.now);
  if (block !== null) return { closureId, status: "skipped", reason: block };
  if (options.dryRun) return { closureId, status: "would-erase" };

  try {
    await deps.eraseWebsiteContent(closure.businessId);
  } catch (error) {
    console.error("Could not clear an account's website content, so it was not erased.", { closureId, error });
    return { closureId, status: "failed", stage: "website-content" };
  }

  let outcome: ErasureOutcome;
  try {
    outcome = await deps.eraseRows(closureId, options.now);
  } catch (error) {
    console.error("Could not erase an account's rows.", { closureId, error });
    return { closureId, status: "failed", stage: "rows" };
  }
  if (outcome.kind === "skipped") return { closureId, status: "skipped", reason: outcome.reason };

  const notRemoved = await deps.deleteFiles(outcome.storageKeys);
  const videosNotRemoved = await deps.deleteVimeoVideos(outcome.vimeoIds);
  return {
    closureId,
    status: "erased",
    files: outcome.storageKeys.length,
    filesNotRemoved: notRemoved.length,
    videos: outcome.vimeoIds.length,
    videosNotRemoved: videosNotRemoved.length,
  };
}
