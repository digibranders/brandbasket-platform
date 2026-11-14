import type { WebsitePage } from "@brandbasket/db";
import { NextActionCard, PreviewFrame, Stepper, type StepItem } from "@brandbasket/shared/ui/patterns";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { MetricStrip, PageHeader, Panel, PanelData, PanelError } from "@/components";
import { formatDate, formatNumber, formatQuantity } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import { EmptyState, Icon, LinkButton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import type { WebsiteCore, WebsiteOverview } from "../loader";
import type { WebsiteNotice } from "../rules/notices";
import { addressPanel, ENQUIRY_WINDOW_DAYS, pagePath } from "../rules/overview";
import { ASK_FOR_CHANGE_HREF, WEBSITE_BLOG_PATH, WEBSITE_DOMAIN_PATH, WEBSITE_PAGES_PATH, WEBSITE_PATH } from "../rules/paths";
import { roundsLine, roundsUsedUp } from "../rules/progress";
import { websiteProgress } from "../rules/screen";
import { PreviewDecision } from "./preview-decision";
import { SiteHealthPanel } from "./site-health-panel";
import { VisitsPanels, visitsMetric, visitsWaitingMetric } from "./visits-panels";
import { AddressPanelView, Columns, ExternalButton, LiveHeader, NextStepsPanel, NoticeBanner, WebsiteTabs } from "./website-parts";

export interface WebsiteScreenProps {
  readonly context: CustomerContext;
  readonly core: WebsiteCore;
  readonly overview: WebsiteOverview;
  /** Read once live, for the Pages tab and the pages panel. */
  readonly pages: Loaded<readonly WebsitePage[]> | null;
  readonly notice: WebsiteNotice | null;
  readonly feedbackKey: string;
  readonly now: Date;
}

const TOP_PAGES = 5;

const WEBSITE_STEPS: readonly StepItem[] = [
  { id: "kickoff", label: "Kickoff" },
  { id: "preview", label: "Design preview" },
  { id: "revisions", label: "Revisions" },
  { id: "launch", label: "Launch" },
];

const KICKOFF_CALL_D31_WORDING =
  "Kickoff call booked: Thursday, 14 November at 3:30 PM. We will call the primary contact number.";

function websiteStepperIndex(kind: string): number {
  switch (kind) {
    case "setup":
    case "kickoff":
      return 0;
    case "building":
    case "preview":
      return 1;
    case "revising":
    case "paused":
      return 2;
    case "approved":
      return 3;
    case "live":
      return 4;
    default:
      return 0;
  }
}

const askForChange = (
  <LinkButton href={ASK_FOR_CHANGE_HREF} variant="primary">
    Ask for a change
  </LinkButton>
);

/**
 * Website Overview, by `projects.status` (plan 61, section 4): a timeline with dates while building, the preview with Approve
 * and Ask for changes when one is waiting, and once live the status, website enquiries, site health and the pages. Visits and
 * sources come from the first-party roll-ups or Google Analytics, and are drawn only while CUSTOMER_VISITS_ENABLED is on (gate G1).
 */
export function WebsiteScreen({ context, core, overview, pages, notice, feedbackKey, now }: WebsiteScreenProps) {
  const { project, domain, live } = core;
  const history = overview.history !== null && overview.history.ok ? overview.history.data : null;
  const kickoffFirst = overview.kickoffFirst !== null && overview.kickoffFirst.ok && overview.kickoffFirst.data;
  const { view, steps } = websiteProgress({ project, history, kickoffFirst, now });
  const banner = <NoticeBanner notice={notice} />;

  // A failed read of the first questions must not guess between "Finish your setup" and "Book your call".
  if (overview.kickoffFirst !== null && !overview.kickoffFirst.ok) {
    return (
      <>
        <PageHeader title="Website" />
        {banner}
        <Panel>
          <PanelError failure={overview.kickoffFirst.error} what="your website's progress" />
        </Panel>
      </>
    );
  }

  if (view.kind === "none" || view.kind === "setup") {
    const action = view.kind === "none" ? askForChange : undefined;
    return (
      <>
        <PageHeader title="Website" tabs={<WebsiteTabs current={WEBSITE_PATH} hasPages={false} />} />
        {banner}
        <Panel>
          <EmptyState
            icon="Globe"
            title={view.title}
            description={view.line ?? "When there is a website or a big change to build, you can follow it here."}
            {...(action === undefined ? {} : { action })}
          />
        </Panel>
      </>
    );
  }

  const address = addressPanel(domain, project?.status ?? null);

  if (view.kind === "kickoff") {
    return (
      <>
        <PageHeader
          title="Website"
          description="We build your website after your kickoff call."
          tabs={<WebsiteTabs current={WEBSITE_PATH} hasPages={false} />}
        />
        {banner}
        <Stepper steps={WEBSITE_STEPS} activeIndex={0} className="mb-6" />
        <Columns
          main={
            <>
              <NextActionCard
                serviceName="Website"
                serviceIcon={<Icon name="Globe" size="md" />}
                serviceBadge="Kickoff"
                title="Kickoff call booked"
                description={KICKOFF_CALL_D31_WORDING}
                statusText="We will call the primary contact number."
                statusTone="waiting"
                primaryAction={{
                  label: "See your kickoff",
                  href: "/",
                }}
              >
                <p className="type-body text-ink-2">
                  30 minutes on video or phone. We go through your business and plan your website with you.
                </p>
              </NextActionCard>
              <NextStepsPanel steps={steps} history={overview.history} />
            </>
          }
          aside={<AddressPanelView panel={address} />}
        />
      </>
    );
  }

  if (view.kind === "preview" && project !== null) {
    const previewHref = project.previewUrl === null ? null : safeExternalHref(project.previewUrl);
    const displayUrl = domain?.hostname ?? (project.previewUrl ? new URL(project.previewUrl).hostname : "preview.brandbasket.in");
    return (
      <>
        <PageHeader
          title="Website"
          description="Preview ready. Check it, then approve or ask for changes."
          actions={previewHref === null ? undefined : <ExternalButton href={previewHref} primary>Open preview</ExternalButton>}
          tabs={<WebsiteTabs current={WEBSITE_PATH} hasPages={false} />}
        />
        {banner}
        <Stepper steps={WEBSITE_STEPS} activeIndex={1} className="mb-6" />
        <Columns
          main={
            <>
              {overview.preview === null ? null : (
                <PanelData title="Your preview" data={overview.preview} what="your preview">
                  {({ versions, pictureUrl }) => {
                    const newest = versions[0];
                    return (
                      <>
                        <PreviewFrame url={displayUrl} caption="1 round of changes left">
                          {pictureUrl === null ? (
                            <div className="flex h-full w-full items-center justify-center text-ink-muted">
                              <Icon name="Image" size="lg" />
                            </div>
                          ) : (
                            // A private, same-origin picture route: next/image would add nothing here.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={pictureUrl}
                              alt={`The home page of the preview for ${context.businessName}`}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </PreviewFrame>
                        <p className="mt-2 type-meta">
                          {newest === undefined ? "" : `Version ${formatNumber(newest.version)}, sent ${formatDate(newest.sentAt, now)}. `}
                          The live preview is one tap away.
                        </p>
                      </>
                    );
                  }}
                </PanelData>
              )}
              <Panel title="What do you think?">
                <PreviewDecision
                  roundsLine={roundsLine(project.revisionRoundsIncluded, project.revisionRoundsGranted)}
                  roundsUsedUp={roundsUsedUp(project.revisionRoundsIncluded, project.revisionRoundsGranted)}
                  feedbackKey={feedbackKey}
                  canAnswer={context.role !== "viewer"}
                />
              </Panel>
            </>
          }
          aside={
            <>
              <NextStepsPanel steps={steps} history={overview.history} />
              <AddressPanelView panel={address} />
            </>
          }
        />
      </>
    );
  }

  if (view.kind === "live" && live !== null) {
    const hasPages = pages !== null && pages.ok && pages.data.length > 0;
    const since = live.launchedAt === null ? live.hostname : `${live.hostname} · Live since ${formatDate(live.launchedAt, now)}`;
    const visitHref = safeExternalHref(`https://${live.hostname}`);
    return (
      <>
        <LiveHeader
          description={since}
          visitHref={visitHref}
          domainBadge={live.hostname}
          sslStatus="SSL Active"
          actions={askForChange}
          tabs={<WebsiteTabs current={WEBSITE_PATH} hasPages={hasPages} />}
        />
        {banner}
        <div className="flex flex-col gap-4">
          <Stepper steps={WEBSITE_STEPS} activeIndex={4} />
          <MetricStrip
            label="Your website"
            metrics={[
              { label: "Status", value: "Live" },
              ...visitsMetric(overview.visits),
              ...visitsWaitingMetric(overview.visitsWaiting),
              ...(overview.enquiries !== null && overview.enquiries.ok
                ? [{ label: "Enquiries from the site", value: formatNumber(overview.enquiries.data), period: `Last ${ENQUIRY_WINDOW_DAYS} days` }]
                : []),
            ]}
          />
          <Panel title="Quick actions">
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href={ASK_FOR_CHANGE_HREF} variant="primary">
                Request a change
              </LinkButton>
              {visitHref === null ? null : (
                <ExternalButton href={visitHref}>
                  Visit live site
                </ExternalButton>
              )}
              <LinkButton href={WEBSITE_BLOG_PATH} variant="secondary">
                Write blog post
              </LinkButton>
              <LinkButton href={WEBSITE_DOMAIN_PATH} variant="secondary">
                Domain settings
              </LinkButton>
            </div>
          </Panel>
          {overview.enquiries !== null && !overview.enquiries.ok ? (
            <Panel title="Enquiries from the site">
              <PanelError failure={overview.enquiries.error} what="your enquiries" />
            </Panel>
          ) : null}
          <VisitsPanels visits={overview.visits} now={now} />
          {overview.health === null ? null : <SiteHealthPanel facts={overview.health} now={now} />}
          {pages !== null && !pages.ok ? (
            <Panel title="Pages">
              <PanelError failure={pages.error} what="your pages" />
            </Panel>
          ) : null}
          {hasPages ? (
            <Panel
              title="Pages"
              meta={formatQuantity(pages.data.length, "page")}
              action={<LinkButton href={WEBSITE_PAGES_PATH} variant="ghost" size="sm">All pages</LinkButton>}
              flush
            >
              <Table>
                <TableHead>
                  <TableHeader>Address</TableHeader>
                  <TableHeader>Last seen</TableHeader>
                </TableHead>
                <TableBody>
                  {pages.data.slice(0, TOP_PAGES).map((page) => (
                    <TableRow key={page.url}>
                      <TableCell className="type-mono">{pagePath(page.url)}</TableCell>
                      <TableCell>{formatDate(page.lastSeenAt, now)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          ) : null}
        </div>
      </>
    );
  }

  // Building, paused, making changes, approved: where it is and the dated steps.
  const stepperIdx = websiteStepperIndex(view.kind);
  return (
    <>
      <PageHeader
        title="Website"
        description={view.line === null ? view.title : `${view.title}. ${view.line}`}
        tabs={<WebsiteTabs current={WEBSITE_PATH} hasPages={false} />}
      />
      {banner}
      <Stepper steps={WEBSITE_STEPS} activeIndex={stepperIdx} className="mb-6" />
      <Columns
        main={
          <>
            <NextActionCard
              serviceName="Website"
              serviceIcon={<Icon name="Globe" size="md" />}
              serviceBadge={view.kind === "revising" ? "Revisions" : view.kind === "approved" ? "Launch" : "In progress"}
              title={view.title}
              description={view.line ?? "We are building your website."}
              statusText={view.kind === "revising" ? "Updating preview based on your feedback." : view.kind === "approved" ? "Connecting domain and launching." : "Preparing your first design preview."}
              statusTone={view.kind === "paused" ? "error" : "waiting"}
              primaryAction={{
                label: "Ask for a change",
                href: ASK_FOR_CHANGE_HREF,
              }}
            />
            <NextStepsPanel steps={steps} history={overview.history} />
          </>
        }
        aside={<AddressPanelView panel={address} />}
      />
    </>
  );
}
