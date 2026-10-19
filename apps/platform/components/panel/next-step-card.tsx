import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { ArrowIcon, TickIcon } from "@brandbasket/shared/ui/icons";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { cn } from "@brandbasket/shared/lib/cn";
import type { NextStep } from "@brandbasket/shared/lib/next-step";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { PROJECT_STAGES } from "@/lib/project-stages";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";

interface NextStepCardProps {
  readonly step: NextStep;
  /** The build stage in progress, for the list beside a build that's under way. See projectStageIndex. */
  readonly buildStageIndex: number;
}

type ItemState = "done" | "current" | "todo";

function Marker({ state, number }: { readonly state: ItemState; readonly number: number }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
        state === "done" && "bg-ink text-paper",
        state === "current" && "bg-accent-deep text-paper shadow-[0_8px_20px_-10px_rgba(99,0,30,0.8)]",
        state === "todo" && "border border-line bg-paper text-ink-soft",
      )}
    >
      {state === "done" ? <TickIcon className="size-4" /> : number}
    </span>
  );
}

const STATE_TEXT: Readonly<Record<ItemState, string>> = { done: " (done)", current: " (next)", todo: "" };

interface ListItem {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly state: ItemState;
  readonly href?: string;
}

/** A short numbered list joined by a thin line, as the middle column of the card. */
function StepList({ label, items }: { readonly label: string; readonly items: readonly ListItem[] }): ReactElement {
  return (
    <ol aria-label={label} className="relative space-y-4">
      <span aria-hidden="true" className="absolute bottom-4 left-[1.125rem] top-4 w-px bg-line" />
      {items.map((item, index) => {
        const body = (
          <>
            <Marker state={item.state} number={index + 1} />
            <span className="min-w-0 pt-0.5">
              <span className={cn("block text-sm", item.state === "todo" ? "text-ink" : "font-medium")}>
                {item.title}
                <span className="sr-only">{STATE_TEXT[item.state]}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{item.detail}</span>
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {item.href === undefined ? (
              <span className="flex gap-4">{body}</span>
            ) : (
              <Link
                href={item.href}
                aria-current={item.state === "current" ? "step" : undefined}
                className="group flex gap-4 rounded-control transition-colors duration-300 ease-calm hover:text-accent-deep"
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function buildItems(currentIndex: number): readonly ListItem[] {
  return PROJECT_STAGES.map((stage, index) => ({
    key: stage.title,
    title: stage.title,
    detail: stage.detail,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "todo",
  }));
}

interface LayoutProps {
  readonly eyebrow: string;
  readonly heading: string;
  /** A line or two under the heading; omitted where the list beside the card already says it. */
  readonly children?: ReactNode;
  readonly action?: { readonly href: string; readonly label: string };
  readonly note?: string;
  readonly list: ReactNode;
}

function CardLayout({ eyebrow, heading, children, action, note, list }: LayoutProps): ReactElement {
  return (
    <section
      aria-labelledby="next-step-heading"
      className="grid gap-8 rounded-shell border border-line bg-card p-6 shadow-[0_24px_60px_-48px_rgba(42,13,16,0.6)] sm:p-8 lg:grid-cols-[1.3fr_1fr] xl:items-center"
    >
      <div>
        <p className="text-[0.8125rem] font-semibold text-accent-deep">{eyebrow}</p>
        <h2 id="next-step-heading" className="mt-3 panel-title">
          {heading}
        </h2>
        {children === undefined ? null : <div className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">{children}</div>}
        {action === undefined && note === undefined ? null : (
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            {action === undefined ? null : (
              <ButtonLink
                href={action.href}
                className="group shadow-[0_14px_30px_-18px_rgba(42,13,16,0.9)]"
              >
                {action.label}
                <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
              </ButtonLink>
            )}
            {note === undefined ? null : <p className="text-sm text-ink-soft">{note}</p>}
          </div>
        )}
      </div>
      <div className="lg:border-l lg:border-line lg:pl-8">{list}</div>
    </section>
  );
}

/** Where the website is, on the home screen once setup is sent: building, paused or live. Renders nothing while the customer is still setting up, or when there is nothing to say. */
export function NextStepCard({ step, buildStageIndex }: NextStepCardProps): ReactElement | null {
  const buildList = <StepList label="Build stages" items={buildItems(buildStageIndex)} />;

  switch (step.kind) {
    case "start-onboarding":
    case "continue-onboarding":
      // Setting up is shown by the kickoff call and checklist on the home screen, not by this card.
      return null;
    case "building":
      return (
        <CardLayout
          eyebrow="In progress"
          heading="We’re building your website"
          action={{ href: "/project", label: "View progress" }}
          list={buildList}
        >
          {step.slaDueAt === null ? (
            <p>We have everything we need and we’re working on it.</p>
          ) : (
            <p>
              Your first preview will be ready by <LocalDateTime iso={step.slaDueAt.toISOString()} />.
            </p>
          )}
        </CardLayout>
      );
    case "on-hold":
      return (
        <CardLayout eyebrow="Paused" heading="Your build is paused" list={buildList}>
          <p>We’ll be in touch about what we need from you.</p>
        </CardLayout>
      );
    case "live": {
      // Stored by us, never typed by the customer, but rendered through the same guard as any other stored link so
      // a row written by a future path that skipped the form checks still cannot put a scheme into this page.
      const href = safeExternalHref(`https://${step.hostname}`);
      return (
        <CardLayout
          eyebrow="Live"
          heading="Your website is live"
          action={{ href: "/content/blog", label: "Write a post" }}
          note={isTemporarySubdomain(step.hostname) ? "Moving to your own domain later is included." : undefined}
          list={buildList}
        >
          <p>
            It’s up at{" "}
            {href === null ? (
              <span className="font-medium text-ink">{step.hostname}</span>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer" className="link-underline font-medium text-ink">
                {step.hostname}
              </a>
            )}
            . Your blog is yours to write whenever you like. Everything else on the site, just ask and we&rsquo;ll
            do it.
          </p>
        </CardLayout>
      );
    }
    case "review":
      return (
        <CardLayout
          eyebrow={step.changesRequested ? "Changes in progress" : "Ready for you"}
          heading={step.changesRequested ? "We’re making your changes" : "Your preview is ready"}
          action={{ href: "/project", label: step.changesRequested ? "View progress" : "Review your preview" }}
          list={buildList}
        >
          <p>
            {step.changesRequested
              ? "We have your notes and we’re updating the website. We’ll let you know when the new preview is ready."
              : "Have a look at your website and approve it, or tell us what to change."}
          </p>
        </CardLayout>
      );
    case "approved":
      return (
        <CardLayout eyebrow="Approved" heading="Your website is nearly live" action={{ href: "/project", label: "View progress" }} list={buildList}>
          <p>Thank you for approving it. We’re getting it ready to go live on your domain.</p>
        </CardLayout>
      );
    case "none":
      return null;
  }
}
