import Link from "next/link";
import { formatOutOf } from "@/lib/format";
import { Badge, Icon, LinkButton, Meter, ServiceTag } from "@/ui";
import { cx } from "@/ui/cx";
import type { ChecklistRow } from "../rules-items";

export interface ChecklistRowsProps {
  readonly rows: readonly ChecklistRow[];
  /** False for a viewer: they see every item but get no Add button. */
  readonly canWrite: boolean;
}

/** The progress bar and the items, open ones first (the order rules-items gives). Each row opens its item at `?item=`. */
export function ChecklistRows({ rows, canWrite }: ChecklistRowsProps) {
  const done = rows.filter((row) => row.done).length;
  return (
    <>
      <div className="border-b border-border-subtle p-4">
        <Meter
          label="Add what you can now. Bring the rest to the call. Everything saves as you go."
          value={done}
          max={rows.length}
          valueText={`${formatOutOf(done, rows.length)} done`}
        />
      </div>
      <ul className="divide-y divide-border-subtle">
        {rows.map(({ item, done: isDone }) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3">
            {isDone ? (
              <Icon name="Check" className="text-pos-text" />
            ) : (
              <span aria-hidden className="size-4.5 shrink-0 rounded-full border border-border-control" />
            )}
            <Link href={`/checklist?item=${item.key}`} scroll={false} className="flex min-w-0 flex-1 flex-col gap-0.5 no-underline">
              <span className={cx("type-sub", isDone && "font-medium text-ink-3")}>{item.label}</span>
              <ServiceTag service={item.service} />
            </Link>
            {isDone ? (
              <Badge tone="pos">Done</Badge>
            ) : canWrite ? (
              <LinkButton href={`/checklist?item=${item.key}`} scroll={false} size="sm">
                Add
              </LinkButton>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
