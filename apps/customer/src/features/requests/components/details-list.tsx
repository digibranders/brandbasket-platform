import type { ReactNode } from "react";

/** Label and value pairs, one to a line. */
export function DetailsList({ rows }: { readonly rows: readonly (readonly [label: string, value: ReactNode])[] }) {
  return (
    <dl className="m-0 flex flex-col gap-2 type-body">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-4">
          <dt className="w-32 shrink-0 text-ink-3">{label}</dt>
          <dd className="m-0 min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
