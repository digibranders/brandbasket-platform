/** Hits this far apart or less belong to one visit. */
export const VISIT_GAP_MINUTES = 30;

export interface Visit<T extends { readonly visitorHash: string; readonly at: Date }> {
  readonly visitorHash: string;
  readonly start: Date;
  readonly end: Date;
  /** The visit's hits, oldest first. */
  readonly hits: readonly T[];
}

/**
 * Groups hits into visits: one visitor's hits, in time order, split wherever the gap is more than 30 minutes. A gap of
 * exactly 30 minutes is still one visit. Visits come back oldest first. The input is not changed.
 */
export function sessionise<T extends { readonly visitorHash: string; readonly at: Date }>(hits: readonly T[]): Visit<T>[] {
  const gap = VISIT_GAP_MINUTES * 60_000;
  const ordered = [...hits].sort((a, b) => (a.visitorHash < b.visitorHash ? -1 : a.visitorHash > b.visitorHash ? 1 : a.at.getTime() - b.at.getTime()));
  const groups: T[][] = [];
  for (const hit of ordered) {
    const current = groups[groups.length - 1];
    const last = current?.[current.length - 1];
    if (current !== undefined && last !== undefined && last.visitorHash === hit.visitorHash && hit.at.getTime() - last.at.getTime() <= gap) current.push(hit);
    else groups.push([hit]);
  }
  return groups
    .map((group) => ({ visitorHash: group[0]!.visitorHash, start: group[0]!.at, end: group[group.length - 1]!.at, hits: group }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
