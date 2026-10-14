"use client";

import Link from "next/link";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@fynix/shared/lib/cn";
import type { AttentionKind } from "@/lib/pipeline";
import { Avatar, ringFor } from "./avatar";
import { AttentionReason } from "./attention-reason";

/** One attention item, flattened for the trip from the server to this client component. */
export interface FocusItem {
  readonly key: string;
  readonly kind: AttentionKind;
  readonly subjectId: string;
  readonly href: string;
  readonly name: string;
  readonly reason: string;
  readonly at: string | null;
}

interface FocusModeProps {
  readonly greeting: ReactNode;
  readonly items: readonly FocusItem[];
  readonly paying: number;
  /** The map and the phone rows. */
  readonly children: ReactNode;
}

/**
 * The Journey header and its "need you" switch. Switching it on steps back everyone who doesn't need the team and
 * lists those who do in a glass strip above the dock, most urgent first. Esc, or the switch again, turns it off.
 */
export function FocusMode({ greeting, items, paying, children }: FocusModeProps): ReactElement {
  const [focused, setFocused] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (!focused) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setFocused(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  return (
    <div data-focus={focused ? "true" : "false"}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        {greeting}
        <div className="flex items-end gap-10">
          <button
            type="button"
            aria-pressed={focused}
            disabled={count === 0}
            onClick={() => setFocused((value) => !value)}
            className={cn(
              "group rounded-2xl px-3 py-2 text-right transition-colors duration-300 ease-calm disabled:cursor-default",
              focused ? "bg-ink text-paper" : "enabled:hover:bg-ink/5",
            )}
          >
            <span
              className={cn(
                "block font-serif text-[2.5rem] leading-none tracking-[-0.02em] tabular-nums",
                !focused && count > 0 && "text-accent",
                !focused && count === 0 && "text-ink-soft",
              )}
            >
              {count}
            </span>
            <span className={cn("mt-1 block text-sm font-medium", focused ? "text-paper/70" : "text-ink-soft")}>
              Need you
            </span>
          </button>
          <div className="px-3 py-2 text-right">
            <span className="block font-serif text-[2.5rem] leading-none tracking-[-0.02em] tabular-nums">{paying}</span>
            <span className="mt-1 block text-sm font-medium text-ink-soft">Paying</span>
          </div>
        </div>
      </div>

      {children}

      {focused ? (
        <div
          role="region"
          aria-label="Who needs you"
          className="glass focus-strip fixed inset-x-3 bottom-[6.25rem] z-40 rounded-3xl p-2 shadow-[0_24px_60px_-24px_rgba(42,13,16,0.6)] md:inset-x-auto md:bottom-[7.25rem] md:left-1/2 md:w-[min(52rem,calc(100vw-4rem))] md:-translate-x-1/2"
        >
          {/* Most urgent first; the strip scrolls sideways when there are more than fit. */}
          <ul className="flex gap-1 overflow-x-auto [scrollbar-width:thin]">
            {items.map((item) => (
              <li key={item.key} className="shrink-0">
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl py-2 pl-2 pr-4 transition-colors duration-300 ease-calm hover:bg-white/10"
                >
                  <Avatar id={item.subjectId} name={item.name} size="sm" ring={ringFor(item.kind)} ground="glass" />
                  <span className="min-w-0">
                    <span className="block max-w-[12rem] truncate text-sm font-semibold">{item.name}</span>
                    <span className="block whitespace-nowrap text-xs font-semibold text-gold">
                      <AttentionReason kind={item.kind} reason={item.reason} at={item.at} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
