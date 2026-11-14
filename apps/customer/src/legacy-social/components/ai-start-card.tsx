"use client";

import { Check, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { startNextMonthAction, startSiteJobAction } from "@/legacy-social/actions";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import { jobIsActive, jobLine, knownWordsForCode, type SiteJob } from "@/legacy-social/lib/social/ai";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_NAMES, websiteLabel, type AutoChannel, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { AUTO_POSTING_CONSENT, AUTO_SAFETY_HOURS } from "@/legacy-social/lib/social/auto-posting";
import { dayGroups, type PostingDays } from "@/legacy-social/lib/social/schedule";
import { ChannelLogo } from "./channel-logo";
import { DismissibleNotice } from "./dismissible-notice";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";

/** How often the page asks again while a batch is being written. */
const POLL_MS = 5000;

/** Whether two website addresses are the same website: the scheme, a leading "www.", the case and a trailing slash do not matter. */
const sameWebsite = (a: string, b: string): boolean => {
  const clean = (value: string): string => value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return clean(a) === clean(b);
};

const FIELD = "h-10 w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink placeholder:text-ink-3";

interface AiStartCardProps {
  readonly jobs: readonly SiteJob[];
  /** The accounts connected so far: the networks to write for start as these, or as all of them when none is connected yet. */
  readonly channels: readonly Pick<AutoChannel, "platform">[];
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
  /** The days each channel posts on, or null when the posting service cannot say. Channels with different days are written one group at a time. */
  readonly postingDays?: PostingDays | null;
}

/**
 * Where the posts written from the customer's website stand: an invitation to start, the batch being written, or how the last one
 * ended. Starting opens a window with the address (the whole website, or one page of it) and the networks to write for; no account
 * has to be connected yet, that comes before anything is booked. While a batch is being written the page asks again every few seconds.
 */
export function AiStartCard({ jobs, channels, website = null, savedWebsite = null, unavailable = false, expired = { batches: 0, pictures: 0 }, nextMonth = null, postingDays = null }: AiStartCardProps): ReactElement | null {
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
    <section aria-labelledby={titleId} className={cn(LIFT, "grid gap-3 p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <h2 id={titleId} className={SECTION_TITLE}>
            {view.title}
          </h2>
          <p role={active === undefined ? undefined : "status"} className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">
            {view.text}
          </p>
        </div>
        {view.button === null ? null : (
          <button type="button" onClick={() => setOpen(true)} className={SMALL_DARK}>
            {view.button}
          </button>
        )}
      </div>
      {active === undefined ? null : (
        <div className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div className="h-full rounded-full bg-c-growth transition-[width] duration-500" style={{ width: `${Math.min(100, ((active.step ?? 1) / 4) * 100)}%` }} />
        </div>
      )}
      {open ? <StartDialog connected={connected} postingDays={postingDays} website={website} savedWebsite={savedWebsite} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

interface StartDialogProps {
  readonly connected: ReadonlySet<ChannelPlatform>;
  /** The website the business is locked to. When there is one the customer is never asked for it. */
  readonly website?: string | null;
  /** The website from setup, offered in the field while none is locked yet. */
  readonly savedWebsite?: string | null;
  /** The days each channel posts on; channels with different days cannot be written together. */
  readonly postingDays?: PostingDays | null;
  /** The Monday the posts start on, `YYYY-MM-DD`, so a further channel's batch covers the same weeks as the first; left out for the next Monday. */
  readonly startDate?: string | null;
  readonly onClose: () => void;
}

/** The window that asks for the networks and how posts go out, and for the address only when none is known. Exported for its test. */
export function StartDialog({ connected, postingDays = null, startDate = null, website = null, savedWebsite = null, onClose }: StartDialogProps): ReactElement {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"site" | "page">("site");
  const [typedSite, setTypedSite] = useState(website ?? savedWebsite ?? "");
  const [pageLink, setPageLink] = useState("");
  const groups = dayGroups([...connected], postingDays);
  const [networks, setNetworks] = useState<ReadonlySet<ChannelPlatform>>(() => new Set(connected.size > 0 ? (groups[0] ?? connected) : CHANNEL_PLATFORMS));
  const groupOf = (platform: ChannelPlatform): number => groups.findIndex((group) => group.includes(platform));
  const mixedDays = new Set([...networks].map(groupOf).filter((index) => index >= 0)).size > 1;
  const [approval, setApproval] = useState<"manual" | "automatic">("manual");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The website on file is filled in for her to keep or change; she is never made to type it again, and never stopped from editing it.
  const address = mode === "page" ? pageLink : typedSite;
  const changedSite = mode === "site" && website !== null && address.trim() !== "" && !sameWebsite(address, website);

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

  /** Only a channel that is connected can be automatic. */
  const canAuto = [...networks].some((platform) => connected.has(platform));
  const problem = approval === "automatic" && !agreed ? "Tick the box to agree to automatic posting, or choose to approve every post." : approval === "automatic" && !canAuto ? "Connect an account first to post automatically." : address.trim() === "" ? (mode === "site" ? "Write your website address." : "Write the link to the page.") : networks.size === 0 ? "Choose at least one network." : mixedDays ? "These channels post on different days, so write them one at a time." : null;

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
        if (startDate !== null) form.set("startDate", startDate);
        for (const platform of networks) form.append("network", platform);
        form.set("approval", approval);
        if (approval === "automatic") {
          form.set("hours", String(AUTO_SAFETY_HOURS));
          form.set("agreed", "yes");
        }
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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),34rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-dialog backdrop:bg-scrim"
    >
      <form onSubmit={submit} noValidate className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="ai-start-dialog-title" className="type-section text-ink">
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
          <p className="text-xs text-ink-3">
            {mode === "page"
              ? "Use this for one product, offer or announcement."
              : website === null
                ? "We keep the first website you give us for your posts."
                : "This is the website your posts are written from. You can change it here."}
          </p>
          {changedSite ? <p className="text-xs font-semibold text-warn">This is not the website we have on file ({websiteLabel(website)}). We may need to update it before your posts can be written from it.</p> : null}
        </div>

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
                    <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-ok text-surface">
                      <Check size={10} weight="bold" />
                    </span>
                  ) : null}
                  <span className="sr-only">{PLATFORM_NAMES[platform]}</span>
                </label>
              );
            })}
          </div>
          {groups.length > 1 ? (
            <p className="mt-2 text-xs text-ink-3">
              Your channels post on different days, so they are written one group at a time. Start with this one, then start {groups.slice(1).map((group) => group.map((platform) => PLATFORM_NAMES[platform]).join(" and ")).join(", then ")} once these posts are written.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-ink-3">You do not need to connect an account yet. You do that before anything is booked.</p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">How should posts go out</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="cursor-pointer">
              <input type="radio" name="approval" value="manual" checked={approval === "manual"} onChange={() => setApproval("manual")} className="peer sr-only" />
              <span className={cn("grid h-full gap-0.5 rounded-xl px-3 py-2 text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2", approval === "manual" ? "bg-ok-wash ring-1 ring-ok" : "bg-surface ring-1 ring-ink-2/30")}>
                <span className="text-[0.8125rem] font-semibold">I approve every post first</span>
                <span className="text-[0.6875rem] leading-snug text-ink-2">Nothing goes out until you say yes to its words and its picture.</span>
              </span>
            </label>
            <label className={canAuto ? "cursor-pointer" : "cursor-not-allowed"} aria-disabled={!canAuto}>
              <input type="radio" name="approval" value="automatic" checked={approval === "automatic"} disabled={!canAuto} onChange={() => setApproval("automatic")} className="peer sr-only" />
              <span className={cn("grid h-full gap-0.5 rounded-xl px-3 py-2 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2", approval === "automatic" ? "bg-ok-wash text-ink ring-1 ring-ok" : canAuto ? "bg-surface text-ink ring-1 ring-ink-2/30" : "bg-surface text-ink-3 ring-1 ring-ink-2/30")}>
                <span className="text-[0.8125rem] font-semibold">Post automatically</span>
                <span className="text-[0.6875rem] leading-snug text-ink-2">{canAuto ? "We approve the pictures that pass our checks as soon as they are drawn. You can still reject any post until it goes out." : "Connect an account for one of these channels first."}</span>
              </span>
            </label>
          </div>
          {approval !== "automatic" ? null : (
            <div className="mt-2 grid gap-3 rounded-xl bg-sunken p-3">
              <p className="text-xs text-ink-3">It applies to the connected channels above. Carousels, topics you ask for yourself, and anything our checks flag stay with you.</p>
              <label className="flex cursor-pointer items-start gap-3 text-[0.78125rem] text-ink-2">
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 size-4 shrink-0" />
                <span>{AUTO_POSTING_CONSENT}</span>
              </label>
            </div>
          )}
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
  const [notice, setNotice] = useState<string | null>(null);
  const start = (): void => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("startDate", startDate);
      const result = await startNextMonthAction(form);
      if (result.status === "error") setError(result.message);
      else {
        // A customer whose channels post on different days has one group started: say which, and that the others follow.
        if (result.status === "partial") setNotice(result.message);
        router.refresh();
      }
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
        {notice === null ? null : <p className="text-[0.84375rem] font-semibold text-ok">{notice}</p>}
      </div>
    </section>
  );
}
