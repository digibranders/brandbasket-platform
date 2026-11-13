import type { Deliverable, MonthlySnapshot } from "@brandbasket/db";

/*
 * Local SEO + AEO, as pure rules (plan 61, section 4). Ported from apps/platform lib/search/summary.ts and the https-only link
 * rule of components/search/search-view.tsx. Rankings, AI answers, reviews and the Google profile have no data source yet
 * (gates G4 and G6), so nothing here knows about them. No I/O here.
 */

export const SEARCH_PATH = "/search";
export const ASK_FOR_CHANGE_HREF = "/requests?new=1&kind=search";
/** Plan & billing with Local SEO + AEO ready to add. */
export const ADD_SEARCH_HREF = "/billing?add=search";

export const SEARCH_DESCRIPTION = "How people find you on Google, Maps and AI answers like ChatGPT.";

/** AEO in plain words, said once on the page (the glossary calls the work "AI answers"). */
export const AEO_EXPLAINED = "AEO stands for answer engine optimisation: making sure AI tools like ChatGPT mention your business when people ask about your kind of work.";

export type SearchItemRow = Pick<Deliverable, "id" | "kind" | "title" | "status" | "dueOn" | "linkUrl">;

export interface DoneItem {
  readonly id: string;
  readonly kind: "page" | "listing";
  readonly title: string;
  /** `YYYY-MM-DD`. */
  readonly dueOn: string;
  /** https only; anything else is shown as plain text. */
  readonly href: string | null;
}

/** The page-one count of a month, as measured. */
export interface PageOne {
  readonly count: number;
  /** "Up from 6", "Down from 9" or "Same as last month"; null without last month's count. */
  readonly change: string | null;
  /** The count minus last month's. */
  readonly diff: number | null;
  /** When staff entered it: the check date shown beside the number. */
  readonly checkedAt: Date;
}

export type SearchFigures = Pick<MonthlySnapshot, "keywordsPageOne" | "keywordsPageOnePrev" | "updatedAt">;

/** Same words as the old Search page and Overview. */
function changeFromLastMonth(now: number, before: number | null): string | null {
  if (before === null) return null;
  return now > before ? `Up from ${before}` : now < before ? `Down from ${before}` : "Same as last month";
}

/** The count of searches on Google's first page, or null when it was not measured: never a zero that means "we do not know". */
export function pageOne(snapshot: SearchFigures | null): PageOne | null {
  const count = snapshot?.keywordsPageOne ?? null;
  if (snapshot === null || count === null) return null;
  const before = snapshot.keywordsPageOnePrev;
  return { count, change: changeFromLastMonth(count, before), diff: before === null ? null : count - before, checkedAt: snapshot.updatedAt };
}

/** The https link for a page, or null. */
export function httpsUrl(url: string | null): string | null {
  return url !== null && url.startsWith("https://") ? url : null;
}

/** Pages and listings finished inside the month of `month` (`YYYY-MM-01`), newest first. Anything else is not counted. */
export function doneThisMonth(rows: readonly SearchItemRow[], month: string): DoneItem[] {
  const prefix = month.slice(0, 7);
  return rows
    .flatMap((row): DoneItem[] =>
      (row.kind === "page" || row.kind === "listing") && row.status === "published" && row.dueOn !== null && row.dueOn.startsWith(prefix)
        ? [{ id: row.id, kind: row.kind, title: row.title, dueOn: row.dueOn, href: httpsUrl(row.linkUrl) }]
        : [],
    )
    .sort((a, b) => b.dueOn.localeCompare(a.dueOn) || b.id.localeCompare(a.id));
}
