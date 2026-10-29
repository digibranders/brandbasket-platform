import {
  findBusinessWebsiteUrl,
  findLatestKickoffOutcome,
  findSetupCallBooking,
  listFeedbackForProject,
  listLaunchChecks,
  listPreviewVersions,
} from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { DOMAIN_CONNECT_NOTICES, readDomainConnectNotice } from "@brandbasket/shared/lib/domain-connect-notices";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { CUSTOMER_STAGE_HEADLINE } from "@brandbasket/shared/lib/project-customer-line";
import { PROJECT_LAUNCH_NOTICES, readProjectLaunchNotice } from "@brandbasket/shared/lib/project-launch-notices";
import { PROJECT_PREVIEW_NOTICES, readProjectPreviewNotice } from "@brandbasket/shared/lib/project-preview-notices";
import { STAFF_STAGE_LABELS, staffStageOf } from "@brandbasket/shared/lib/project-stage";
import { SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { FreeAddressForm } from "@/components/console/free-address-form";
import { KickoffCallSection } from "@/components/console/kickoff-call-section";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { WebsiteSection } from "@/components/console/website-section";
import { buildPanelState } from "@/lib/build-summary";
import { clientNextStep, previewLateReason } from "@/lib/client-next-step";
import { ProjectControls } from "@/components/project-controls";
import { openClientTab } from "@/lib/server/client-page";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { LAUNCH_RESEND_WINDOW_MS } from "@/lib/server/project-launch";
import {
  CustomerLink,
  DNS_STATUS_TEXT,
  Facts,
  GoLivePanel,
  LaunchChecksForm,
  MoveDomainPanel,
  ResendLaunchEmailForm,
  ResendPreviewEmailForm,
  SendPreviewForm,
  When,
} from "../parts";

export const metadata: Metadata = { title: "Client project" };

export default async function ClientProjectPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "project");
  const sp = await searchParams;
  const previewNotice = readProjectPreviewNotice(sp.preview);
  const launchNotice = readProjectLaunchNotice(sp.launch);
  const dnsNotice = readDomainConnectNotice(sp.dns);
  const [websiteUrl, websiteBought] = await Promise.all([findBusinessWebsiteUrl(getStaffDb(), client.businessId), isWebsiteBought(getStaffDb(), client.businessId)]);
  const { project } = client;
  const nextStep = clientNextStep(project);
  const buildState = buildPanelState(project);
  const now = new Date();
  const late = nextStep === "preview" ? previewLateReason(project, now) : null;
  const logo = client.media.filter((asset) => asset.purpose === "logo");
  const photos = client.media.filter((asset) => asset.purpose === "photo");
  const feedback =
    project === null ? [] : await listFeedbackForProject(getStaffDb(), { projectId: project.id, businessId: client.businessId });
  const previewVersions =
    project === null ? [] : await listPreviewVersions(getStaffDb(), { projectId: project.id, businessId: client.businessId });
  const kickoff =
    project === null || (project.status !== "submitted" && project.status !== "building")
      ? null
      : {
          booking: await findSetupCallBooking(getStaffDb(), client.businessId),
          outcome: await findLatestKickoffOutcome(getStaffDb(), client.businessId),
        };
  const kickoffConfirmed = kickoff !== null && (Boolean(kickoff.booking?.heldAt) || kickoff.outcome?.outcome === "completed");
  const launchChecks =
    project === null || nextStep !== "live"
      ? []
      : await listLaunchChecks(getStaffDb(), { projectId: project.id, businessId: client.businessId });
  const launchEmailOpen =
    project !== null &&
    project.status === "live" &&
    project.launchedAt !== null &&
    now.getTime() - project.launchedAt.getTime() <= LAUNCH_RESEND_WINDOW_MS;

  return (
    <>
      {previewNotice === null && launchNotice === null && dnsNotice === null ? null : (
        <div className="mb-8 space-y-3">
          {previewNotice === null ? null : (
            <Notice tone={PROJECT_PREVIEW_NOTICES[previewNotice].ok ? "ok" : "problem"}>{PROJECT_PREVIEW_NOTICES[previewNotice].text}</Notice>
          )}
          {launchNotice === null ? null : (
            <Notice tone={PROJECT_LAUNCH_NOTICES[launchNotice].ok ? "ok" : "problem"}>{PROJECT_LAUNCH_NOTICES[launchNotice].text}</Notice>
          )}
          {dnsNotice === null ? null : (
            <Notice tone={DOMAIN_CONNECT_NOTICES[dnsNotice].ok ? "ok" : "problem"}>{DOMAIN_CONNECT_NOTICES[dnsNotice].text}</Notice>
          )}
        </div>
      )}

      {nextStep === "preview" ? (
        <Section
          title="Send a preview"
          tone={late === null ? "plain" : "attention"}
          aside={late === null ? "The next step" : <span className="font-semibold text-error">{late}</span>}
        >
          <SendPreviewForm businessId={client.businessId} />
        </Section>
      ) : null}
      {project !== null && project.status === "preview" ? (
        <Section title="Preview email">
          <ResendPreviewEmailForm businessId={client.businessId} />
        </Section>
      ) : null}
      {client.movingTo !== null && client.domain !== null ? (
        <Section title="Move to their own domain" id="domain" aside="Asked by the customer">
          <MoveDomainPanel
            businessId={client.businessId}
            current={client.domain.hostname}
            movingTo={client.movingTo}
            siteUrl={websiteUrl ?? project?.previewUrl ?? null}
          />
        </Section>
      ) : null}
      {nextStep === "live" ? (
        <Section title="Go live" id="domain" aside="The next step">
          <div className="space-y-8">
            <LaunchChecksForm businessId={client.businessId} done={launchChecks.map((check) => check.key)} />
            <GoLivePanel businessId={client.businessId} domain={client.domain} previewUrl={project?.previewUrl ?? null} />
          </div>
        </Section>
      ) : null}
      {launchEmailOpen ? (
        <Section title="Launch email">
          <ResendLaunchEmailForm businessId={client.businessId} />
        </Section>
      ) : null}

      <Section title="Build">
        {project === null || buildState === "none" ? (
          <Quiet>No project yet.</Quiet>
        ) : buildState === "waiting" ? (
          <Quiet>Not started. Waiting for the kickoff call.</Quiet>
        ) : (
          <>
            <Facts
              items={[
                { label: "Stage", value: STAFF_STAGE_LABELS[staffStageOf(project.status)] },
                { label: "Customer sees", value: CUSTOMER_STAGE_HEADLINE[project.status] },
                ...(kickoff === null
                  ? []
                  : [
                      {
                        label: "Kickoff",
                        value: kickoffConfirmed ? "Confirmed by staff" : "Started automatically, not confirmed by staff",
                      },
                    ]),
                ...(project.onboardingSubmittedAt === null
                  ? []
                  : [{ label: "Sent to us", value: <When date={project.onboardingSubmittedAt} /> }]),
                { label: "First preview due", value: project.slaDueAt === null ? null : <When date={project.slaDueAt} /> },
                ...(project.previewUrl === null
                  ? []
                  : [
                      { label: "Preview link", value: <CustomerLink url={project.previewUrl} /> },
                      { label: "Preview sent", value: project.previewSentAt === null ? null : <When date={project.previewSentAt} /> },
                    ]),
                ...(project.revisionRoundsGranted === 0 ? [] : [{ label: "Revision rounds used", value: String(project.revisionRoundsGranted) }]),
                ...(project.launchedAt === null ? [] : [{ label: "Launched", value: <When date={project.launchedAt} /> }]),
              ]}
            />
            {project.status === "revisions" ? (
              <p className="mt-6 max-w-xl border-l-2 border-rattan py-1 pl-4 text-sm leading-relaxed">
                They asked for changes. What they wrote is in Requests.
              </p>
            ) : null}
          </>
        )}
      </Section>

      {previewVersions.length === 0 ? null : (
        <Section title="Preview history">
          <Facts
            items={previewVersions.map((version) => ({
              label: `Version ${version.version}`,
              value: (
                <>
                  <CustomerLink url={version.previewUrl} /> <When date={version.sentAt} />
                </>
              ),
            }))}
          />
        </Section>
      )}

      {feedback.length === 0 ? null : (
        <Section title="Client feedback">
          <HairlineList label="Client feedback">
            {feedback.map((item) => (
              <HairlineRow
                key={item.ticketId}
                href={`/support/${item.ticketId}`}
                title={item.subject}
                sub={`${item.displayRef} · Round ${item.round} · ${SUPPORT_STATUS_LABELS[item.status]}`}
                trail={<When date={item.createdAt} />}
              />
            ))}
          </HairlineList>
        </Section>
      )}

      {websiteBought ? <ProjectControls businessId={client.businessId} notice={sp.move} /> : null}

      <Section title="Domain" id={client.movingTo === null && nextStep !== "live" ? "domain" : undefined}>
        {client.domain === null ? (
          <>
            <Quiet>Not given yet.</Quiet>
            {project !== null && buildState === "active" && project.status !== "cancelled" && project.status !== "live" ? (
              <div className="mt-6">
                <FreeAddressForm businessId={client.businessId} />
              </div>
            ) : null}
          </>
        ) : isTemporarySubdomain(client.domain.hostname) ? (
          <Facts
            items={[
              { label: "Domain", value: client.domain.hostname },
              { label: "Ownership", value: "Our temporary address, not their own domain yet" },
            ]}
          />
        ) : (
          <Facts
            items={[
              { label: "Domain", value: client.domain.hostname },
              { label: "DNS", value: DNS_STATUS_TEXT[client.domain.status] ?? client.domain.status },
              {
                label: "Ownership",
                value:
                  client.domain.ownerConfirmedAt === null ? (
                    "Not confirmed"
                  ) : (
                    <>
                      Confirmed <When date={client.domain.ownerConfirmedAt} />
                    </>
                  ),
              },
            ]}
          />
        )}
      </Section>

      <Section title="Notes for the builder">
        {client.brief === null ? (
          <Quiet>Nothing yet.</Quiet>
        ) : (
          <Facts
            items={[
              { label: "Anything we should know", value: client.brief.notesForBuilder },
              { label: "How it should feel", value: client.brief.styleLikes },
              {
                label: "Websites they like",
                value:
                  client.brief.referenceUrls.length === 0 ? null : (
                    <ul className="space-y-1">
                      {client.brief.referenceUrls.map((url, index) => (
                        // Links may repeat, so the position is the key.
                        <li key={index}>
                          <CustomerLink url={url} />
                        </li>
                      ))}
                    </ul>
                  ),
              },
            ]}
          />
        )}
      </Section>

      <Section title="Logo and photos" aside={client.media.length === 0 ? undefined : `${client.media.length} uploaded`}>
        {client.media.length === 0 ? (
          <Quiet>Nothing uploaded yet.</Quiet>
        ) : (
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
            {[...logo, ...photos].map((asset) => (
              <li key={asset.id}>
                <a href={`/media/${asset.id}`} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-xl">
                  {/* Served from our own route with staff access checked; next/image would cache it publicly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/media/${asset.id}`}
                    alt={asset.altText ?? ""}
                    width={asset.width}
                    height={asset.height}
                    loading="lazy"
                    className="aspect-square w-full bg-sunken object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </a>
                <p className="mt-2 text-sm font-medium">{asset.purpose === "logo" ? "Logo" : "Photo"}</p>
                <p className="mt-0.5 text-sm text-ink-2">{asset.altText ?? "No description"}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <KickoffCallSection businessId={client.businessId} />
      {websiteBought ? <WebsiteSection businessId={client.businessId} staffId={granted.user.id} notice={sp.build} /> : null}
    </>
  );
}
