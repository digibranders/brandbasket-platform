import { listAssignableSupportStaff, listOpenProjectsForStaff } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { EmptyLine } from "@/components/console/hairline-list";
import { FilterPills, type FilterOption } from "@/components/console/filter-pills";
import { PageHeader } from "@/components/console/page-header";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";
import { monthRange } from "@/lib/team-time";
import { boardColumns, filterByBuilder, filterByScope, parseProjectScope, type BoardCard, type ProjectScope } from "@/lib/project-board";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { cn } from "@brandbasket/shared/lib/cn";
import { TableScroll } from "@/components/console/table-scroll";

export const metadata: Metadata = { title: "Projects" };

interface ProjectsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function href(view: "board" | "list", builder: string | null, scope: ProjectScope): string {
  const params = new URLSearchParams();
  if (view === "list") params.set("view", "list");
  if (builder !== null) params.set("builder", builder);
  if (scope !== "needs-action") params.set("show", scope);
  const query = params.toString();
  return query === "" ? "/projects" : `/projects?${query}`;
}

function Card({ card }: { readonly card: BoardCard }): ReactElement {
  return (
    <Link
      href={`/clients/${card.row.businessId}/project`}
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

/** Every website build on one board, with its builder and the date its first preview is promised by. */
export default async function ProjectsPage({ searchParams }: ProjectsPageProps): Promise<ReactElement> {
  await requireStaffAccess();
  const query = await searchParams;
  const view = one(query.view) === "list" ? "list" : "board";
  const builder = one(query.builder);
  const scope = parseProjectScope(one(query.show) ?? undefined);
  const now = new Date();
  const db = getStaffDb();
  const [rows, staff] = await Promise.all([listOpenProjectsForStaff(db, monthRange(now).start), listAssignableSupportStaff(db)]);
  const shown = filterByScope(filterByBuilder(rows, builder), scope, now);
  const columns = boardColumns(shown, now);
  const cards = columns.flatMap((column) => column.cards.map((card) => ({ column: column.label, card })));
  const open = shown.filter((row) => row.status !== "live").length;
  const late = cards.filter(({ card }) => card.late).length;
  const dueToday = cards.filter(({ card }) => card.dueSoon).length;

  const viewOptions: FilterOption[] = [
    { href: href("board", builder, scope), label: "Board", current: view === "board" },
    { href: href("list", builder, scope), label: "List", current: view === "list" },
  ];
  const builderOptions: FilterOption[] = [
    { href: href(view, null, scope), label: "Anyone", current: builder === null },
    { href: href(view, "none", scope), label: "No builder", current: builder === "none" },
    ...staff.map((person) => ({ href: href(view, person.userId, scope), label: person.name, current: builder === person.userId })),
  ];
  const scopeOptions: FilterOption[] = [
    { href: href(view, builder, "needs-action"), label: "Needs action", current: scope === "needs-action" },
    { href: href(view, builder, "late"), label: "Late", current: scope === "late" },
    { href: href(view, builder, "on-hold"), label: "On hold", current: scope === "on-hold" },
    { href: href(view, builder, "all"), label: "All", current: scope === "all" },
  ];

  return (
    <>
      <PageHeader title="Projects" meta={`${open} open · ${late} late · ${dueToday} due today`} />
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <FilterPills label="View" options={viewOptions} />
        <FilterPills label="Builder" options={builderOptions} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <FilterPills label="Show" options={scopeOptions} />
      </div>

      {cards.length === 0 ? (
        <div className="mt-8">
          <EmptyLine>No builds to show.</EmptyLine>
        </div>
      ) : view === "board" ? (
        <div className="mt-8 grid grid-flow-col auto-cols-[minmax(11rem,1fr)] items-start gap-3 overflow-x-auto">
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
      ) : (
        <TableScroll label="Projects" className="mt-8">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Business</th>
                <th className={TH}>Stage</th>
                <th className={TH}>Note</th>
                <th className={TH}>Date</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(({ column, card }) => (
                <tr key={card.row.projectId}>
                  <td className={TD}>
                    <Link href={`/clients/${card.row.businessId}/project`} className="font-semibold text-ink">
                      {card.row.businessName}
                    </Link>
                  </td>
                  <td className={TD}>
                    <StatusPill tone={card.late ? "problem" : card.row.status === "on_hold" ? "todo" : card.row.status === "live" ? "done" : "progress"}>{column}</StatusPill>
                  </td>
                  <td className={`${TD} text-ink-2`}>{card.note}</td>
                  <td className={TD_TIME}>{card.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}
