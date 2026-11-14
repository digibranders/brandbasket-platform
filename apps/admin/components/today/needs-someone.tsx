import type { Icon } from "@phosphor-icons/react";
import {
  Bug,
  ChatText,
  CheckCircle,
  CreditCard,
  EnvelopeSimple,
  Globe,
  GoogleLogo,
  HourglassMedium,
  Phone,
  PlugsConnected,
  Stack,
  UserPlus,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import { buttonSmall } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import {
  actionLabel,
  dueLabel,
  groupTodayQueue,
  type DueTone,
  type TodayItem,
  type TodayKind,
} from "@/lib/today-queue";

const ICONS: Readonly<Record<TodayKind, Icon>> = {
  payment: CreditCard,
  "add-on": Stack,
  overdue: HourglassMedium,
  due: HourglassMedium,
  "new-lead": EnvelopeSimple,
  request: ChatText,
  signup: UserPlus,
  error: Bug,
  delivery: PlugsConnected,
  kickoff: Phone,
  google: GoogleLogo,
  approved: CheckCircle,
  domain: Globe,
  unconfirmed_start: HourglassMedium,
};

const DUE_TONES: Readonly<Record<DueTone, string>> = {
  late: "font-semibold text-error",
  soon: "font-semibold text-rattan-ink",
  plain: "text-ink-2",
};

function groupHeadingLabel(heading: string): string {
  if (heading === "Overdue") return "Late items";
  if (heading === "Due today") return "Due today";
  if (heading === "Waiting for someone") return "Upcoming";
  return heading;
}

interface NeedsSomeoneProps {
  readonly items: readonly TodayItem[];
  readonly now: Date;
  readonly endOfToday: Date;
}

/** The single prioritized task list: Late items first, Due today, Upcoming. */
export function NeedsSomeone({ items, now, endOfToday }: NeedsSomeoneProps): ReactElement {
  return (
    <section aria-labelledby="needs-someone-title" className={LIFT}>
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
        <h2 id="needs-someone-title" className="font-display text-[0.9375rem] font-semibold text-ink">
          Needs someone
        </h2>
        <span className="font-sans text-xs font-semibold text-ink-2">Late items first</span>
      </div>
      {items.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Nothing needs someone right now"
            description="When tasks, client requests, or kickoff calls need attention, they will appear here in priority order."
          />
        </div>
      ) : (
        groupTodayQueue(items, now, endOfToday).map((group) => (
          <div key={group.heading} className="border-t border-line first-of-type:border-t-0">
            <div className="flex items-center justify-between bg-sunken/40 px-5 py-2">
              <h3 className="font-sans text-xs font-semibold text-ink-2">
                {groupHeadingLabel(group.heading)}
              </h3>
              <span className="font-figure text-xs text-ink-2 tabular-nums">
                {group.items.length}
              </span>
            </div>
            <ul>
              {group.items.map((item) => {
                const due = dueLabel(item.dueAt, now, endOfToday);
                const Mark = ICONS[item.kind];
                const isLate = due.tone === "late";
                return (
                  <li
                    key={item.key}
                    className="grid min-h-[44px] grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-line px-5 py-2.5 transition-colors first:border-t-0 hover:bg-sunken/30"
                  >
                    <Mark size={18} aria-hidden="true" className={isLate ? "text-error" : "text-ink-2"} />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.875rem] font-semibold text-ink">{item.title}</span>
                      {item.detail ? <span className="block truncate text-xs text-ink-2">{item.detail}</span> : null}
                    </span>
                    <span className={cn("whitespace-nowrap font-figure text-xs tabular-nums", DUE_TONES[due.tone])}>
                      {due.text}
                    </span>
                    <Link href={item.href} className={buttonSmall}>
                      {item.action ?? actionLabel(item.kind)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
