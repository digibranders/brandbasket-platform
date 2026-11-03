import { MetricStrip, Panel, PanelData, PanelError, type Metric } from "@/components";
import { SetupCard } from "@/features/setup/components/setup-card";
import { loadSetupAsks } from "@/features/setup/loader";
import { formatDate, formatNumber } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { Badge, Icon, LinkButton, Meter, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { loadAccounts, loadAds, loadCampaigns, loadPosts, loadReach, loadReportLink, loadWaitingPostCount, type AdsData, type PostsView } from "../loader";
import {
  AD_LEADS_NOTE,
  ASK_FOR_CHANGE_HREF,
  campaignsUpdatedAt,
  monthCounts,
  monthLine,
  SOCIAL_ACCOUNTS_PATH,
  SOCIAL_ADS_PATH,
  SOCIAL_CONTENT_PATH,
  SOCIAL_PATH,
  type CampaignRow,
  type ReachView,
} from "../rules";
import { ApprovalsSection, CalendarPanel, DEFAULT_DESCRIPTION, SocialHeader, Stack, ThisWeekPanel, waitingIn } from "./parts";

interface ScreenProps {
  readonly customer: CustomerContext;
  readonly now?: Date;
}

/** The count on the Content tab for a tab that does not load the posts itself. */
async function waitingFor(customer: CustomerContext): Promise<number | null> {
  const count = await load("social.waiting", () => loadWaitingPostCount(customer));
  return count.ok ? count.data.count : null;
}

/** The metrics we have a source for, each left out when it is unknown: never a zero that means "we do not know". */
function metrics(posts: Loaded<PostsView>, ads: Loaded<AdsData>, now: Date): Metric[] {
  const out: Metric[] = [];
  const counts = posts.ok ? monthCounts(posts.data.posts, now) : null;
  if (posts.ok && counts !== null) out.push({ label: "Posts published", value: formatNumber(counts.published), unit: `of ${formatNumber(counts.total)}`, period: posts.data.month });
  const view = ads.ok ? ads.data.ads : null;
  if (ads.ok && view !== null) {
    const source = { period: ads.data.month, ...(view.updatedAt === null ? {} : { asOf: view.updatedAt }) };
    if (view.spent !== null) out.push({ label: "Ad spend", value: view.spent, ...(view.budget === null ? {} : { unit: `of ${view.budget}` }), ...source });
    if (view.leads !== null) out.push({ label: "Leads from ads", value: formatNumber(view.leads), ...source, period: AD_LEADS_NOTE });
    if (view.costPerLead !== null) out.push({ label: "Cost per lead", value: view.costPerLead, ...source });
  }
  return out;
}

/** The reach figures staff entered, each with the month it is for and when it was entered. Empty when none was. */
function reachMetrics(reach: ReachView): Metric[] {
  const source = { period: reach.month, asOf: reach.enteredAt };
  return [
    ...(reach.reach === null ? [] : [{ label: "People reached", value: reach.reach, ...source }]),
    ...(reach.followers === null ? [] : [{ label: "Followers", value: reach.followers, ...source }]),
    ...(reach.profileVisits === null ? [] : [{ label: "Profile visits", value: reach.profileVisits, ...source }]),
  ];
}

/** Social & Ads Overview: approvals first, then the month's figures that have a source, and this week's posts. */
export async function SocialOverview({ customer, now = new Date() }: ScreenProps) {
  const [posts, ads, reach, report, asks] = await Promise.all([
    load("social.posts", () => loadPosts(customer, now)),
    load("social.ads", () => loadAds(customer, now)),
    load("social.reach", () => loadReach(customer, now)),
    load("social.report", () => loadReportLink(customer, "social")),
    load("social.setup", () => loadSetupAsks(customer, "social")),
  ]);
  const strip = metrics(posts, ads, now);
  const reachStrip = reach.ok && reach.data !== null ? reachMetrics(reach.data) : [];
  const line = posts.ok ? monthLine(posts.data.posts, now) : null;
  return (
    <>
      <SocialHeader customer={customer} current={SOCIAL_PATH} waiting={waitingIn(posts)} description={line ?? DEFAULT_DESCRIPTION} reportHref={report.ok ? report.data : null} />
      <Stack>
        {customer.role === "viewer" ? null : asks.ok ? <SetupCard asks={asks.data} /> : <Panel title="What we need from you"><PanelError failure={asks.error} what="what we need from you" /></Panel>}
        <ApprovalsSection customer={customer} posts={posts} layout="rows" now={now} />
        {strip.length === 0 ? null : <MetricStrip label="This month" metrics={strip} />}
        {reachStrip.length === 0 ? null : <MetricStrip label="Social reach" metrics={reachStrip} />}
        {reach.ok ? null : (
          <Panel title="Social reach">
            <PanelError failure={reach.error} what="your social reach" />
          </Panel>
        )}
        {ads.ok ? null : (
          <Panel title="Ads">
            <PanelError failure={ads.error} what="your ad figures" />
          </Panel>
        )}
        {posts.ok ? <ThisWeekPanel posts={posts.data.posts} now={now} /> : null}
      </Stack>
    </>
  );
}

/** Content: the posts waiting for approval as they will look, and the month's calendar. */
export async function SocialContent({ customer, now = new Date() }: ScreenProps) {
  const posts = await load("social.posts", () => loadPosts(customer, now));
  return (
    <>
      <SocialHeader customer={customer} current={SOCIAL_CONTENT_PATH} waiting={waitingIn(posts)} />
      <Stack>
        <ApprovalsSection customer={customer} posts={posts} layout="cards" now={now} />
        {posts.ok ? <CalendarPanel posts={posts.data.posts} now={now} month={posts.data.month} /> : null}
      </Stack>
    </>
  );
}

/** Ads: spend against budget, leads and cost per lead from the month's figures, and the ad money we add. Panels without a source are not drawn. */
export async function SocialAds({ customer, now = new Date() }: ScreenProps) {
  const [ads, campaigns, waiting] = await Promise.all([
    load("social.ads", () => loadAds(customer, now)),
    load("social.campaigns", () => loadCampaigns(customer, now)),
    waitingFor(customer),
  ]);
  return (
    <>
      <SocialHeader customer={customer} current={SOCIAL_ADS_PATH} waiting={waiting} />
      <Stack>
        <PanelData
          data={ads}
          title="Ads"
          what="your ad figures"
          isEmpty={(data) => data.ads === null}
          empty={{ icon: "Megaphone", title: "No ad figures for this month yet.", description: "Your ad spend and results appear here as soon as we have them." }}
          asOf={(data) => data.ads?.updatedAt ?? null}
        >
          {({ ads: view, month }) =>
            view === null ? null : (
              <div className="flex flex-col gap-4">
                {view.spentCents === null || view.budgetCents === null ? null : (
                  <Meter label={`Spent in ${month}`} value={Math.min(view.spentCents, view.budgetCents)} max={view.budgetCents} valueText={`${view.spent} of ${view.budget}`} />
                )}
                <dl className="m-0 flex flex-col gap-2 type-body">
                  {view.spent !== null && view.budget === null ? <Row label={`Spent in ${month}`} value={view.spent} /> : null}
                  {view.leads === null ? null : <Row label="Leads from ads" value={formatNumber(view.leads)} />}
                  {view.costPerLead === null ? null : <Row label="Cost per lead" value={view.costPerLead} />}
                  {view.adMoney === null ? null : <Row label="Ad money added by us each month" value={view.adMoney} />}
                </dl>
                {view.updatedAt === null ? null : <p className="type-meta">Figures updated {formatDate(view.updatedAt, now)}.</p>}
              </div>
            )
          }
        </PanelData>
        {campaigns.ok && campaigns.data.campaigns.length === 0 ? null : (
          <PanelData
            data={campaigns}
            title="Campaigns"
            what="your campaigns"
            flush
            meta={({ month, campaigns: rows }) => {
              const updated = campaignsUpdatedAt(rows);
              return updated === null ? month : `${month}. Updated ${formatDate(updated, now)}`;
            }}
          >
            {({ campaigns: rows }) => <CampaignsTable rows={rows} />}
          </PanelData>
        )}
      </Stack>
    </>
  );
}

const NOT_AVAILABLE = "Not available";

function CampaignsTable({ rows }: { readonly rows: readonly CampaignRow[] }) {
  return (
    <Table aria-label="Campaigns">
      <TableHead>
        <TableHeader>Campaign</TableHeader>
        <TableHeader hideOnPhone>Where</TableHeader>
        <TableHeader align="end">Spent</TableHeader>
        <TableHeader align="end" hideOnPhone>
          Budget
        </TableHeader>
        <TableHeader align="end">Leads</TableHeader>
        <TableHeader align="end" hideOnPhone>
          Per lead
        </TableHeader>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium text-ink">{row.name}</TableCell>
            <TableCell hideOnPhone>{row.platform}</TableCell>
            <TableCell align="end">{row.spent}</TableCell>
            <TableCell align="end" hideOnPhone>
              {row.budget ?? NOT_AVAILABLE}
            </TableCell>
            <TableCell align="end">{row.leads === null ? NOT_AVAILABLE : formatNumber(row.leads)}</TableCell>
            <TableCell align="end" hideOnPhone>
              {row.leads === null ? NOT_AVAILABLE : (row.costPerLead ?? "No leads")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className="m-0 font-medium text-ink">{value}</dd>
    </div>
  );
}

const STATUS_BADGE = {
  connected: <Badge tone="pos" icon="Check">Connected</Badge>,
  needs_attention: <Badge tone="warn" icon="Warning">Needs attention</Badge>,
  not_connected: <Badge>Not connected</Badge>,
} as const;

/** Accounts: the accounts we look after and whether we can post to each. Read only: we keep this list. */
export async function SocialAccounts({ customer, now = new Date() }: ScreenProps) {
  const [accounts, waiting] = await Promise.all([load("social.accounts", () => loadAccounts(customer)), waitingFor(customer)]);
  return (
    <>
      <SocialHeader customer={customer} current={SOCIAL_ACCOUNTS_PATH} waiting={waiting} />
      <PanelData
        data={accounts}
        title="Connected accounts"
        what="your accounts"
        flush
        isEmpty={(rows) => rows.length === 0}
        empty={{ icon: "Link", title: "No accounts are listed yet.", description: "Your Instagram, Facebook and Google accounts appear here once we have connected them." }}
      >
        {(rows) => (
          <ul>
            {rows.map((row) => (
              <li key={row.platform} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-neutral-wash text-ink-2">
                  <Icon name={row.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-body font-medium text-ink">{row.label}</p>
                  <p className="truncate type-meta">
                    {row.url === null ? (
                      (row.handle ?? "")
                    ) : (
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                        {row.handle ?? row.url}
                      </a>
                    )}
                    {row.checkedAt === null ? "" : `${row.handle === null && row.url === null ? "" : ". "}Checked ${formatDate(row.checkedAt, now)}`}
                  </p>
                </div>
                {STATUS_BADGE[row.status]}
                {row.status === "not_connected" && customer.role !== "viewer" ? (
                  <LinkButton href={ASK_FOR_CHANGE_HREF} size="sm">
                    Connect
                  </LinkButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PanelData>
    </>
  );
}

