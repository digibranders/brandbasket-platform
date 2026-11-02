import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { StatusWord } from "@/components/home/status-word";
import { DARK_BUTTON, LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { previewHost } from "@/lib/website/address";
import type { ChangesView, InProgressRow, VersionRow } from "@/lib/website/history";
import { askAboutHref } from "@/lib/website/tabs";
import { PreviewApprove } from "./preview-approve";
import { PreviewFeedback } from "./preview-feedback";

const TEXT_LINK = "w-fit text-[0.9375rem] font-semibold text-ink underline underline-offset-[3px]";

interface PreviewCardProps {
  /** Every version we sent, newest first. */
  readonly rows: readonly VersionRow[];
  /** The version being made, while changes are in progress. */
  readonly inProgress: InProgressRow | null;
  /** The last round of changes the customer sent, or null when there is none. */
  readonly changes: ChangesView | null;
  /** The newest version is waiting for the customer: it carries Approve and Ask for changes. */
  readonly reviewing: boolean;
  /** The picture of the current preview, or null when none was taken of it. Drawn only while reviewing. */
  readonly pictureUrl: string | null;
  /** The preview link staff saved, or null. */
  readonly previewUrl: string | null;
  /** The site's address, or null when none is known yet. */
  readonly address: string | null;
  readonly businessName: string;
  /** A fresh key for the feedback form, so sending it twice by accident makes one ticket. */
  readonly feedbackKey: string;
  /** "Two rounds of changes are included.", shown under the feedback box. */
  readonly roundsLine: string;
  /** Every included round is used: the feedback box gives way to the rounds line and a way to ask. */
  readonly roundsUsedUp: boolean;
}

/** A browser window drawn with tokens: three dots and the preview's address, then the picture, or the site's name when there is none. */
function BrowserFrame({ pictureUrl, previewUrl, address, businessName }: Pick<PreviewCardProps, "pictureUrl" | "previewUrl" | "address" | "businessName">): ReactElement {
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
          <img src={pictureUrl} alt="Your new website" width={1280} height={800} loading="lazy" decoding="async" className="size-full object-cover object-top" />
        )}
      </div>
    </div>
  );
}

function OpenPreview({ href, primary }: { readonly href: string; readonly primary: boolean }): ReactElement {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={primary ? DARK_BUTTON : SOFT_BUTTON}>
      <ArrowSquareOut size={18} aria-hidden="true" />
      Open preview
    </a>
  );
}

function VersionItem({ row, reviewing, answer }: { readonly row: VersionRow; readonly reviewing: boolean; readonly answer: ReactElement }): ReactElement {
  const waiting = reviewing && row.newest;
  return (
    <li className="grid gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
            <span>Version {row.version}</span>
            {row.live ? <StatusWord tone="ok">Live now</StatusWord> : null}
          </p>
          <p className="mt-0.5 break-words text-[0.9375rem] text-ink-2">
            {row.host === null ? null : <>{row.host} &middot; </>}
            Sent {row.sent}
            {row.outcome === null ? null : <> &middot; {row.outcome}</>}
          </p>
        </div>
        {row.href === null ? null : <OpenPreview href={row.href} primary={waiting} />}
      </div>
      {waiting ? answer : null}
    </li>
  );
}

/** The card on the Website page that holds every preview we sent, newest first, and the last round of changes the customer asked for. */
export function PreviewCard({ rows, inProgress, changes, reviewing, pictureUrl, previewUrl, address, businessName, feedbackKey, roundsLine, roundsUsedUp }: PreviewCardProps): ReactElement {
  const empty = rows.length === 0 && inProgress === null;
  const answer = (
    <div className="grid gap-3">
      <PreviewApprove />
      {roundsUsedUp ? (
        <div className="grid gap-2">
          <p className="text-[0.8125rem] text-ink-2">{roundsLine}</p>
          <Link href={askAboutHref("")} className={TEXT_LINK}>
            Ask for a change
          </Link>
        </div>
      ) : (
        <PreviewFeedback submissionKey={feedbackKey} roundsLine={roundsLine} />
      )}
    </div>
  );
  return (
    <section aria-labelledby="preview-title" className={cn(LIFT, "grid content-start gap-5 p-5 md:p-6")}>
      <div className="grid gap-1">
        <h2 id="preview-title" className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
          Your preview
        </h2>
        {empty ? null : <p className="text-[0.9375rem] text-ink-2">Every version we have sent you, newest first.</p>}
      </div>

      {reviewing ? <BrowserFrame pictureUrl={pictureUrl} previewUrl={previewUrl} address={address} businessName={businessName} /> : null}

      {empty ? (
        <p className="text-base text-ink-2">No preview has been sent yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {inProgress === null ? null : (
            <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink">Version {inProgress.version}</p>
                <p className="mt-0.5 text-[0.9375rem] text-ink-2">
                  In progress
                  {inProgress.readyBy === null ? null : (
                    <>
                      {" "}
                      &middot; ready by {inProgress.readyBy}
                    </>
                  )}
                </p>
              </div>
              <StatusWord tone="info">We are on it</StatusWord>
            </li>
          )}
          {rows.map((row) => (
            <VersionItem key={row.version} row={row} reviewing={reviewing} answer={answer} />
          ))}
        </ul>
      )}

      {changes === null ? null : (
        <div className="grid gap-3 border-t border-line pt-5">
          <h3 className="font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">Your changes</h3>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[0.9375rem] text-ink-2">
            <p>
              <span>
                Round {changes.round} of {changes.of}
              </span>{" "}
              &middot; asked {changes.asked}
            </p>
            {changes.doneIn === null ? null : <p className="font-semibold text-ink">Done in Version {changes.doneIn}</p>}
          </div>
          {changes.text === null ? null : (
            <blockquote className="line-clamp-6 whitespace-pre-line break-words rounded-lg bg-sunken px-4 py-3 text-base leading-relaxed text-ink">{changes.text}</blockquote>
          )}
          <Link href={changes.requestHref} className={TEXT_LINK}>
            See your request
          </Link>
        </div>
      )}
    </section>
  );
}
