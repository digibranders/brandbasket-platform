/** Pure helpers behind DataTable's keyboard: the cursor, single and range selection. No DOM, so they are tested in node. */

/** The id one step from `current`, clamped at both ends. With no cursor yet, a forward step lands on the first row. */
export function stepCursor(ids: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const index = current === null ? -1 : ids.indexOf(current);
  if (index === -1) return ids[delta === 1 ? 0 : ids.length - 1] ?? null;
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))] ?? null;
}

export function toggleId(selected: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Adds every id between `anchor` and `target` (inclusive) to the selection, for Shift with j or k. */
export function extendSelection(ids: readonly string[], selected: ReadonlySet<string>, anchor: string, target: string): ReadonlySet<string> {
  const from = ids.indexOf(anchor);
  const to = ids.indexOf(target);
  if (from === -1 || to === -1) return selected;
  const next = new Set(selected);
  for (const id of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(id);
  return next;
}
