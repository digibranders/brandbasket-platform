/**
 * The words for each directory review highlight (JustDial's "Suggestions"), for the staff console. The platform's
 * contract with the marketing website (apps/platform/lib/directory-api.ts, REVIEW_HIGHLIGHTS) is the source of truth
 * and cannot be imported from here; apps/platform/lib/directory-parity.test.ts asserts the two agree.
 */
export const DIRECTORY_HIGHLIGHT_LABELS: Readonly<Record<string, string>> = {
  good_service: "Good service",
  value_for_money: "Value for money",
  friendly_staff: "Friendly staff",
  clean: "Clean and tidy",
  on_time: "On time",
  quality: "Great quality",
  expert: "Knows their stuff",
  quick_response: "Quick to respond",
};

/** The label for a highlight id, or the id itself for one this list does not know yet. */
export function directoryHighlightLabel(id: string): string {
  // Own keys only, so an inherited name such as "constructor" is not mistaken for a label.
  return Object.hasOwn(DIRECTORY_HIGHLIGHT_LABELS, id) ? (DIRECTORY_HIGHLIGHT_LABELS[id] ?? id) : id;
}
