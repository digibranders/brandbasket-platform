import type { SnapshotView } from "@/lib/overview";

export interface SearchSummary {
  readonly pageOne: { readonly figure: string; readonly detail: string | null } | null;
  readonly pages: readonly { readonly id: string; readonly title: string; readonly dueOn: string | null; readonly linkUrl: string | null }[];
  readonly listings: readonly { readonly id: string; readonly title: string }[];
}

interface SearchItem {
  readonly id: string;
  readonly kind: "page" | "listing";
  readonly title: string;
  readonly status: string;
  readonly dueOn: string | null;
  readonly linkUrl: string | null;
}

/** Same words as the Overview's search line (resultLines in lib/overview.ts). */
function changeFromLastMonth(now: number, before: number | null): string | null {
  if (before === null) return null;
  return now > before ? `Up from ${before}` : now < before ? `Down from ${before}` : "Same as last month";
}

/** `month` is `YYYY-MM-01`. Only published items dated inside it count, newest first. */
export function searchSummary(input: { readonly snapshot: SnapshotView | null; readonly items: readonly SearchItem[]; readonly month: string }): SearchSummary {
  const prefix = input.month.slice(0, 7);
  const done = input.items
    .filter((entry) => entry.status === "published" && entry.dueOn !== null && entry.dueOn.startsWith(prefix))
    .sort((a, b) => (b.dueOn ?? "").localeCompare(a.dueOn ?? "") || b.id.localeCompare(a.id));
  const now = input.snapshot?.keywordsPageOne ?? null;
  return {
    pageOne: now === null ? null : { figure: String(now), detail: changeFromLastMonth(now, input.snapshot?.keywordsPageOnePrev ?? null) },
    pages: done.filter((entry) => entry.kind === "page").map(({ id, title, dueOn, linkUrl }) => ({ id, title, dueOn, linkUrl })),
    listings: done.filter((entry) => entry.kind === "listing").map(({ id, title }) => ({ id, title })),
  };
}
