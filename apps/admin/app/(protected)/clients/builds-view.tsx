import { listOpenProjectsForStaff } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import { FilterPills, type FilterOption } from "@/components/console/filter-pills";
import { buildsHref, buildsSummary } from "@/lib/clients-view";
import type { BoardCard, ProjectScope } from "@/lib/project-board";
import { getStaffDb } from "@/lib/server/db";
import { monthRange } from "@/lib/team-time";

const SCOPES: readonly { readonly scope: ProjectScope; readonly label: string }[] = [
  { scope: "needs-action", label: "Needs action" },
  { scope: "late", label: "Late" },
  { scope: "on-hold", label: "On hold" },
  { scope: "all", label: "All" },
];

function Card({ card }: { readonly card: BoardCard }): ReactElement {
  return (
    <Link
      href={`/clients/${card.row.businessId}/website`}
      className={cn(
        "grid gap-1.5 rounded-lg bg-surface p-3 transition-colors duration-200 hover:bg-white",
        card.late && "shadow-[inset_3px_0_0_var(--color-error)]",
      )}
    >
      <b className="text-[0.8125rem] font-semibold text-ink">{card.row.businessName}</b>
      <span className="text-xs text-ink-2">{card.note}</span>
      {card.due === "" ? null : (
        <span className={cn("justify-self-end font-figure text-xs", card.late ? "font-semibold text-error" : card.dueSoon ? "font-semibold text-rattan-ink" : "text-ink-2")}>
          {card.due}
        </span>
      )}
    </Link>
  );
}

/**
 * The Builds view: every website build as columns by stage, with the date each first preview is promised by (what the
 * /projects board showed). Read on the server; the scope pills are links, so the view needs no script.
 */
export async function BuildsView({ scope, now }: { readonly scope: ProjectScope; readonly now: Date }): Promise<{ readonly meta: string; readonly body: ReactElement }> {
  const rows = await listOpenProjectsForStaff(getStaffDb(), monthRange(now).start);
  const { columns, cards, open, late, dueToday } = buildsSummary(rows, scope, now);
  const options: FilterOption[] = SCOPES.map((option) => ({ href: buildsHref(option.scope), label: option.label, current: scope === option.scope }));
  return {
    meta: `${open} open · ${late} late · ${dueToday} due today`,
    body: (
      <>
        <FilterPills label="Show" options={options} />
        {cards.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No builds to show." description="A website build appears here from the moment a client pays for a website." />
          </div>
        ) : (
          <div className="mt-6 grid grid-flow-col auto-cols-[minmax(11rem,1fr)] items-start gap-3 overflow-x-auto">
            {columns.map((column) => (
              <section key={column.key} aria-label={column.label}>
                <h2 className="mb-2 flex justify-between border-b border-line pb-2 text-[0.8125rem] font-semibold text-ink">
                  {column.label}
                  <span className="font-figure text-xs text-ink-2">{column.cards.length}</span>
                </h2>
                <div className="grid gap-2">
                  {column.cards.map((card) => (
                    <Card key={card.row.projectId} card={card} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </>
    ),
  };
}
