"use client";

import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { PUBLISH_STATE_LABELS, type BlogPublishState } from "@/lib/blog-publish-state";
import { CaretGlyph } from "./icons";

/** Small building blocks the post list and the post editor share. */

export const INPUT_CLASS =
  "block w-full rounded-control border border-ink-2/65 bg-card px-3.5 py-2.5 text-[0.9375rem] text-ink transition-colors duration-200 ease-calm placeholder:text-ink-2 hover:border-ink-2 focus:border-ink focus:outline-none";

const STATE_TONES: Readonly<Record<BlogPublishState, string>> = {
  draft: "bg-sunken text-ink-2",
  scheduled: "bg-rattan-wash text-rattan-ink",
  published: "bg-sage-wash text-sage-deep",
};

/** A post's status as a soft chip with its word: a draft is grey, a scheduled post amber, a published one green. No outline. */
export function StatusPill({ state }: { readonly state: BlogPublishState }): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold leading-5",
        STATE_TONES[state],
      )}
    >
      {PUBLISH_STATE_LABELS[state]}
    </span>
  );
}

function subscribe(): () => void {
  return () => undefined;
}

/** False on the server and during hydration, true straight after: dates switch to the reader's own zone then. */
export function useInBrowser(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...SHORT_DATE, hour: "numeric", minute: "2-digit", hour12: true };

/** "30 Sep 2026" (or with the time), in the reader's zone once in the browser; UTC before that. */
export function PostDate({ time, withTime = false }: { readonly time: number; readonly withTime?: boolean }): ReactElement {
  const inBrowser = useInBrowser();
  const options = withTime ? DATE_TIME : SHORT_DATE;
  const text = new Intl.DateTimeFormat("en-GB", inBrowser ? options : { ...options, timeZone: "UTC" }).format(time);
  return <time dateTime={new Date(time).toISOString()}>{text}</time>;
}

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function relativeTime(time: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** A labelled group in the editor's sidebar, open or collapsible. Separated by hairlines, not boxes. */
export function SidebarSection({
  title,
  aside,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  readonly title: string;
  /** A short status on the right of the heading: "85", "Index", "2 changes". */
  readonly aside?: ReactNode;
  readonly collapsible?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const heading = (
    <>
      <span className="text-[0.8125rem] font-semibold text-ink">{title}</span>
      <span className="ml-auto flex items-center gap-2 text-xs text-ink-soft">
        {aside}
        {collapsible ? (
          <CaretGlyph className="size-3.5 transition-transform duration-200 ease-calm group-open:rotate-180" />
        ) : null}
      </span>
    </>
  );

  if (!collapsible) {
    return (
      <section className="border-b border-line/70 py-5 first:pt-0 last:border-b-0">
        <h2 className="flex items-center gap-2">{heading}</h2>
        <div className="mt-3">{children}</div>
      </section>
    );
  }

  return (
    <details className="group border-b border-line/70 py-4 first:pt-0 last:border-b-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        {heading}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** "59 / 70", turning burgundy past the limit. */
export function Counter({ value, max, id }: { readonly value: number; readonly max: number; readonly id?: string }): ReactElement {
  return (
    <span id={id} className={cn("text-[0.6875rem] tabular-nums", value > max ? "font-semibold text-accent-deep" : "text-ink-soft")}>
      {value} / {max}
    </span>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  aside,
}: {
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly aside?: ReactNode;
}): ReactElement {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-semibold text-ink">
        {children}
      </label>
      {aside === undefined ? null : <span className="ml-auto flex items-center gap-2">{aside}</span>}
    </div>
  );
}

/** A small on/off switch with its label. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-calm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-highlight-deep",
          checked ? "bg-ink" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-card shadow-sm transition-transform duration-200 ease-calm",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint === undefined ? null : <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

/** The small "Auto" tick beside a field that can follow a default. */
export function AutoToggle({
  checked,
  onChange,
  label,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** For screen readers: "Search title follows the post title". */
  readonly label: string;
}): ReactElement {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[0.6875rem] font-medium text-ink-soft" title={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="size-3.5 accent-accent"
      />
      Auto
    </label>
  );
}
