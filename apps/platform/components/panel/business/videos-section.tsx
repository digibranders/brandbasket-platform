"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { VIDEO_MAX_SECONDS, VIDEO_UPLOAD_TYPES, vimeoEmbedUrl } from "@firstfold/shared/lib/directory/videos";
import { LockIcon, PlusIcon } from "@firstfold/shared/ui/icons";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { StatusLine } from "@/components/panel/status-line";
import { readVideoSeconds, uploadListingVideo, videoFileProblem, videoLengthProblem, waitForVideo, type VideoUploadProgress } from "@/lib/uploads/video-upload-client";
import { formatVideoDuration, videoStatusText, type VideosView, type VideoTile } from "@/lib/videos-view";

/*
 * A Premium member's short videos on the Photos tab (docs/superpowers/specs/2026-10-07-business-videos-design.md): three
 * places, each a clip of up to 16 seconds. A free listing account sees why they are missing and where to get them; a
 * member without a listing is told to add it first. A chosen file is checked in the browser (size, type, length) before
 * anything is sent, then goes straight to Vimeo with a progress bar, and Vimeo gets it ready (a minute or two) before it is
 * live on the page. A video that is being got ready keeps being asked about, even after the page is reloaded.
 */

interface VideosSectionProps {
  readonly view: VideosView;
  /** False once staff have taken the business down: it can look but not add. */
  readonly canChange: boolean;
  /** A form action that removes the video in the posted `slot` and redirects back with a notice. */
  readonly removeAction: (formData: FormData) => Promise<void>;
  /** A form action that puts the posted `video` in the mosaic at the top of the page (`featured` 1) or takes it out (0). */
  readonly featureAction: (formData: FormData) => Promise<void>;
  /** Where a free listing account upgrades. */
  readonly premiumHref: string;
  /** Where a member adds the listing its videos show on. */
  readonly listingHref: string;
}

const ACCEPTED_TYPES = VIDEO_UPLOAD_TYPES.join(",");
const PICKER =
  "inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors duration-300 ease-calm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-highlight-deep hover:bg-accent-deep has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55";
const REMOVE = "rounded-full px-3 py-2 text-sm text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink disabled:opacity-40";
const FEATURE =
  "rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors duration-300 ease-calm hover:border-ink disabled:opacity-40";
const FRAME = "relative aspect-video w-full overflow-hidden rounded-[14px] bg-paper-deep";

