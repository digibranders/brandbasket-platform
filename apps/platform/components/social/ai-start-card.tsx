"use client";

import { Check, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { startNextMonthAction, startSiteJobAction } from "@/app/app-host/(protected)/social/actions";
import { LIFT, SECTION_TITLE } from "@/components/v2/classes";
import { jobIsActive, jobLine, knownWordsForCode, type SiteJob } from "@/lib/social/ai";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_NAMES, websiteLabel, type AutoChannel, type ChannelPlatform } from "@/lib/social/auto";
import { ChannelLogo } from "./channel-logo";
import { DismissibleNotice } from "./dismissible-notice";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";

/** How often the page asks again while a batch is being written. */
const POLL_MS = 5000;

const FIELD = "h-10 w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink placeholder:text-ink-3";

interface AiStartCardProps {
  readonly jobs: readonly SiteJob[];
  /** The accounts connected so far: the networks to write for start as these, or as all of them when none is connected yet. */
  readonly channels: readonly AutoChannel[];
  /** The website social-auto has locked this business to: shown as text and never asked for again. Null before the first job. */
  readonly website?: string | null;
  /** The website given in setup: filled in for the customer to confirm while nothing is locked yet. */
  readonly savedWebsite?: string | null;
  /** True when the jobs could not be read: the card then says it cannot check, and does not invite a start that may already exist. */
  readonly unavailable?: boolean;
  /** How many written batches and pictures were put away because nobody decided within 14 days. */
  readonly expired?: { readonly batches: number; readonly pictures: number };
  /** Set when the customer's month is nearly over and the next one can be written: the Monday it would start. */
  readonly nextMonth?: { readonly startDate: string; readonly endsOn: string | null } | null;
}

/**
 * Where the posts written from the customer's website stand: an invitation to start, the batch being written, or how the last one
 * ended. Starting opens a window with the address (the whole website, or one page of it) and the networks to write for; no account
 * has to be connected yet, that comes before anything is booked. While a batch is being written the page asks again every few seconds.
 */
