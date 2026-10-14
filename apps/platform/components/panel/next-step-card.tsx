import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { ArrowIcon, TickIcon } from "@firstfold/shared/ui/icons";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { SiteSketch } from "@firstfold/shared/ui/site-sketch";
import { WaveLines } from "@firstfold/shared/ui/wave-lines";
import { cn } from "@firstfold/shared/lib/cn";
import type { NextStep } from "@firstfold/shared/lib/next-step";
import { isTemporarySubdomain } from "@firstfold/shared/lib/onboarding/domain-form";
import { firstIncompleteStep, ONBOARDING_STEPS, onboardingStepHref, type OnboardingStepKey } from "@firstfold/shared/lib/onboarding/steps";
import { PROJECT_STAGES } from "@/lib/project-stages";
import { safeExternalHref } from "@firstfold/shared/lib/safe-link";

interface NextStepCardProps {
  readonly step: NextStep;
  readonly completedSteps: readonly OnboardingStepKey[];
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

function setupItems(completed: readonly OnboardingStepKey[]): readonly ListItem[] {
  const done = new Set(completed);
  const current = firstIncompleteStep(done);
  return ONBOARDING_STEPS.map((step) => ({
    key: step.key,
    title: step.title,
    detail: step.blurb,
    state: done.has(step.key) ? "done" : step.key === current ? "current" : "todo",
    href: onboardingStepHref(step.key),
  }));
}

function buildItems(currentIndex: number): readonly ListItem[] {
  return PROJECT_STAGES.map((stage, index) => ({
    key: stage.title,
    title: stage.title,
    detail: stage.detail,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "todo",
  }));
}

/** A drawn website on a soft, tilted card: what they're setting up, without pretending to be their site. */
function WebsiteIllustration(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="relative isolate hidden min-h-[16rem] overflow-hidden rounded-shell bg-paper-deep xl:block"
    >
      <WaveLines seed={41} className="absolute -right-24 -top-10 -z-10 h-[30rem] w-[22rem] rotate-12 text-accent/15" />
      <div className="absolute inset-0 flex items-center justify-center p-6 [perspective:900px]">
        <SiteSketch
          accent="var(--color-accent)"
          soft="var(--color-accent-pale)"
          className="w-full max-w-[17rem] [transform:rotateY(-18deg)_rotateX(8deg)_rotateZ(-4deg)]"
        />
      </div>
    </div>
  );
}

interface LayoutProps {
  readonly eyebrow: string;
  readonly heading: string;
  readonly children: ReactNode;
  readonly action?: { readonly href: string; readonly label: string };
  readonly note?: string;
  readonly list: ReactNode;
}

function CardLayout({ eyebrow, heading, children, action, note, list }: LayoutProps): ReactElement {
  return (
    <section
      aria-labelledby="next-step-heading"
      className="grid gap-8 rounded-shell border border-line bg-card p-6 shadow-[0_24px_60px_-48px_rgba(42,13,16,0.6)] sm:p-8 lg:grid-cols-[1.3fr_1fr] xl:grid-cols-[1.35fr_1fr_0.95fr] xl:items-center"
    >
      <div>
        <p className="text-[0.8125rem] font-semibold text-accent-deep">{eyebrow}</p>
        <h2 id="next-step-heading" className="mt-3 panel-title">
          {heading}
        </h2>
        <div className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">{children}</div>
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
      <WebsiteIllustration />
    </section>
  );
}

/** The one thing to do next, on the home screen. Renders nothing when there is nothing to ask. */
export function NextStepCard({ step, completedSteps, buildStageIndex }: NextStepCardProps): ReactElement | null {
  const setupList = <StepList label="Setup steps" items={setupItems(completedSteps)} />;
  const buildList = <StepList label="Build stages" items={buildItems(buildStageIndex)} />;

  switch (step.kind) {
    case "start-onboarding":
      return (
        <CardLayout
          eyebrow="Your next step"
          heading="Tell us about your business"
          action={{ href: "/onboarding", label: "Start setup" }}
          note="Your answers save as you go."
          list={setupList}
        >
          <p>Five short steps: your details, services, photos and domain, then a last look before you send it.</p>
        </CardLayout>
      );
    case "continue-onboarding": {
      const percent = Math.round((step.completed / step.total) * 100);
      return (
        <CardLayout
          eyebrow="Your next step"
          heading="Carry on setting up"
          action={{ href: "/onboarding", label: "Continue setup" }}
          note="Your answers save as you go."
          list={setupList}
        >
          <p className="tabular-nums">
            {step.completed} of {step.total} steps done. Pick up where you left off, or jump to any step.
          </p>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={step.total}
            aria-valuenow={step.completed}
            aria-valuetext={`${step.completed} of ${step.total} steps done`}
            className="mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-paper-deep"
          >
            <div
              className="h-full rounded-full bg-accent-deep transition-[width] duration-500 ease-calm"
              style={{ width: `${percent}%` }}
            />
          </div>
        </CardLayout>
      );
    }
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
    case "none":
      return null;
  }
}
