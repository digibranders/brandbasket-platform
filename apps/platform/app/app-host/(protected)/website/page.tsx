import { Globe } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { ReactElement } from "react";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { cn } from "@brandbasket/shared/lib/cn";
import { DARK_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageColumns } from "@/components/v2/page";
import { AddressCard } from "@/components/website/address-card";
import { ChangeYourselfCard } from "@/components/website/change-yourself-card";
import { DetailsCard } from "@/components/website/details-card";
import { LiveCard } from "@/components/website/live-card";
import { PreviewCard } from "@/components/website/preview-card";
import { RecentChangesCard } from "@/components/website/recent-changes-card";
import { SiteHealthCard } from "@/components/website/site-health-card";
import { StageHeader } from "@/components/website/stage-header";
import { Timeline } from "@/components/website/timeline";
import { VisitsCard } from "@/components/website/visits-card";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { quietly } from "@/lib/server/quietly";
import { loadRequests } from "@/lib/server/requests";
import { loadSiteHealth } from "@/lib/server/site-health";
import { loadVisits } from "@/lib/server/site-visits";
import { loadWebsite } from "@/lib/server/website";
import { addressCardView, siteAddress } from "@/lib/website/address";
import { changesView, detailRows, inProgressRow, recentChanges, stageChip, versionRows } from "@/lib/website/history";
import { roundsLine, roundsUsedUp } from "@/lib/website/progress-view";
import { readWebsiteNotice, WEBSITE_NOTICES } from "@/lib/website/notices";
import { askAboutHref } from "@/lib/website/tabs";

export const metadata: Metadata = { title: "Website" };

interface WebsitePageProps {
  readonly searchParams: Promise<{ readonly response?: string | string[] }>;
}

/** Overview: where the website stands, every preview we sent, what the customer asked to change, what happens next and the details. */
export default async function WebsitePage({ searchParams }: WebsitePageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireWebsiteClient();
  // This is for paid accounts; Home tells the rest what is next.
  if (!billing.hasAccess) redirect("/");
  const { response } = await searchParams;
  const notice = readWebsiteNotice(response);
  const now = new Date();
  const data = await loadWebsite(tenant, now);
  const { project, domain, live, view } = data;

  const noticeLine =
    notice === null ? null : (
      <p role={WEBSITE_NOTICES[notice].ok ? "status" : "alert"} className={cn("text-[0.8125rem] font-semibold", WEBSITE_NOTICES[notice].ok ? "text-sage-deep" : "text-error")}>
        {WEBSITE_NOTICES[notice].text}
      </p>
    );

  if (view.kind === "none") {
    return (
      <>
        {noticeLine}
        <EmptyState
          icon={Globe}
          title={view.title}
          text="When there is a website or a big change to build, you can follow it here."
          action={
            <Link href={askAboutHref("")} className={DARK_BUTTON}>
              Ask for a change
            </Link>
          }
        />
      </>
    );
  }

  const domainIsTemporary = domain !== null && isTemporarySubdomain(domain.hostname);
  const address = siteAddress({ liveHostname: live?.hostname ?? null, domainHostname: domain?.hostname ?? null, domainIsTemporary });
  const addressCard = addressCardView({
    domain: domain === null ? null : { hostname: domain.hostname, status: domain.status },
    isFreeAddress: domainIsTemporary,
    live: live !== null,
    projectStatus: project?.status ?? null,
  });
  const status = project?.status ?? null;
  const roundsIncluded = project?.revisionRoundsIncluded ?? 0;
  const roundsGranted = project?.revisionRoundsGranted ?? 0;
  const isLive = view.kind === "live";
  // A failed read leaves the card out; an empty list is a real answer and the card says so.
  const recent = isLive ? await quietly("website", "the recent changes", null, async () => recentChanges((await loadRequests(tenant, billing.hasWebsite)).items)) : null;
  // Each failed read leaves its card out. Visits is null while its switch is off, and nothing is read then.
  const [health, visits] =
    isLive && live !== null
      ? await Promise.all([
          quietly("website", "the site health", null, () => loadSiteHealth(tenant, now)),
          quietly("website", "the visits", null, () => loadVisits(tenant, now)),
        ])
      : [null, null];

  return (
    <>
      {noticeLine}
      <StageHeader view={view} chip={stageChip(view.kind)} />
      <PageColumns
        main={
          <>
            {isLive && live !== null ? <LiveCard hostname={live.hostname} /> : null}
            {health === null ? null : <SiteHealthCard facts={health} now={now} />}
            {visits === null ? null : <VisitsCard visits={visits} now={now} />}
            <PreviewCard
              rows={versionRows(data.versions, data.changes, status)}
              inProgress={inProgressRow(data.versions, status, data.previewDue)}
              // Once live, the same asks are listed under Recent changes.
              changes={isLive ? null : changesView(data.changes, data.versions, roundsIncluded)}
              reviewing={view.kind === "preview"}
              pictureUrl={data.pictureUrl}
              previewUrl={project?.previewUrl ?? null}
              address={address}
              businessName={tenant.businessName}
              feedbackKey={randomUUID()}
              roundsLine={roundsLine(roundsIncluded, roundsGranted)}
              roundsUsedUp={roundsUsedUp(roundsIncluded, roundsGranted)}
            />
            {recent === null ? null : <RecentChangesCard changes={recent} />}
          </>
        }
        aside={
          <>
            {isLive ? <ChangeYourselfCard /> : data.steps.length === 0 ? null : <Timeline steps={data.steps} />}
            <DetailsCard
              rows={detailRows({
                live: isLive,
                address,
                plannedLaunch: data.plannedLaunch,
                launchedAt: live?.launchedAt ?? project?.launchedAt ?? null,
                roundsUsed: roundsGranted,
                roundsIncluded,
                versionsSent: data.versions.length,
              })}
            />
            {addressCard === null ? null : <AddressCard view={addressCard} />}
            {isLive ? null : <p className="text-[0.84375rem] leading-relaxed text-ink-2">Enquiries appears here once your website is live.</p>}
          </>
        }
      />
    </>
  );
}