export function AiStartCard({ jobs, channels, website = null, savedWebsite = null, unavailable = false, expired = { batches: 0, pictures: 0 }, nextMonth = null }: AiStartCardProps): ReactElement | null {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = jobs.find(jobIsActive);
  const latest = jobs[0];
  const activeId = active?.id;

  // Ask again while something is being written, so the words move on their own and the result appears without a reload.
  useEffect(() => {
    if (activeId === undefined) return undefined;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, router]);

  const titleId = "ai-start-title";
  // Posts that are written need no card: looking them over is a button beside New post. What was put away for waiting too long still says so.
  if (active === undefined && latest !== undefined && latest.state === "done") {
    if (nextMonth !== null) return <NextMonthCard startDate={nextMonth.startDate} endsOn={nextMonth.endsOn} />;
    return expired.batches + expired.pictures === 0 ? null : (
      <DismissibleNotice id={`expired:${expired.batches}:${expired.pictures}`}>
        Some of your posts were put away because nobody decided within 14 days.{" "}
        <Link href="/social/review" className="underline">
          See what happened
        </Link>
      </DismissibleNotice>
    );
  }
  const connected = new Set<ChannelPlatform>(channels.map((channel) => channel.platform));
  const view = ((): { title: string; text: string; button: string | null } => {
    if (unavailable && jobs.length === 0) return { title: "We cannot check on your posts just now", text: "Try again in a few minutes. Nothing you did is lost.", button: null };
    if (active !== undefined) return { title: active.kind === "draw" ? "We are drawing your pictures" : "We are writing your posts", text: `${jobLine(active).replace(/\.$/, "")}. You can leave this page: they will be here when they are ready.`, button: null };
    if (latest === undefined) return { title: "Let us write your posts from your website", text: "Give us your website and we read it once, learn what you sell and how you sound, and write posts for each network. You look them over before anything is drawn or posted.", button: "Start from my website" };
    // Nothing is running and the latest job is not done (that returned above), so it failed.
    return { title: latest.kind === "draw" ? "We could not draw your pictures" : "We could not write your posts", text: knownWordsForCode(latest.failure) ?? `${jobLine(latest)} Check the address and try again.`, button: "Try again" };
  })();

  return (
    <section aria-labelledby={titleId} className={cn(LIFT, "grid gap-4 p-5")}>
      <div className="min-w-0">
        <h2 id={titleId} className={SECTION_TITLE}>
          {view.title}
        </h2>
        <p role={active === undefined ? undefined : "status"} className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">
          {view.text}
        </p>
      </div>
      {active === undefined ? null : (
        <div className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div className="h-full rounded-full bg-c-growth transition-[width] duration-500" style={{ width: `${Math.min(100, ((active.step ?? 1) / 4) * 100)}%` }} />
        </div>
      )}
      {view.button === null ? null : (
        <div>
          <button type="button" onClick={() => setOpen(true)} className={SMALL_SOFT}>
            {view.button}
          </button>
        </div>
      )}
      {open ? <StartDialog connected={connected} website={website} savedWebsite={savedWebsite} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

interface StartDialogProps {
  readonly connected: ReadonlySet<ChannelPlatform>;
  /** The website the business is locked to. When there is one the customer is never asked for it. */
  readonly website?: string | null;
  /** The website from setup, offered in the field while none is locked yet. */
  readonly savedWebsite?: string | null;
  readonly onClose: () => void;
}

/** The window that asks for the networks and how posts go out, and for the address only when none is known. Exported for its test. */
export function StartDialog({ connected, website = null, savedWebsite = null, onClose }: StartDialogProps): ReactElement {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"site" | "page">("site");
  const [typedSite, setTypedSite] = useState(savedWebsite ?? "");
  const [pageLink, setPageLink] = useState("");
  const [networks, setNetworks] = useState<ReadonlySet<ChannelPlatform>>(() => new Set(connected.size > 0 ? connected : CHANNEL_PLATFORMS));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // A locked website is the one every batch is written from, so the whole-website choice never asks for it. One page is always a link.
  const siteLocked = mode === "site" && website !== null;
  const address = mode === "page" ? pageLink : (website ?? typedSite);

  useEffect(() => {
    const window = dialog.current;
    if (window !== null && !window.open) window.showModal();
  }, []);

  const toggle = (platform: ChannelPlatform): void =>
    setNetworks((current) => {
      const next = new Set(current);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });

  const problem = address.trim() === "" ? (mode === "site" ? "Write your website address." : "Write the link to the page.") : networks.size === 0 ? "Choose at least one network." : null;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending || problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("site", address.trim());
        form.set("mode", mode);
        for (const platform of networks) form.append("network", platform);
        const result = await startSiteJobAction(form);
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setError("That did not work. Check your connection and try again.");
      }
    });
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="ai-start-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),34rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
    >
      <form onSubmit={submit} noValidate className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="ai-start-dialog-title" className="font-display text-[1.0625rem] font-semibold text-ink">
              Write posts from your website
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">We only read public pages, and we only write about what we find there.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={pending} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">What should we read</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["site", "My website", "Up to 12 topics"],
                ["page", "One page", "One post"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="peer sr-only" />
                <span className={cn("grid rounded-xl px-3 py-1.5 ring-1 ring-ink-2/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ink", mode === value ? "bg-ok-wash text-ink ring-ok" : "bg-surface text-ink")}>
                  <span className="text-[0.8125rem] font-semibold">{label}</span>
                  <span className="text-[0.6875rem] text-ink-3">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {siteLocked ? (
          <div className="grid gap-1">
            <p className="text-xs font-semibold text-ink-2">Your website</p>
            <p className="break-all text-[0.9375rem] font-semibold text-ink">{websiteLabel(website)}</p>
            <p className="text-xs text-ink-3">Your posts are always written from this website.</p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <label htmlFor="ai-start-address" className="text-xs font-semibold text-ink-2">
              {mode === "site" ? "Your website address" : "Link to the page"}
            </label>
            <input
              id="ai-start-address"
              type="text"
              inputMode="url"
              autoComplete="url"
              value={address}
              onChange={(event) => (mode === "page" ? setPageLink : setTypedSite)(event.target.value)}
              placeholder={mode === "site" ? "yourbusiness.in" : "yourbusiness.in/diwali-gift-boxes"}
              aria-invalid={error !== null && address.trim() === ""}
              className={FIELD}
            />
            <p className="text-xs text-ink-3">{mode === "site" ? "We keep the first website you give us for your posts." : "Use this for one product, offer or announcement."}</p>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-ink-2">Write for</legend>
          <div className="flex flex-wrap gap-2.5">
            {CHANNEL_PLATFORMS.map((platform) => {
              const on = networks.has(platform);
              return (
                <label key={platform} title={PLATFORM_NAMES[platform]} className="relative cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => toggle(platform)} className="peer sr-only" />
                  <span className={cn("block rounded-xl ring-2 ring-offset-2 ring-transparent transition peer-focus-visible:ring-ink", !on && "opacity-40")}>
                    <ChannelLogo platform={platform} medium />
                  </span>
                  {on ? (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-ok text-white">
                      <Check size={10} weight="bold" />
                    </span>
                  ) : null}
                  <span className="sr-only">{PLATFORM_NAMES[platform]}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-3">You do not need to connect an account yet. You do that before anything is booked.</p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">How should posts go out</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="cursor-pointer">
              <input type="radio" name="approval" value="manual" checked readOnly className="peer sr-only" />
              <span className="grid h-full gap-0.5 rounded-xl bg-ok-wash px-3 py-2 text-ink ring-1 ring-ok peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2">
                <span className="text-[0.8125rem] font-semibold">I approve every post first</span>
                <span className="text-[0.6875rem] leading-snug text-ink-2">Nothing goes out until you say yes to its words and its picture.</span>
              </span>
            </label>
            <label aria-disabled="true" className="cursor-not-allowed">
              <input type="radio" name="approval" value="automatic" disabled className="peer sr-only" />
              <span className="grid h-full gap-0.5 rounded-xl bg-surface px-3 py-2 text-ink-3 ring-1 ring-ink-2/30">
                <span className="text-[0.8125rem] font-semibold">Post automatically</span>
                <span className="text-[0.6875rem] leading-snug">Not available yet. We switch this on once you have approved a few posts yourself.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {error === null ? null : (
          <p role="alert" className="text-[0.84375rem] font-semibold text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="submit" disabled={pending} className={SMALL_DARK}>
            {pending ? "Starting" : mode === "site" ? "Read my website" : "Read this page"}
          </button>
          <button type="button" onClick={onClose} disabled={pending} className={SMALL_SOFT}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** The customer's month is nearly over: one button writes the next one from the same website, for the networks connected now. */
function NextMonthCard({ startDate, endsOn }: { readonly startDate: string; readonly endsOn: string | null }): ReactElement {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const start = (): void => {
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("startDate", startDate);
      const result = await startNextMonthAction(form);
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  };
  const monday = dayLabel(startDate, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section aria-labelledby="next-month-title" className={cn(LIFT, "grid gap-4 p-5")}>
      <div className="min-w-0">
        <h2 id="next-month-title" className={SECTION_TITLE}>
          Write your next month
        </h2>
        <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">
          {endsOn === null ? "Your posts are nearly all out." : `Your posts run until ${dayLabel(endsOn, { day: "numeric", month: "long" })}.`} We can write the next month from your website now. It starts on {monday}. You look the posts over before anything is drawn or posted.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={start} className={SMALL_DARK}>
          {pending ? "Starting" : "Write my next month"}
        </button>
        {error === null ? null : (
          <p role="alert" className="text-[0.84375rem] font-semibold text-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
