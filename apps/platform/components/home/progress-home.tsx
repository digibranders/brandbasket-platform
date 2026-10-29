import Link from "next/link";
import type { ReactElement } from "react";
import { DARK_BUTTON, LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { websiteMilestones } from "@/lib/home/milestones";
import type { ClientHomeState } from "@/lib/home/state";
import type { HomeData } from "@/lib/server/home";
import { ActivityList } from "./activity-list";
import { Attention } from "./attention";
import { Milestones } from "./milestones";
import { StatusHero } from "./status-hero";
import type { StatusTone } from "./status-word";

type WebsiteState = Exclude<ClientHomeState, { kind: "payment_required" | "payment_processing" | "lapsed" | "kickoff_unbooked" | "kickoff_booked" | "ongoing" }>;

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

interface Copy {
  readonly word: string;
  readonly tone: StatusTone;
  readonly title: string;
  readonly text: string;
}

function copyFor(state: WebsiteState): Copy {
  switch (state.kind) {
    case "starting":
      return { word: "Starting", tone: "info", title: "We are getting your website started", text: "Your kickoff is done. The date of your first preview appears here as soon as the build starts." };
    case "building":
      return {
        word: "In progress",
        tone: "info",
        title: "We are building your website",
        text: state.dueAt === null ? "We will email you, and show it here, when your first preview is ready." : `Your first preview will be ready by ${WHEN.format(state.dueAt)}. We will email you and show it here.`,
      };
    case "on_hold":
      return { word: "Paused", tone: "warn", title: "Your build is paused", text: state.reason ?? "We will tell you here when it starts again." };
    case "revisions":
      return { word: "In progress", tone: "info", title: "We are making your changes", text: "We will email you, and show it here, when the new preview is ready." };
    case "approved":
      return { word: "Approved", tone: "ok", title: "Your website is approved", text: "We are getting it ready to go live. We will email you the day it is live." };
    case "preview_ready":
      return { word: "Ready to review", tone: "brand", title: "Your website is ready to review", text: "Look at it on your phone too: that is where most of your customers will see it." };
    case "launched":
      return { word: "Live", tone: "ok", title: "Your website is live", text: `It is at ${state.hostname}. We keep it running, and your plan covers the updates.` };
  }
}

/**
 * The screens for a website being built and reviewed, and the week after launch: one status card, the path from kickoff to
 * live, the single thing we need (or the calm line saying nothing is), and what we have done. Revision feedback and
 * approval happen on the Website page, never as a form here.
 */
export function ProgressHome({ state, data }: { readonly state: WebsiteState; readonly data: HomeData }): ReactElement {
  const copy = copyFor(state);
  const endsAt = data.call.booking?.endsAtIso ?? null;
  const milestones = websiteMilestones(state, { kickoffAt: endsAt === null ? null : new Date(endsAt), firstPreviewDueAt: data.project?.slaDueAt ?? null });
  const action =
    state.kind === "preview_ready" ? (
      <Link href="/website" className={DARK_BUTTON}>
        Review your website
      </Link>
    ) : state.kind === "launched" ? (
      <>
        <a href={`https://${state.hostname}`} target="_blank" rel="noopener noreferrer" className={DARK_BUTTON}>
          Visit your website
        </a>
        <Link href="/requests/new?kind=website" className={SOFT_BUTTON}>
          Request an update
        </Link>
      </>
    ) : (
      <Link href="/website" className={SOFT_BUTTON}>
        Open Website
      </Link>
    );
  return (
    <>
      <StatusHero labelId="home-status" word={copy.word} tone={copy.tone} title={copy.title} actions={action}>
        {copy.text}
      </StatusHero>
      {state.kind === "launched" ? null : (
        <section aria-label="Progress" className={`${LIFT} p-6`}>
          <Milestones items={milestones} label="Website progress" />
        </section>
      )}
      <Attention items={data.attention} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ActivityList rows={data.overview?.activity ?? []} title="Latest from BrandBasket" />
        {data.kickoffNotes === null ? null : (
          <section aria-labelledby="home-notes" className={`${LIFT} grid content-start gap-2 p-6`}>
            <h2 id="home-notes" className="font-display text-lg font-semibold text-ink">
              From your kickoff
            </h2>
            <p className="text-base leading-relaxed text-ink">{data.kickoffNotes}</p>
            <p className="text-[0.8125rem] text-ink-3">Written by your team after the call.</p>
          </section>
        )}
      </div>
    </>
  );
}
