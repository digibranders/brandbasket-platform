import { Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { cn } from "@brandbasket/shared/lib/cn";
import { CUSTOMER_STAGE_HEADLINE } from "@brandbasket/shared/lib/project-customer-line";
import type { NextStep } from "@brandbasket/shared/lib/next-step";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageSection } from "@/components/v2/page";
import { PROJECT_STAGES } from "@/lib/project-stages";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";

interface NextStepCardProps {
  readonly step: NextStep;
  /** The build stage in progress, for the list beside a build that's under way. See projectStageIndex. */
  readonly buildStageIndex: number;
}

type ItemState = "done" | "current" | "todo";

const MARK: Readonly<Record<ItemState, string>> = { done: "bg-ink text-white", current: "bg-rattan text-ink", todo: "bg-sunken text-ink-2" };
const STATE_TEXT: Readonly<Record<ItemState, string>> = { done: " (done)", current: " (next)", todo: "" };

interface ListItem {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly state: ItemState;
}

/** A short numbered list joined by a thin line: the build's stages, each marked done, now or still to come. */
function StepList({ label, items }: { readonly label: string; readonly items: readonly ListItem[] }): ReactElement {
  return (
    <ol aria-label={label} className="relative grid gap-4">
      <span aria-hidden="true" className="absolute bottom-3 left-[0.6875rem] top-3 w-px bg-line" />
      {items.map((item, index) => (
        <li key={item.key} aria-current={item.state === "current" ? "step" : undefined} className="relative flex gap-3">
          <span aria-hidden="true" className={cn("relative z-10 grid size-[1.375rem] shrink-0 place-items-center rounded-full text-xs tabular-nums", MARK[item.state])}>
            {item.state === "done" ? <Check size={12} weight="bold" /> : index + 1}
          </span>
          <span className="min-w-0">
            <span className={cn("block text-sm text-ink", item.state !== "todo" && "font-semibold")}>
              {item.title}
              <span className="sr-only">{STATE_TEXT[item.state]}</span>
            </span>
            <span className="block text-xs leading-relaxed text-ink-2">{item.detail}</span>
          </span>
        </li>
      ))}
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
    <PageSection id="next-step" title="What happens next">
      <div className="grid gap-5">
        <div>
          <p className="text-xs font-semibold text-rattan-ink">{eyebrow}</p>
          <h3 className="mt-1 font-display text-[1.1875rem] font-semibold leading-snug tracking-[-0.02em] text-ink">{heading}</h3>
          {children === undefined ? null : <div className="mt-2 text-[0.84375rem] leading-relaxed text-ink-2">{children}</div>}
          {action === undefined && note === undefined ? null : (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {action === undefined ? null : (
                <Link href={action.href} className={SOFT_BUTTON}>
                  {action.label}
                </Link>
              )}
              {note === undefined ? null : <p className="text-[0.8125rem] text-ink-2">{note}</p>}
            </div>
          )}
        </div>
        {list}
      </div>
    </PageSection>
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
    case "preparing":
    case "building":
      return (
        <CardLayout
          eyebrow="In progress"
          heading={step.kind === "preparing" ? CUSTOMER_STAGE_HEADLINE.submitted : "We’re building your website"}
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
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-[3px]">
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
