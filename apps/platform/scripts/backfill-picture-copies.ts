import { createDatabase, listDirectoryPictureKeys } from "@brandbasket/db";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { backfillPictureCopies, formatBackfillReport } from "../lib/server/picture-copy-backfill";

/*
 * Makes the smaller copies (320 and 640 px) of every live picture that was uploaded before copies existed. Reads the
 * pictures from the staff database and writes through the same storage the apps use (R2 when the five R2_* settings
 * are set, otherwise the media folder), so run it where those settings are, with the same environment as the apps.
 * Safe to run again. By default it only reports what it would do; add --apply to write.
 *
 *   NODE_OPTIONS=--conditions=react-server pnpm pictures:backfill-copies          (report only)
 *   NODE_OPTIONS=--conditions=react-server pnpm pictures:backfill-copies --apply  (write the copies)
 *
 * The `react-server` condition is only there so the `server-only` guard the shared code imports lets a script load it.
 */

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_STAFF;
  if (url === undefined || url === "") throw new Error("DATABASE_URL_STAFF is not set.");
  const dryRun = !process.argv.includes("--apply");

  const { db, close } = createDatabase(url, { max: 1 });
  try {
    const pictures = await listDirectoryPictureKeys(db);
    const report = await backfillPictureCopies({ pictures, storage: getMediaStorage(), dryRun });
    console.log(formatBackfillReport(report, dryRun));
    if (report.failed.length > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
