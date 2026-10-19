import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

/*
 * Online vs added by the clinic: one bar split in two, with the counts and shares printed beside the key, since two
 * numbers read faster than any chart of them. Inline SVG in percentages of its width, so it fills any container;
 * `role="img"` with a one-line summary, and a visually hidden table with the same numbers.
 */

interface ReportSplitBarProps {
  readonly online: number;
  readonly clinic: number;
}

const BAR_HEIGHT = 12;
/** The clip path's id: the Reports page shows one split bar, so a fixed id cannot collide. */
const CLIP_ID = "report-split-bar-clip";

function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function ReportSplitBar({ online, clinic }: ReportSplitBarProps): ReactElement {
  const total = online + clinic;
  const onlineWidth = total === 0 ? 0 : (online / total) * 100;
  const parts = [
    { label: "Online", value: online, swatch: "bg-accent" },
    { label: "Added by the clinic", value: clinic, swatch: "bg-gold-deep" },
  ] as const;
  const summary = `${String(online)} booked online (${String(share(online, total))}%), ${String(clinic)} added by the clinic (${String(share(clinic, total))}%).`;

  return (
    <div>
      <svg role="img" aria-label={summary} width="100%" height={BAR_HEIGHT} className="block">
        <defs>
          <clipPath id={CLIP_ID}>
            <rect x="0" y="0" width="100%" height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${CLIP_ID})`}>
          <rect x="0" y="0" width="100%" height={BAR_HEIGHT} className="fill-gold-deep" />
          <rect x="0" y="0" width={`${String(onlineWidth)}%`} height={BAR_HEIGHT} className="fill-accent" />
          {online > 0 && clinic > 0 ? (
            <line x1={`${String(onlineWidth)}%`} x2={`${String(onlineWidth)}%`} y1="0" y2={BAR_HEIGHT} className="stroke-paper" strokeWidth={2} />
          ) : null}
        </g>
      </svg>
      <dl aria-hidden="true" className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
        {parts.map((part) => (
          <div key={part.label} className="flex flex-col-reverse">
            <dt className="flex items-center gap-2 text-sm text-ink-soft">
              <span className={cn("size-2.5 rounded-sm", part.swatch)} />
              {part.label}
            </dt>
            <dd className="heading-display text-3xl text-ink tabular-nums">
              {part.value}
              <span className="ml-2 text-sm font-normal text-ink-soft">{share(part.value, total)}%</span>
            </dd>
          </div>
        ))}
      </dl>
      <table className="sr-only">
        <caption>Bookings by how they were made</caption>
        <thead>
          <tr>
            <th scope="col">Made</th>
            <th scope="col">Bookings</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.label}>
              <th scope="row">{part.label}</th>
              <td>{part.value}</td>
              <td>{share(part.value, total)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
