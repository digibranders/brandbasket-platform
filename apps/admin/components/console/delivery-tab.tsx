import type { DomainStatus, LaunchCheckKey, ProjectStatus } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { CUSTOMER_STAGE_HEADLINE } from "@brandbasket/shared/lib/project-customer-line";
import { STAFF_STAGE_LABELS, staffStageOf } from "@brandbasket/shared/lib/project-stage";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { cn } from "@brandbasket/shared/lib/cn";
import { LIFT } from "@/components/console/classes";
import { StatusPill } from "@/components/console/status-pill";
import { StartBuildingForm } from "@/components/console/website-section";
import {
  CheckAddressForm,
  CustomerLink,
  GoLivePanel,
  LaunchChecksForm,
  ResendPreviewEmailForm,
  SendPreviewForm,
  When,
} from "@/app/(protected)/clients/[businessId]/parts";
import { dueDateLabel, NEXT_STEP_HEADLINES, roundName, roundsText, SEND_UPDATED_PREVIEW_LABEL } from "@/lib/delivery-tab";

/** The latest thing the customer wrote when they asked for changes. */
export interface LatestFeedback {
  readonly ticketId: string;
  readonly subject: string;
  readonly body: string | null;
  readonly createdAt: Date;
}

export interface RoundsFact {
  readonly used: number;
  readonly included: number;
}

interface GoLiveInput {
  readonly doneChecks: readonly LaunchCheckKey[];
  readonly domain: { readonly hostname: string; readonly status: DomainStatus } | null;
  readonly previewUrl: string | null;
  readonly addressUnverified: boolean;
}

interface NextStepCardProps {
  readonly businessId: string;
  readonly status: ProjectStatus;
  /** How late the preview we owe is, or null. */
  readonly late: string | null;
  readonly rounds: RoundsFact | null;
  readonly latestFeedback: LatestFeedback | null;
  readonly goLive: GoLiveInput;
}

function requestHref(ticketId: string): string {
  return `/support/${ticketId}`;
}

function QuotedFeedback({ feedback, rounds }: { readonly feedback: LatestFeedback; readonly rounds: RoundsFact | null }): ReactElement {
  return (
    <div className="mt-3 max-w-2xl">
      <blockquote className="line-clamp-6 whitespace-pre-wrap break-words border-l-2 border-rattan pl-4 text-sm leading-relaxed text-ink">
        {`“${feedback.body ?? feedback.subject}”`}
      </blockquote>
      <p className="mt-2 text-sm text-ink-2">
        {rounds === null ? null : `Round ${roundsText(rounds.used, rounds.included)} \u00B7 `}
        Asked <When date={feedback.createdAt} />
      </p>
      <Link href={requestHref(feedback.ticketId)} className="link-underline mt-2 inline-block text-sm font-semibold">
        Open the request
      </Link>
    </div>
  );
}

function StageBody({ businessId, status, rounds, latestFeedback, goLive }: Omit<NextStepCardProps, "late">): ReactNode {
  switch (status) {
    case "submitted":
      return (
        <div className="mt-4">
          <StartBuildingForm businessId={businessId} />
        </div>
      );
    case "building":
      return (
        <div className="mt-4">
          <SendPreviewForm businessId={businessId} />
        </div>
      );
    case "preview":
      return (
        <div className="mt-4">
          <ResendPreviewEmailForm businessId={businessId} />
        </div>
      );
    case "revisions":
      return (
        <>
          {latestFeedback === null ? (
            <p className="mt-3 max-w-xl text-sm text-ink-2">They asked for changes. What they wrote is in Requests.</p>
          ) : (
            <QuotedFeedback feedback={latestFeedback} rounds={rounds} />
          )}
          <p className="mt-5 text-sm text-ink-2">When the changes are done, send the new version.</p>
          <div className="mt-3">
            <SendPreviewForm businessId={businessId} label={SEND_UPDATED_PREVIEW_LABEL} />
          </div>
        </>
      );
    case "approved":
      return (
        <div className="mt-4 space-y-8">
          <LaunchChecksForm businessId={businessId} done={goLive.doneChecks} />
          {goLive.domain === null ? null : <CheckAddressForm businessId={businessId} />}
          <GoLivePanel
            businessId={businessId}
            domain={goLive.domain}
            previewUrl={goLive.previewUrl}
            addressUnverified={goLive.addressUnverified}
          />
        </div>
      );
    case "on_hold":
      return <p className="mt-3 text-sm text-ink-2">To start again, press Resume under More controls.</p>;
    default:
      return null;
  }
}

