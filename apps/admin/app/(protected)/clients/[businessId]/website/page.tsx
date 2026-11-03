import {
  findBusinessWebsiteUrl,
  findLatestKickoffOutcome,
  findLatestProjectEventAt,
  findOpenProjectForStaff,
  findSetupCallBooking,
  listFeedbackForProject,
  listLaunchChecks,
  listPreviewVersions,
} from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { DOMAIN_CONNECT_NOTICES, readDomainConnectNotice } from "@brandbasket/shared/lib/domain-connect-notices";
import { clientSiteBaseDomain, isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { PROJECT_LAUNCH_NOTICES, readProjectLaunchNotice } from "@brandbasket/shared/lib/project-launch-notices";
import { PROJECT_PREVIEW_NOTICES, readProjectPreviewNotice } from "@brandbasket/shared/lib/project-preview-notices";
import { SUPPORT_STATUS_LABELS } from "@brandbasket/shared/lib/support";
import { DeliveryFacts, FeedbackList, NextStepCard, PreviewVersionList } from "@/components/console/delivery-tab";
import { Fold } from "@/components/console/fold";
import { ClientBrandUploader } from "@/components/console/client-brand-uploader";
import { ChangeFreeAddressForm, FreeAddressForm } from "@/components/console/free-address-form";
import { KickoffCallSection } from "@/components/console/kickoff-call-section";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { WebsiteSection } from "@/components/console/website-section";
import { billingNeedsAttention } from "@/lib/billing-attention";
import { buildPanelState } from "@/lib/build-summary";
import { isPastIncludedRounds } from "@/lib/build-rounds";
import { clientNextStep, previewLateReason } from "@/lib/client-next-step";
import { updatedPreviewDay, updatedPreviewLateReason } from "@/lib/delivery-tab";
import { readProjectMoveNotice } from "@/lib/project-move-notices";
import { readWebsiteMoveNotice } from "@/lib/website-form";
import { ProjectControls } from "@/components/project-controls";
import { openClientTab } from "@/lib/server/client-page";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { LAUNCH_RESEND_WINDOW_MS } from "@/lib/server/project-launch";
import { CustomerLink, DNS_STATUS_TEXT, Facts, MoveDomainPanel, ResendLaunchEmailForm, When } from "../parts";
import { SiteDetails } from "./site-details";

/** The query keys whose notices the Site details fold prints. */
const SITE_DETAIL_NOTICES = ["website", "hosting", "features", "listing", "tags", "google"] as const;

export const metadata: Metadata = { title: "Client website" };

export default async function ClientWebsitePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "website");
  const sp = await searchParams;
  const previewNotice = readProjectPreviewNotice(sp.preview);
  const launchNotice = readProjectLaunchNotice(sp.launch);
  const dnsNotice = readDomainConnectNotice(sp.dns);
  const [websiteUrl, websiteBought] = await Promise.all([findBusinessWebsiteUrl(getStaffDb(), client.businessId), isWebsiteBought(getStaffDb(), client.businessId)]);
  const { project } = client;
  const nextStep = clientNextStep(project);
  const buildState = buildPanelState(project);
  const now = new Date();
  // Once changes are asked for, the promise is the updated preview's day, the same one the customer is shown, not the first preview's.
  const changesAskedAt =
    project !== null && project.status === "revisions"
      ? await findLatestProjectEventAt(getStaffDb(), { projectId: project.id, status: "revisions" })
      : null;
  const updatedDay = changesAskedAt === null ? null : updatedPreviewDay(changesAskedAt);
  const late =
    project !== null && project.status === "revisions"
      ? updatedDay === null
        ? null
        : updatedPreviewLateReason(updatedDay, now)
      : nextStep === "preview"
        ? previewLateReason(project, now)
        : null;
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
  const billingAttention = billingNeedsAttention(clientPaymentState(client.billing, now), client.billing);
  const openBuild = project === null ? null : await findOpenProjectForStaff(getStaffDb(), client.businessId);
  const baseDomain = clientSiteBaseDomain();
  const build =
    openBuild === null
      ? null
      : { rounds: { used: openBuild.revisionRoundsUsed, included: openBuild.revisionRoundsIncluded }, launchPlannedOn: openBuild.launchPlannedOn };
  const latestFeedback = feedback[0] ?? null;
  const roundsPastAllowance = openBuild !== null && isPastIncludedRounds(openBuild.revisionRoundsUsed, openBuild.revisionRoundsIncluded);
  const launchEmailOpen =
    project !== null &&
    project.status === "live" &&
    project.launchedAt !== null &&
    now.getTime() - project.launchedAt.getTime() <= LAUNCH_RESEND_WINDOW_MS;
  const hasControls = websiteBought || launchEmailOpen;
  // A move or build notice is printed inside the controls, so a fold that is shut would hide the answer to what was just pressed.
  const controlsOpen = project?.status === "on_hold" || readProjectMoveNotice(sp.move) !== null || readWebsiteMoveNotice(sp.build) !== null;
  // The same holds for the site details: their notices are printed inside the fold.
  const siteDetailsOpen = SITE_DETAIL_NOTICES.some((key) => sp[key] !== undefined);

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

      {billingAttention || roundsPastAllowance ? (
        <div className="mb-8 space-y-3">
          {billingAttention ? (
            <Notice tone="problem">Billing needs attention for this client. The build stage is unchanged. Check Plan and billing before doing more work.</Notice>
          ) : null}
          {roundsPastAllowance ? (
            <Notice tone="problem">
              This build is past its included rounds of changes. Decide before doing more work; nothing is charged automatically.
            </Notice>
          ) : null}
        </div>
      ) : null}

      {project === null ? (
        <Quiet>No project yet.</Quiet>
      ) : (
        <>
          <NextStepCard
            businessId={client.businessId}
            status={project.status}
            late={late}
            rounds={build?.rounds ?? null}
            latestFeedback={latestFeedback}
            goLive={{
              doneChecks: launchChecks.map((check) => check.key),
              domain: client.domain,
              previewUrl: project.previewUrl,
              addressUnverified: launchNotice === "address-unverified",
            }}
          />
          <DeliveryFacts
            status={project.status}
            slaDueAt={project.slaDueAt}
            updatedPreviewDay={updatedDay}
            build={build}
            kickoffConfirmed={kickoff === null ? null : kickoffConfirmed}
          />
        </>
      )}
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
      {previewVersions.length === 0 ? null : (
        <Fold title="Preview versions" count={previewVersions.length} open={project?.status === "preview"}>
          <PreviewVersionList versions={previewVersions} />
        </Fold>
      )}
      {feedback.length === 0 ? null : (
        <Fold title="Customer feedback" count={feedback.length}>
          <FeedbackList
            items={feedback.map((item) => ({
              ticketId: item.ticketId,
              round: item.round,
              subject: item.subject,
              body: item.body,
              createdAt: item.createdAt,
              statusLabel: SUPPORT_STATUS_LABELS[item.status],
            }))}
          />
        </Fold>
      )}
      {hasControls ? (
        <Fold title="More controls" open={controlsOpen}>
          {launchEmailOpen ? (
            <Section title="Launch email">
              <ResendLaunchEmailForm businessId={client.businessId} />
            </Section>
          ) : null}
          {websiteBought ? <ProjectControls businessId={client.businessId} notice={sp.move} /> : null}
          {websiteBought ? <WebsiteSection businessId={client.businessId} staffId={granted.user.id} notice={sp.build} /> : null}
        </Fold>
      ) : null}

      <Section title="Domain" id={client.movingTo === null && nextStep !== "live" ? "domain" : undefined}>
        {client.domain === null ? (
          <>
            <Quiet>Not given yet.</Quiet>
            {baseDomain !== null && project !== null && buildState === "active" && project.status !== "cancelled" && project.status !== "live" ? (
              <div className="mt-6">
                <FreeAddressForm businessId={client.businessId} baseDomain={baseDomain} />
              </div>
            ) : null}
          </>
        ) : isTemporarySubdomain(client.domain.hostname) ? (
          <>
            <Facts
              items={[
                { label: "Domain", value: client.domain.hostname },
                { label: "Ownership", value: "Our temporary address, not their own domain yet" },
              ]}
            />
            {baseDomain !== null && openBuild !== null && openBuild.status !== "live" ? (
              <ChangeFreeAddressForm
                businessId={client.businessId}
                baseDomain={baseDomain}
                currentName={client.domain.hostname.slice(0, -(baseDomain.length + 1))}
              />
            ) : null}
          </>
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
        <div className="mt-6">
          <ClientBrandUploader businessId={client.businessId} />
        </div>
      </Section>
      <KickoffCallSection businessId={client.businessId} />

      <Fold title="Site details" open={siteDetailsOpen}>
        <SiteDetails client={client} query={sp} staffRole={granted.staff.role} />
      </Fold>
    </>
  );
}
