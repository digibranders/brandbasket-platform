import "server-only";
import type { SupportStorage } from "./support-storage";
export interface DeletingSupportAttachment {
  readonly id: string;
  readonly storageKey: string;
}
/** Rows must already be in deleting state, so they are unavailable throughout retries. */
export async function purgeSupportAttachments(
  deps: {
    readonly storage: SupportStorage;
    readonly markPurged: (id: string) => Promise<void>;
    readonly onError: (id: string, error: unknown) => void;
  },
  rows: readonly DeletingSupportAttachment[],
): Promise<{ purged: number; failed: number }> {
  let purged = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deps.storage.delete(row.storageKey);
      await deps.markPurged(row.id);
      purged++;
    } catch (error) {
      failed++;
      deps.onError(row.id, error);
    }
  }
  return { purged, failed };
}
