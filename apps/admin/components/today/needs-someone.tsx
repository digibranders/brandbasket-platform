import type { Icon } from "@phosphor-icons/react";
import { Bug, ChatText, CreditCard, EnvelopeSimple, HourglassMedium, Stack, UserPlus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { buttonSmall } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import { actionLabel, dueLabel, type DueTone, type TodayItem, type TodayKind } from "@/lib/today-queue";

const ICONS: Readonly<Record<TodayKind, Icon>> = {
  payment: CreditCard,
  "add-on": Stack,
  overdue: HourglassMedium,
  due: HourglassMedium,
  "new-lead": EnvelopeSimple,
  request: ChatText,
  signup: UserPlus,
  error: Bug,
};

const DUE_TONES: Readonly<Record<DueTone, string>> = {
  late: "font-semibold text-error",
  soon: "font-semibold text-rattan-ink",
  plain: "text-ink-2",
};

interface NeedsSomeoneProps {
  readonly items: readonly TodayItem[];
  readonly now: Date;
  readonly endOfToday: Date;
}

/** The queue: the page's one raised surface. Each row says what, how late, and one button. */
export function NeedsSomeone({ items, now, endOfToday }: NeedsSomeoneProps): ReactElement {
  return (
    <section aria-labelledby="needs-someone-title" className={LIFT}>
      <h2
        id="needs-someone-title"
        className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 font-display text-[0.9375rem] font-semibold text-ink"
      >
        Needs someone
        <span className="font-sans text-xs font-semibold text-ink-2">Late first</span>
      </h2>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-2">Nothing needs anyone right now.</p>
      ) : (
        <ul>
          {items.map((item) => {
            const due = dueLabel(item.dueAt, now, endOfToday);
            const Mark = ICONS[item.kind];
            return (
              <li
                key={item.key}
                className="grid grid-cols-[1.375rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0"
              >
                <Mark size={18} aria-hidden="true" className={due.tone === "late" ? "text-error" : "text-ink-2"} />
                <span className="min-w-0">
                  <span className="block truncate text-[0.84375rem] font-semibold text-ink">{item.title}</span>
                  <span className="block truncate text-xs text-ink-2">{item.detail}</span>
                </span>
                <span className={cn("whitespace-nowrap font-figure text-xs", DUE_TONES[due.tone])}>{due.text}</span>
                <Link href={item.href} className={buttonSmall}>
                  {actionLabel(item.kind)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