/** The one thing to do next on this build, first on the page. The stage name is the staff name the header uses. */
export function NextStepCard({ late, ...rest }: NextStepCardProps): ReactElement {
  const { status } = rest;
  return (
    <section
      id={status === "approved" ? "domain" : undefined}
      aria-labelledby="delivery-next-step"
      className={cn(LIFT, "mb-6 scroll-mt-8 border-2 border-rattan p-5")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="delivery-next-step" className="font-display text-[0.9375rem] font-semibold text-ink">
          Next step
        </h2>
        <p className="text-xs font-semibold text-ink-2">
          {STAFF_STAGE_LABELS[staffStageOf(status)]}
          {late === null ? null : <span className="text-error"> · {late}</span>}
        </p>
      </div>
      <h3 className="mt-3 font-display text-xl font-semibold tracking-[-0.01em] text-ink">{NEXT_STEP_HEADLINES[status]}</h3>
      <StageBody {...rest} />
    </section>
  );
}

interface DeliveryFactsProps {
  readonly status: ProjectStatus;
  /** The first preview's promised time. */
  readonly slaDueAt: Date | null;
  /** The day the updated preview is promised once changes were asked for (`YYYY-MM-DD`), or null when that is not known. */
  readonly updatedPreviewDay: string | null;
  /** The open build's round and launch-day figures; null once the build is closed. */
  readonly build: { readonly rounds: RoundsFact; readonly launchPlannedOn: string | null } | null;
  /** Whether staff confirmed the kickoff call, or null when the stage has no kickoff to speak of. */
  readonly kickoffConfirmed: boolean | null;
}

interface FactCell {
  readonly label: string;
  readonly value: ReactNode;
}

/** One row of facts under the next-step card. Wraps to fewer columns on a phone. */
export function DeliveryFacts({ status, slaDueAt, updatedPreviewDay, build, kickoffConfirmed }: DeliveryFactsProps): ReactElement {
  const due = dueDateLabel(status);
  const notGiven = <span className="text-ink-2">Not given</span>;
  const dueValue =
    status === "revisions"
      ? updatedPreviewDay === null
        ? notGiven
        : formatStoredDate(updatedPreviewDay)
      : slaDueAt === null
        ? notGiven
        : <When date={slaDueAt} />;
  const cells: readonly FactCell[] = [
    { label: "Customer sees", value: CUSTOMER_STAGE_HEADLINE[status] },
    ...(due === null ? [] : [{ label: due, value: dueValue }]),
    ...(build === null ? [] : [{ label: "Rounds used", value: roundsText(build.rounds.used, build.rounds.included) }]),
    ...(build === null
      ? []
      : [{ label: "Planned launch day", value: build.launchPlannedOn === null ? <span className="text-ink-2">Not set</span> : formatStoredDate(build.launchPlannedOn) }]),
    ...(kickoffConfirmed === null
      ? []
      : [{ label: "Kickoff", value: kickoffConfirmed ? "Confirmed by staff" : "Started automatically, not confirmed by staff" }]),
  ];
  return (
    <dl className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-6 gap-y-4 border-b border-line pb-5">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0">
          <dt className="text-xs text-ink-2">{cell.label}</dt>
          <dd className="mt-1 break-words text-sm tabular-nums">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface PreviewVersionRow {
  readonly version: number;
  readonly previewUrl: string;
  readonly sentAt: Date;
}

/** Every preview sent, newest first, the latest marked. */
export function PreviewVersionList({ versions }: { readonly versions: readonly PreviewVersionRow[] }): ReactElement {
  return (
    <ul aria-label="Preview versions" className="divide-y divide-line">
      {versions.map((version, index) => (
        <li key={version.version} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
          <span className="min-w-0 flex-1 basis-60">
            <span className="mr-2 font-semibold">Version {version.version}</span>
            {index === 0 ? <StatusPill tone="todo">Latest</StatusPill> : null}
            <span className="mt-0.5 block">
              <CustomerLink url={version.previewUrl} />
            </span>
          </span>
          <span className="text-xs tabular-nums text-ink-2">
            <When date={version.sentAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface FeedbackRow {
  readonly ticketId: string;
  readonly round: number;
  readonly subject: string;
  readonly body: string | null;
  readonly createdAt: Date;
  /** The request's status in words. */
  readonly statusLabel: string;
}

/** Each round of changes the customer asked for, newest first, with what they wrote. Never the ticket code. */
export function FeedbackList({ items }: { readonly items: readonly FeedbackRow[] }): ReactElement {
  return (
    <ul aria-label="Customer feedback" className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.ticketId} className="py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-semibold">{roundName(item.round)}</span>
            <span className="text-xs tabular-nums text-ink-2">
              <When date={item.createdAt} />
              {` \u00B7 ${item.statusLabel}`}
            </span>
          </div>
          <p className="mt-1 line-clamp-4 max-w-2xl whitespace-pre-wrap break-words leading-relaxed">{item.body ?? item.subject}</p>
          <Link href={requestHref(item.ticketId)} className="link-underline mt-1.5 inline-block font-semibold">
            Open the request
          </Link>
        </li>
      ))}
    </ul>
  );
}
