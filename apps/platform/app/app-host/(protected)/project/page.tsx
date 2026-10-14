import type { Metadata } from "next";
import { EmailUs } from "@/components/panel/email-us";
import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { ButtonLink, ExternalButtonLink } from "@firstfold/shared/ui/panel/button";
import { SectionHeading, Surface } from "@firstfold/shared/ui/panel/surface";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { ServicesList, SummaryCard } from "@/components/panel/onboarding-summary";
import { PreviewReviewActions } from "@/components/panel/preview-review-actions";
import { ProjectTimeline } from "@/components/panel/project-timeline";
import { StageDisclosure } from "@/components/panel/stage-disclosure";
import { cn } from "@firstfold/shared/lib/cn";
import { isTemporarySubdomain } from "@firstfold/shared/lib/onboarding/domain-form";
import { PROJECT_RESPONSE_NOTICES, readProjectResponseNotice } from "@/lib/project-response-notices";
import { PROJECT_STAGES, projectStageIndex } from "@/lib/project-stages";
import { safeExternalHref } from "@firstfold/shared/lib/safe-link";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getOnboardingSnapshot, type LiveWebsite } from "@/lib/server/onboarding";
import { siteConfig } from "@firstfold/shared/lib/site-config";
import { approvePreviewAction, requestPreviewChangesAction } from "./actions";

export const metadata: Metadata = { title: "Your project" };

/**
 * Where the build ends: the site is up and the content is theirs. Reached once the project has gone live, which
 * closes it, so `snapshot.project` is null here and `live` is the only thing that still knows the site exists.
 */
function LiveProject({ live }: { readonly live: LiveWebsite }): ReactElement {
  // Stored by us, never typed by the customer, but guarded like any other stored link. See safeExternalHref.
  const href = safeExternalHref(`https://${live.hostname}`);

  return (
    <>
      <h1 className="panel-title">
        Your <em>website.</em>
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        It’s live at{" "}
        {href === null ? (
          <span className="font-medium text-ink">{live.hostname}</span>
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer" className="link-underline font-medium text-ink">
            {live.hostname}
          </a>
        )}
        {live.launchedAt === null ? null : (
          <>
            , up since <LocalDateTime iso={live.launchedAt.toISOString()} />
          </>
        )}
        .
      </p>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Surface labelledBy="timeline-heading">
          <SectionHeading id="timeline-heading">Where your build is</SectionHeading>
          <div className="mt-6">
            <ProjectTimeline stages={PROJECT_STAGES} currentIndex={PROJECT_STAGES.length} />
          </div>
        </Surface>

        <div className="space-y-4">
          <SummaryCard title="Your blog">
            <p className="text-sm text-ink-soft">
              Write and publish posts whenever you like, as often as you like. Nothing waits on us.
            </p>
            <Link href="/content/blog" className="link-underline mt-4 inline-block text-sm">
              Write a post →
            </Link>
          </SummaryCard>

          <Surface tone="quiet">
            <SectionHeading>Something bigger?</SectionHeading>
            <p className="mt-2 text-sm text-ink-soft">
              A new page, a new service, a change of look
              {isTemporarySubdomain(live.hostname) ? ", or moving to your own domain" : ""}: email us at <EmailUs />.
            </p>
          </Surface>
        </div>
      </div>
    </>
  );
}

export default async function ProjectPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireCustomerAccess();
  const [snapshot, liveWebsite] = await Promise.all([getOnboardingSnapshot(), getLiveWebsite()]);
  const { project } = snapshot;
  const sp = await searchParams;
  const responseNotice = readProjectResponseNotice(sp.response);

  if (liveWebsite !== null) return <LiveProject live={liveWebsite} />;

  if (project === null) {
    return (
      <>
        <h1 className="panel-title">
          Your <em>project.</em>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          There’s no build in progress right now. If you think that’s wrong, email us at <EmailUs />.
        </p>
      </>
    );
  }

  const inBuild = project.status === "submitted" || project.status === "building";
  const sent = project.onboardingSubmittedAt !== null;

  return (
    <>
      <h1 className="panel-title">
        Your <em>project.</em>
      </h1>
      {inBuild && project.slaDueAt !== null ? (
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Your first preview will be ready by{" "}
          <span className="font-medium text-ink">
            <LocalDateTime iso={project.slaDueAt.toISOString()} />
          </span>
          .
        </p>
      ) : null}
      {project.status === "on_hold" ? (
        <p role="status" className="mt-4 max-w-2xl rounded-control bg-accent-pale px-5 py-4 text-sm text-accent-deep">
          Your build is paused. We’ll be in touch about what we need from you.
        </p>
      ) : null}

      {responseNotice === null ? null : (
        <p
          role="status"
          className={cn(
            "mt-4 max-w-2xl rounded-control px-5 py-4 text-sm",
            PROJECT_RESPONSE_NOTICES[responseNotice].ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep",
          )}
        >
          {PROJECT_RESPONSE_NOTICES[responseNotice].text}
          {PROJECT_RESPONSE_NOTICES[responseNotice].offersCall && siteConfig.calendlyUrl !== null ? (
            <>
              {" "}
              <a
                href={siteConfig.calendlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline font-medium"
              >
                Book a call
              </a>
            </>
          ) : null}
        </p>
      )}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Surface labelledBy="timeline-heading">
          <SectionHeading id="timeline-heading">Where your build is</SectionHeading>
          <div className="mt-6">
            <ProjectTimeline
              stages={PROJECT_STAGES}
              currentIndex={projectStageIndex(project)}
              extraByIndex={{
                1:
                  project.previewUrl === null || safeExternalHref(project.previewUrl) === null ? null : (
                    <StageDisclosure summary="Your website is ready to look at">
                      <ExternalButtonLink
                        href={safeExternalHref(project.previewUrl) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group"
                      >
                        View your preview
                        <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
                      </ExternalButtonLink>
                    </StageDisclosure>
                  ),
                2:
                  project.status !== "preview" ? null : (
                    <StageDisclosure summary="Book a call to review it">
                      <PreviewReviewActions
                        approveAction={approvePreviewAction}
                        requestChangesAction={requestPreviewChangesAction}
                        calendlyUrl={siteConfig.calendlyUrl}
                      />
                    </StageDisclosure>
                  ),
              }}
            />
          </div>
          {project.status === "onboarding" ? (
            <ButtonLink href="/onboarding" className="mt-8">
              Carry on setting up
            </ButtonLink>
          ) : null}
        </Surface>

        <div className="space-y-4">
          {sent ? (
            <SummaryCard title="What you sent us">
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-ink-soft">Business</dt>
                  <dd className="mt-0.5 font-medium">{snapshot.profile?.displayName ?? "Not given"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-soft">Domain</dt>
                  <dd className="mt-0.5 font-medium">
                    {snapshot.domain?.hostname ?? "Not given"}
                    {snapshot.domain !== null && isTemporarySubdomain(snapshot.domain.hostname) ? (
                      <span className="font-normal text-ink-soft"> (free, temporary)</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-soft">Services</dt>
                  <dd className="mt-2">
                    <ServicesList services={snapshot.services} />
                  </dd>
                </div>
              </dl>
              <Link href="/onboarding/review" className="link-underline mt-5 inline-block text-sm">
                See everything you sent
              </Link>
            </SummaryCard>
          ) : null}

          <Surface tone="quiet">
            <SectionHeading>Need to change something?</SectionHeading>
            <p className="mt-2 text-sm text-ink-soft">
              Email us at <EmailUs />.
            </p>
          </Surface>
        </div>
      </div>
    </>
  );
}