function PlayGlyph({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function progressText(progress: VideoUploadProgress): string {
  return progress.phase === "sending" ? `Sending… ${String(Math.round(progress.fraction * 100))}%` : "Getting it ready. This takes a minute or two.";
}

/** The player address with autoplay, built with the URL API so the hash and options survive. */
function playingSrc(vimeoId: string, hash: string): string {
  const url = new URL(vimeoEmbedUrl(vimeoId, hash));
  url.searchParams.set("autoplay", "1");
  return url.toString();
}

interface VideoTileCardProps {
  readonly tile: VideoTile;
  readonly canChange: boolean;
  readonly removeAction: (formData: FormData) => Promise<void>;
  readonly featureAction: (formData: FormData) => Promise<void>;
}

function VideoTileCard({ tile, canChange, removeAction, featureAction }: VideoTileCardProps): ReactElement {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<VideoUploadProgress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  /** False once the owner has left the page: work that finishes after that must not touch where they went. */
  const onPage = useRef(true);
  /** The video being waited for after a reload, so it is asked about once however often the tile renders. */
  const watching = useRef<string | null>(null);
  const { video, slot, pending } = tile;
  const busy = checking || progress !== null;
  const headingId = `video-slot-${String(slot)}`;

  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);

  function refresh(): void {
    // A notice left in the address by an earlier action ("Removed.") is dropped with it: it is no longer the news.
    const params = new URLSearchParams(window.location.search);
    if (!params.has("notice")) router.refresh();
    else {
      params.delete("notice");
      const rest = params.toString();
      router.replace(rest === "" ? window.location.pathname : `${window.location.pathname}?${rest}`);
    }
  }

  // An upload that was on its way when the page loaded: keep asking until Vimeo has it ready, then show it.
  useEffect(() => {
    if (pending === null || busy || watching.current === pending.id) return;
    watching.current = pending.id;
    void waitForVideo(pending.id, () => undefined).then((result) => {
      if (!onPage.current) return;
      if (!result.ok) setProblem(result.message);
      refresh();
    });
    // `refresh` only reads the address and the router, which do not change what this should wait for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id, busy]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    // Cleared, so choosing the same file again after a refusal still starts a check.
    event.target.value = "";
    if (file === null) return;
    setProblem(null);
    setPlaying(false);

    const fileProblem = videoFileProblem(file);
    if (fileProblem !== null) {
      setProblem(fileProblem);
      return;
    }
    setChecking(true);
    const lengthProblem = videoLengthProblem(await readVideoSeconds(file));
    if (!onPage.current) return;
    setChecking(false);
    if (lengthProblem !== null) {
      setProblem(lengthProblem);
      return;
    }
    setProgress({ phase: "sending", fraction: 0 });
    const result = await uploadListingVideo(file, slot, (next) => {
      if (onPage.current) setProgress(next);
    });
    if (!onPage.current) return;
    setProgress(null);
    setProblem(result.ok ? null : result.message);
    refresh();
  }

  const status = videoStatusText(tile.state);
  return (
    <li aria-labelledby={headingId} className="grid content-start gap-3">
      <h3 id={headingId} className="text-[0.8125rem] font-medium text-ink-soft">
        Video {slot}
      </h3>

      <div className={FRAME}>
        {video === null ? (
          <span className="grid size-full place-items-center text-ink-soft/55">
            <PlusIcon className="size-5" />
          </span>
        ) : playing && video.vimeoHash !== null ? (
          <iframe
            src={playingSrc(video.vimeoId, video.vimeoHash)}
            title={`Video ${String(slot)}`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full border-0 bg-ink"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            disabled={video.vimeoHash === null}
            className="group absolute inset-0 block size-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-highlight-deep"
          >
            {/* The poster is Vimeo's own image on its own host: the image optimiser would only fetch it through our server. */}
            {video.posterUrl === null ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.posterUrl} alt="" width={video.width ?? 640} height={video.height ?? 360} className="size-full object-cover" />
            )}
            <span className="absolute inset-0 grid place-items-center bg-ink/20 transition-colors duration-300 ease-calm group-hover:bg-ink/35">
              <span className="grid size-11 place-items-center rounded-full bg-paper/95 text-ink">
                <PlayGlyph className="size-5" />
              </span>
            </span>
            {video.durationMs === null ? null : (
              <span className="absolute right-2 bottom-2 rounded-md bg-ink/75 px-1.5 py-0.5 text-[0.75rem] font-medium text-paper">
                {formatVideoDuration(video.durationMs)}
              </span>
            )}
            <span className="sr-only">Play video {slot}</span>
          </button>
        )}
      </div>

      {status === "" ? null : <StatusLine tone={tile.state === "live" ? "done" : "waiting"}>{status}</StatusLine>}

      <div className="flex flex-wrap items-center gap-2">
        {canChange ? (
          <label className={PICKER}>
            {video === null && pending === null ? "Add video" : "Replace"}
            <input type="file" accept={ACCEPTED_TYPES} disabled={busy} onChange={(event) => void handleFile(event)} className="sr-only" />
          </label>
        ) : null}
        {video === null && pending === null ? null : (
          <form action={removeAction}>
            <input type="hidden" name="slot" value={slot} />
            <button type="submit" disabled={busy} className={REMOVE}>
              Remove<span className="sr-only"> video {slot}</span>
            </button>
          </form>
        )}
      </div>

      {video === null || !canChange ? null : (
        <form action={featureAction} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input type="hidden" name="video" value={video.id} />
          <input type="hidden" name="featured" value={video.featured ? "0" : "1"} />
          {video.featured ? <span className="text-sm font-medium text-ink">Shown at the top of your page</span> : null}
          <button type="submit" disabled={busy} className={video.featured ? REMOVE : FEATURE}>
            {video.featured ? "Don't show at top" : "Show at top of page"}
            <span className="sr-only"> (video {slot})</span>
          </button>
        </form>
      )}

      <div aria-live="polite" className="text-sm text-ink-soft empty:hidden">
        {checking ? "Checking your video…" : progress === null ? "" : progressText(progress)}
      </div>
      {progress?.phase === "sending" ? (
        <div role="progressbar" aria-label={`Sending video ${String(slot)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)} className="h-1 overflow-hidden rounded-full bg-paper-deep">
          <div className="h-full bg-accent transition-[width] duration-300 ease-calm" style={{ width: `${String(Math.round(progress.fraction * 100))}%` }} />
        </div>
      ) : null}

      {problem === null ? null : (
        <p role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {problem}
        </p>
      )}
    </li>
  );
}

const SECTION = "mt-12 border-t border-line pt-6";

export function VideosSection({ view, canChange, removeAction, featureAction, premiumHref, listingHref }: VideosSectionProps): ReactElement {
  const intro = `Up to 3 videos of ${String(VIDEO_MAX_SECONDS)} seconds each, played on your page. Pick one to show among the photos at the top.`;

  if (view.kind === "locked") {
    return (
      <section aria-labelledby="videos-title" className={SECTION}>
        <h2 id="videos-title" className="panel-section">
          Short videos
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">{intro}</p>
        <div className="mt-5 flex max-w-xl flex-wrap items-center gap-4 rounded-[14px] bg-paper-deep px-5 py-4">
          <LockIcon className="size-5 shrink-0 text-ink-soft" />
          <p className="min-w-0 flex-1 text-[0.9375rem] text-ink">Videos are part of Premium.</p>
          <ButtonLink href={premiumHref} variant="secondary" size="sm">
            See Premium
          </ButtonLink>
        </div>
      </section>
    );
  }

  if (view.kind === "needs-listing") {
    return (
      <section aria-labelledby="videos-title" className={SECTION}>
        <h2 id="videos-title" className="panel-section">
          Short videos
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-soft">{intro}</p>
        <p className="mt-5 max-w-xl text-sm text-ink-soft">
          Add your listing first, so there is a page for your videos to show on.{" "}
          <a href={listingHref} className="font-medium text-ink underline underline-offset-4">
            Go to Listing
          </a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="videos-title" className={SECTION}>
      <h2 id="videos-title" className="panel-section">
        Short videos
      </h2>
      <p className="mt-1 max-w-xl text-sm text-ink-soft">{intro}</p>
      <ul className="mt-5 grid gap-6 sm:grid-cols-3">
        {view.tiles.map((tile) => (
          <VideoTileCard key={tile.slot} tile={tile} canChange={canChange} removeAction={removeAction} featureAction={featureAction} />
        ))}
      </ul>
    </section>
  );
}
