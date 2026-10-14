import "server-only";
import type {
  DueClosure,
  ErasureOutcome,
  ErasureSkipReason,
} from "@firstfold/db";
import type { DeletingSupportAttachment } from "@firstfold/shared/server/support-attachment-maintenance";
export class PrivateSupportErasureError extends Error {
  constructor(readonly failedObjects: number) {
    super(
      `Account erasure retained its deletion manifest because ${failedObjects} private support screenshot(s) could not be purged.`,
    );
    this.name = "PrivateSupportErasureError";
  }
}
export async function eraseAccountWithPrivateSupport(
  deps: {
    readonly findClosure: (
      closureId: string,
      now: Date,
    ) => Promise<DueClosure | null>;
    readonly findBlock: (
      closureId: string,
      now: Date,
    ) => Promise<ErasureSkipReason | null>;
    readonly begin: (
      userId: string,
    ) => Promise<readonly DeletingSupportAttachment[]>;
    readonly purge: (
      rows: readonly DeletingSupportAttachment[],
    ) => Promise<{ purged: number; failed: number }>;
    readonly erase: (closureId: string, now: Date) => Promise<ErasureOutcome>;
  },
  closureId: string,
  now: Date,
): Promise<ErasureOutcome> {
  const closure = await deps.findClosure(closureId, now);
  if (closure === null)
    return { kind: "skipped", closureId, reason: "not-due" };
  const block = await deps.findBlock(closureId, now);
  if (block !== null) return { kind: "skipped", closureId, reason: block };
  const rows = await deps.begin(closure.userId);
  const result = await deps.purge(rows);
  if (result.failed > 0) throw new PrivateSupportErasureError(result.failed);
  return deps.erase(closureId, now);
}
