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
import { boardColumns, filterByBuilder, type BoardCard } from "@/lib/project-board";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { cn } from "@brandbasket/shared/lib/cn";

export const metadata: Metadata = { title: "Projects" };

interface ProjectsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function href(view: "board" | "list", builder: string | null): string {
  const params = new URLSearchParams();
  if (view === "list") params.set("view", "list");
  if (builder !== null) params.set("builder", builder);
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
  const now = new Date();
  const db = getStaffDb();
  const [rows, staff] = await Promise.all([listOpenProjectsForStaff(db, monthRange(now).start), listAssignableSupportStaff(db)]);
  const shown = filterByBuilder(rows, builder);
  const columns = boardColumns(shown, now);
  const cards = columns.flatMap((column) => column.cards.map((card) => ({ column: column.label, card })));
  const open = shown.filter((row) => row.status !== "live").length;
  const late = cards.filter(({ card }) => card.late).length;
  const dueToday = cards.filter(({ card }) => card.dueSoon).length;

  const viewOptions: FilterOption[] = [
    { href: href("board", builder), label: "Board", current: view === "board" },
    { href: href("list", builder), label: "List", current: view === "list" },
  ];
  const builderOptions: FilterOption[] = [
    { href: href(view, null), label: "Anyone", current: builder === null },
    { href: href(view, "none"), label: "No builder", current: builder === "none" },
    ...staff.map((person) => ({ href: href(view, person.userId), label: person.name, current: builder === person.userId })),
  ];

  return (
    <>
      <PageHeader title="Projects" meta={`${open} open · ${late} late · ${dueToday} due today`} />
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <FilterPills label="View" options={viewOptions} />
        <FilterPills label="Builder" options={builderOptions} />
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
        <table className={cn(TABLE, "mt-8")}>
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
      )}
    </>
  );
}
