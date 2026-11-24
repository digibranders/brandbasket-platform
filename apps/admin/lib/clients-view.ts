import type { StaffProjectRow } from "@brandbasket/db";
import { boardColumns, filterByScope, type BoardCard, type BoardColumn, type ProjectScope } from "@/lib/project-board";
import { type ClientRowStage } from "@/lib/client-rows";

/** The two views of the Clients page. Builds is the board that used to live at /projects. */
export type ClientsView = "list" | "builds";

/** Reads `?view=`. Anything but "builds" is the list, so a mistyped address still shows clients. */
export function parseClientsView(value: string | string[] | undefined): ClientsView {
  return (Array.isArray(value) ? value[0] : value) === "builds" ? "builds" : "list";
}

/** The list's address with its stage filter and search kept. */
export function clientsListHref(filter: { readonly stage: ClientRowStage | null; readonly search: string; readonly open?: string | null }): string {
  const query = new URLSearchParams();
  if (filter.stage !== null) query.set("stage", filter.stage);
  if (filter.search !== "") query.set("q", filter.search);
  if (filter.open != null) query.set("open", filter.open);
  const text = query.toString();
  return text === "" ? "/clients" : `/clients?${text}`;
}

/** The Builds view's address. "Needs action" is the default and stays out of the address. */
export function buildsHref(scope: ProjectScope): string {
  return scope === "needs-action" ? "/clients?view=builds" : `/clients?view=builds&show=${scope}`;
}

export interface BuildsSummary {
  readonly columns: readonly BoardColumn[];
  readonly cards: readonly BoardCard[];
  readonly open: number;
  readonly late: number;
  readonly dueToday: number;
}

/** The board for one scope, and the three figures in the page header. */
export function buildsSummary(rows: readonly StaffProjectRow[], scope: ProjectScope, now: Date): BuildsSummary {
  const shown = filterByScope(rows, scope, now);
  const columns = boardColumns(shown, now);
  const cards = columns.flatMap((column) => column.cards);
  return {
    columns,
    cards,
    open: shown.filter((row) => row.status !== "live").length,
    late: cards.filter((card) => card.late).length,
    dueToday: cards.filter((card) => card.dueSoon).length,
  };
}
