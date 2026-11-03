import type { WebsitePage } from "@brandbasket/db";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { MetricStrip, PageHeader, Panel, PanelData, PanelError } from "@/components";
import { formatDate, formatNumber, formatQuantity } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import { EmptyState, Icon, LinkButton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import type { WebsiteCore, WebsiteOverview } from "../loader";
import type { WebsiteNotice } from "../rules/notices";
import { addressPanel, ENQUIRY_WINDOW_DAYS, pagePath } from "../rules/overview";
import { ASK_FOR_CHANGE_HREF, WEBSITE_PAGES_PATH, WEBSITE_PATH } from "../rules/paths";
import { roundsLine, roundsUsedUp } from "../rules/progress";
import { websiteProgress } from "../rules/screen";
import { PreviewDecision } from "./preview-decision";
import { SiteHealthPanel } from "./site-health-panel";
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

const askForChange = (
  <LinkButton href={ASK_FOR_CHANGE_HREF} variant="primary">
    Ask for a change
  </LinkButton>
);

/**
 * Website Overview, by `projects.status` (plan 61, section 4): a timeline with dates while building, the preview with Approve
 * and Ask for changes when one is waiting, and once live the status, website enquiries, site health and the pages. Visits and
 * sources have no customer data source yet (gate G1), so those panels are not rendered.
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

  if (view.kind === "none" || view.kind === "setup" || view.kind === "kickoff") {
    const action =
      view.kind === "none" ? askForChange : view.kind === "kickoff" ? <LinkButton href="/" variant="primary">See your kickoff</LinkButton> : undefined;
    return (
      <>
        <PageHeader title="Website" />
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

  if (view.kind === "preview" && project !== null) {
    const previewHref = project.previewUrl === null ? null : safeExternalHref(project.previewUrl);
    return (
      <>
        <PageHeader
          title="Website"
          description="Preview ready. Check it, then approve or ask for changes."
          actions={previewHref === null ? undefined : <ExternalButton href={previewHref} primary>Open preview</ExternalButton>}
        />
        {banner}
        <Columns
          main={
            <>
              {overview.preview === null ? null : (
                <PanelData title="Your preview" data={overview.preview} what="your preview">
                  {({ versions, pictureUrl }) => {
                    const newest = versions[0];
                    return (
                      <>
                        {pictureUrl === null ? (
                          <div className="flex aspect-video items-center justify-center rounded-control border border-border bg-neutral-wash text-ink-muted">
                            <Icon name="Image" size="lg" />
                          </div>
                        ) : (
                          // A private, same-origin picture route: next/image would add nothing here.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pictureUrl} alt={`The home page of the preview for ${context.businessName}`} className="w-full rounded-control border border-border" />
                        )}
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
    return (
      <>
        <LiveHeader description={since} visitHref={safeExternalHref(`https://${live.hostname}`)} actions={askForChange} tabs={<WebsiteTabs current={WEBSITE_PATH} hasPages={hasPages} />} />
        {banner}
        <div className="flex flex-col gap-4">
          <MetricStrip
            label="Your website"
            metrics={[
              { label: "Status", value: "Live" },
              ...(overview.enquiries !== null && overview.enquiries.ok
                ? [{ label: "Enquiries from the site", value: formatNumber(overview.enquiries.data), period: `Last ${ENQUIRY_WINDOW_DAYS} days` }]
                : []),
            ]}
          />
          {overview.enquiries !== null && !overview.enquiries.ok ? (
            <Panel title="Enquiries from the site">
              <PanelError failure={overview.enquiries.error} what="your enquiries" />
            </Panel>
          ) : null}
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
  return (
    <>
      <PageHeader title="Website" description={view.line === null ? view.title : `${view.title}. ${view.line}`} />
      {banner}
      <Columns main={<NextStepsPanel steps={steps} history={overview.history} />} aside={<AddressPanelView panel={address} />} />
    </>
  );
}
