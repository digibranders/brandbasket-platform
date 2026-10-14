/** Keyboard behaviour for a single-choice list (the custom dropdowns), kept apart from the UI so it can be tested. Mirrors fynix-website/lib/listbox.ts. */

export type ListboxMove = "next" | "previous" | "first" | "last";

/**
 * The option to highlight after an arrow, Home or End key. Stops at the ends rather than wrapping, as native selects
 * do. With nothing highlighted yet, "next" starts at the top and "previous" at the bottom. -1 means an empty list.
 */
export function moveActive(current: number, move: ListboxMove, count: number): number {
  if (count === 0) return -1;
  const last = count - 1;
  switch (move) {
    case "first":
      return 0;
    case "last":
      return last;
    case "next":
      return current < 0 ? 0 : Math.min(current + 1, last);
    case "previous":
      return current < 0 ? last : Math.max(current - 1, 0);
  }
}

/**
 * The option to jump to for the letters typed so far, or -1 for none. Typing one letter, or the same letter again,
 * moves on to the next option starting with it (so "s s s" cycles through them); a longer word searches from the
 * current option, so it stays put while the word still matches it.
 */
export function matchTypeahead(labels: readonly string[], typed: string, current: number): number {
  const query = typed.toLocaleLowerCase();
  if (query === "" || labels.length === 0) return -1;
  const repeatsOneLetter = [...query].every((letter) => letter === query[0]);
  const prefix = repeatsOneLetter ? query[0] : query;
  const start = repeatsOneLetter ? current + 1 : Math.max(current, 0);

  for (let step = 0; step < labels.length; step += 1) {
    const index = (start + step) % labels.length;
    if (labels[index]?.toLocaleLowerCase().startsWith(prefix ?? "")) return index;
  }
  return -1;
}
