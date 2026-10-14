import "server-only";
import { pictureCopyKey } from "@fynix/shared/server/media-keys";
import type { MediaStorage } from "@fynix/shared/server/media-storage";
import { makePictureCopies } from "./media-upload";

/*
 * Makes the smaller copies of pictures that were uploaded before copies existed (see storePictureCopies). Run by
 * scripts/backfill-picture-copies.ts. Safe to run again: a copy that is already stored is left alone, and a picture
 * that is gone from storage is only counted.
 */

export interface BackfillPicture {
  readonly id: string;
  /** The picture's `display` key. */
  readonly storageKey: string;
}

export interface BackfillReport {
  /** Pictures looked at. */
  readonly pictures: number;
  /** Copies written, or, in a dry run, copies that would be. */
  readonly copiesMade: number;
  /** Pictures that already had every copy they should. */
  readonly alreadyDone: number;
  /** Pictures whose file is not in storage. */
  readonly missingFiles: readonly string[];
  /** Pictures whose copies could not be made or stored, with the reason. */
  readonly failed: readonly { readonly id: string; readonly reason: string }[];
}

export async function backfillPictureCopies(input: {
  readonly pictures: readonly BackfillPicture[];
  readonly storage: MediaStorage;
  readonly dryRun: boolean;
}): Promise<BackfillReport> {
  let copiesMade = 0;
  let alreadyDone = 0;
  const missingFiles: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const picture of input.pictures) {
    try {
      const stored = await input.storage.get(picture.storageKey);
      if (stored === null) {
        missingFiles.push(picture.id);
        continue;
      }
      let madeForPicture = 0;
      for (const copy of await makePictureCopies(stored.bytes)) {
        const key = pictureCopyKey(picture.storageKey, copy.width);
        if (key === null || (await input.storage.get(key)) !== null) continue;
        if (!input.dryRun) await input.storage.put(key, copy.bytes, copy.mimeType);
        madeForPicture += 1;
      }
      copiesMade += madeForPicture;
      if (madeForPicture === 0) alreadyDone += 1;
    } catch (error) {
      failed.push({ id: picture.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { pictures: input.pictures.length, copiesMade, alreadyDone, missingFiles, failed };
}

export function formatBackfillReport(report: BackfillReport, dryRun: boolean): string {
  const lines = [
    `${dryRun ? "DRY RUN: nothing was written. " : ""}Pictures looked at: ${String(report.pictures)}`,
    `Copies ${dryRun ? "that would be made" : "made"}: ${String(report.copiesMade)}`,
    `Pictures that already had all their copies: ${String(report.alreadyDone)}`,
    `Pictures whose file is missing from storage: ${String(report.missingFiles.length)}${report.missingFiles.length > 0 ? ` (${report.missingFiles.join(", ")})` : ""}`,
    `Pictures that failed: ${String(report.failed.length)}`,
    ...report.failed.map((entry) => `  ${entry.id}: ${entry.reason}`),
  ];
  return lines.join("\n");
}
