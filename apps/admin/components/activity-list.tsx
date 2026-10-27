import type { ActivityRow } from "@brandbasket/db";
import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { EmptyLine } from "@/components/console/hairline-list";
import { TABLE, TD, TD_TIME, TH } from "@/components/console/table";

const ACTOR_LABELS: Readonly<Record<ActivityRow["actorKind"], string>> = {
  staff: "Staff",
  client: "Client",
  system: "System",
  provider: "Provider",
};

/** A business's history: when, what happened (with its result, when the action recorded one) and who did it. */
export function ActivityList({
  rows,
  staffNames,
}: {
  readonly rows: readonly ActivityRow[];
  /** Active staff by user id; a staff member not in it shows as "Staff". */
  readonly staffNames: ReadonlyMap<string, string>;
}): ReactElement {
  if (rows.length === 0) return <EmptyLine>Nothing recorded yet.</EmptyLine>;
  return (
    <table className={TABLE}>
      <thead>
        <tr>
          <th className={TH}>When</th>
          <th className={TH}>What happened</th>
          <th className={TH}>By</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className={TD_TIME}>
              <LocalDateTime iso={row.createdAt.toISOString()} variant="timestamp" />
            </td>
            <td className={TD}>
              {row.summary}
              {typeof row.data.result === "string" ? <span className="ml-2 text-xs text-ink-2">{row.data.result}</span> : null}
            </td>
            <td className={TD}>
              {row.actorKind === "staff" && row.actorId !== null ? (staffNames.get(row.actorId) ?? "Staff") : ACTOR_LABELS[row.actorKind]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
