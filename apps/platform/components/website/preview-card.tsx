import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { approvePreviewAction, askForChangesAction } from "@/app/app-host/(protected)/website/actions";
import { DARK_BUTTON, LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { previewHost } from "@/lib/website/address";
import type { ProgressView } from "@/lib/website/progress-view";
import { askAboutHref } from "@/lib/website/tabs";

const CHIP = "w-fit rounded-md bg-sunken px-2 py-0.5 text-xs font-semibold text-ink";
const TEXT_LINK = "w-fit text-[0.8125rem] font-semibold text-ink underline underline-offset-[3px]";

interface ProgressCardProps {
  readonly view: ProgressView;
  /** The picture of the current preview, or null when none was taken of it. */
  readonly pictureUrl: string | null;
  /** The preview link staff saved, or null. */
  readonly previewUrl: string | null;
  /** The site's address, or null when none is known yet. */
  readonly address: string | null;
  readonly businessName: string;
  /** The live site's address, only once it is live. */
  readonly liveHostname: string | null;
}

/** A browser window drawn with tokens: three dots and the preview's address, then the picture, or the site's name when there is none. */
function BrowserFrame({ pictureUrl, previewUrl, address, businessName }: Pick<ProgressCardProps, "pictureUrl" | "previewUrl" | "address" | "businessName">): ReactElement {
  return (
    <div className="overflow-hidden rounded-[0.625rem] bg-sunken">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-ink-2/40" />
        <span aria-hidden="true" className="size-2 rounded-full bg-ink-2/40" />
        <span aria-hidden="true" className="size-2 rounded-full bg-ink-2/40" />
        <span className="ml-2 min-w-0 truncate font-figure text-xs text-ink-2">{previewHost(previewUrl) ?? address}</span>
      </div>
      <div className="aspect-[16/10] bg-surface">
        {pictureUrl === null ? (
          <div className="grid h-full content-center gap-1 px-6">
            {address === null ? null : <p className="truncate font-figure text-xs text-ink-2">{address}</p>}
            <p className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{businessName}</p>
          </div>
        ) : (
          // The picture comes from our own authenticated route and is already sized; next/image would only add a second copy through its optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pictureUrl} alt="A picture of your new website" width={1280} height={800} loading="lazy" decoding="async" className="size-full object-cover object-top" />
        )}
      </div>
    </div>
  );
}

/** The raised card at the top of Progress: for a preview, the picture and the three buttons; otherwise a status, its line and at most one way forward. */
export function ProgressCard({ view, pictureUrl, previewUrl, address, businessName, liveHostname }: ProgressCardProps): ReactElement {
  const previewing = view.kind === "preview";
  const previewHref = previewUrl === null ? null : safeExternalHref(previewUrl);
  const liveHref = liveHostname === null ? null : safeExternalHref(`https://${liveHostname}`);
  return (
    <section aria-labelledby="progress-title" className={cn(LIFT, "grid content-start gap-4 p-5")}>
      {previewing ? <BrowserFrame pictureUrl={pictureUrl} previewUrl={previewUrl} address={address} businessName={businessName} /> : null}
      <div className="grid gap-2">
        {previewing ? <span className={CHIP}>Ready to check</span> : null}
        <h2 id="progress-title" className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
          {view.title}
        </h2>
        {view.line === null ? null : <p className="text-[0.84375rem] leading-relaxed text-ink-2">{view.line}</p>}
      </div>

      {view.kind === "setup" ? (
        <Link href="/onboarding" className={DARK_BUTTON}>
          Carry on setting up
        </Link>
      ) : null}

      {previewing ? (
        <>
          {previewHref === null ? null : (
            <a href={previewHref} target="_blank" rel="noopener noreferrer" className={DARK_BUTTON}>
              <ArrowSquareOut size={18} aria-hidden="true" />
              Open preview
            </a>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <form action={approvePreviewAction} className="grid">
              <button type="submit" className={cn(SOFT_BUTTON, "w-full")}>
                Approve
              </button>
            </form>
            <form action={askForChangesAction} className="grid">
              <button type="submit" className={cn(SOFT_BUTTON, "w-full")}>
                Ask for changes
              </button>
            </form>
          </div>
        </>
      ) : null}

      {view.kind === "revising" ? (
        <Link href="/requests" className={TEXT_LINK}>
          See what you asked for
        </Link>
      ) : null}

      {view.kind === "live" ? (
        <>
          {liveHref === null ? null : (
            <a href={liveHref} target="_blank" rel="noopener noreferrer" className={DARK_BUTTON}>
              <ArrowSquareOut size={18} aria-hidden="true" />
              Open your website
            </a>
          )}
          <Link href={askAboutHref("")} className={TEXT_LINK}>
            Ask for a change
          </Link>
        </>
      ) : null}
    </section>
  );
}
