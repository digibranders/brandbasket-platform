import { BarList, FilterBar, LineChart, MetricStrip, Panel, PanelEmpty, PanelError, type Metric } from "@/components";
import { shortDay } from "@/features/website/rules/visits";
import { formatDate, formatNumber } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { Banner, Icon, Meter, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type IconName } from "@/ui";
import { ConnectButton } from "../../accounts/components/connect-button";
import { SOCIAL_ANALYTICS_PATH } from "../../rules";
import { BrandSwitcher } from "@/legacy-social/components/brand-switcher";
import { brandOf } from "../../brand";
import { ChannelsColumn } from "../../components/channels-column";
import { SocialHeader, SocialLayout, Stack } from "../../components/parts";
import { loadChannelsColumn } from "../../loader";
import { loadAnalytics, type AnalyticsData } from "../loader";
import { ANALYTICS_CHANNELS, CHANNEL_NAMES, DEFAULT_RANGE, RANGES, type Analytics, type AnalyticsChannel, type Range } from "../rules";
import { audienceOf, hashtagRows, noticesFor, overviewOf, postRows, standingOf, type Figure, type PostRow } from "../view";

const PLATFORM_ICON: Readonly<Record<AnalyticsChannel, IconName>> = { instagram: "InstagramLogo", facebook: "FacebookLogo", google: "MapPin" };
const NOT_GIVEN = "Not given";
const DESCRIPTION = "How your posts did, and what each network can tell us.";

interface ScreenProps {
  readonly customer: CustomerContext;
  readonly range: Range;
  readonly channel: "all" | AnalyticsChannel;
  readonly now?: Date;
}

/** A change is drawn as real, not noise, once it is a tenth or more on the period before. */
const SIGNIFICANT_PERCENT = 10;

function metricsOf(figures: readonly Figure[], range: Range): Metric[] {
  return figures.map((one) => ({
    label: one.label,
    value: formatNumber(one.value),
    period: one.note === undefined ? `Last ${range} days` : `Last ${range} days. ${one.note}`,
    ...(one.change === null ? {} : { change: { value: one.change, unit: "percent" as const, significant: Math.abs(one.change) >= SIGNIFICANT_PERCENT } }),
  }));
}

function Filters() {
  return <FilterBar label="Date range" defaultValue={String(DEFAULT_RANGE)} param="range" options={RANGES.map((one) => ({ value: String(one), label: `${one} days` }))} />;
}

/** Which networks need a new permission, and which are still waiting for their first daily check. */
function Notices({ analytics, scope }: { readonly analytics: Analytics; readonly scope: readonly AnalyticsChannel[] }) {
  const { reconnect, waiting } = noticesFor(analytics, scope);
  const names = (list: readonly AnalyticsChannel[]) => list.map((one) => CHANNEL_NAMES[one]).join(" and ");
  return (
    <>
      {reconnect.length === 0 ? null : (
        <Banner
          tone="warn"
          action={
            <div className="flex flex-wrap gap-2">
              {reconnect.map((one) => (
                <ConnectButton key={one} platform={one} size="sm">{`Reconnect ${CHANNEL_NAMES[one]}`}</ConnectButton>
              ))}
            </div>
          }
        >
          Reconnect your {names(reconnect)} {reconnect.length > 1 ? "accounts" : "account"} to see numbers. We now ask the network for permission to read how your posts did, so it needs a new Allow.
        </Banner>
      )}
      {waiting.length === 0 ? null : <Banner tone="info">Numbers for {names(waiting)} appear after the first daily check. We ask each network once a day, so your first numbers show tomorrow morning.</Banner>}
    </>
  );
}

function Waiting() {
  return (
    <Panel>
      <PanelEmpty icon="ChartLineUp" title="Your numbers start tomorrow morning." description="We ask each network once a day how your posts did. Your first numbers show here after the first daily check." />
    </Panel>
  );
}

const TOTAL_COLUMNS = [
  ["reach", "Reach"],
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
] as const;

function PostsTable({ rows, now }: { readonly rows: readonly PostRow[]; readonly now: Date }) {
  return (
    <Table aria-label="How each post did">
      <TableHead>
        <TableHeader>Post</TableHeader>
        {TOTAL_COLUMNS.map(([key, name]) => (
          <TableHeader key={key} align="end" hideOnPhone={key !== "reach"}>
            {name}
          </TableHeader>
        ))}
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <div className="flex items-start gap-2.5">
                <Icon name={PLATFORM_ICON[row.platform]} size="sm" />
                <div className="min-w-0">
                  <p className="type-body font-medium text-ink">{row.title}</p>
                  <p className="type-meta">
                    {CHANNEL_NAMES[row.platform]}
                    {row.day === null ? "" : `, ${formatDate(new Date(`${row.day}T12:00:00Z`), now)}`}
                    {row.link === null ? null : (
                      <>
                        {". "}
                        <a href={row.link} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                          View post
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </TableCell>
            {TOTAL_COLUMNS.map(([key]) => (
              <TableCell key={key} align="end" hideOnPhone={key !== "reach"}>
                {row.totals[key] === undefined ? <span className="type-meta">{NOT_GIVEN}</span> : formatNumber(row.totals[key] ?? 0)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Body({ analytics, data, channel, now }: { readonly analytics: Analytics; readonly data: AnalyticsData; readonly channel: "all" | AnalyticsChannel; readonly now: Date }) {
  const scope: readonly AnalyticsChannel[] = channel === "all" ? ANALYTICS_CHANNELS : [channel];
  const overview = overviewOf(analytics, scope, data.range, data.today);
  const posts = postRows(analytics, scope);
  const hashtags = hashtagRows(analytics);
  const audience = audienceOf(analytics);
  const nothing = overview.figures.length === 0 && overview.google === null;
  return (
    <>
      <Filters />
      <Notices analytics={analytics} scope={scope} />
      {nothing ? <Waiting /> : null}
      {overview.figures.length === 0 ? null : <MetricStrip label="Reach, views and talk" metrics={metricsOf(overview.figures, data.range)} />}
      {overview.reach.days.length < 2 ? null : (
        <Panel title="Reach by day" meta={`Last ${data.range} days`}>
          <LineChart label={`Reach by day, last ${data.range} days`} labels={overview.reach.days.map(shortDay)} current={{ name: "Reach", values: overview.reach.values }} />
        </Panel>
      )}
      {overview.google === null ? null : (
        <>
          {overview.google.figures.length === 0 ? null : <MetricStrip label="Your Google listing" metrics={metricsOf(overview.google.figures, data.range)} />}
          {overview.google.views.days.length < 2 ? null : (
            <Panel title="Views of your Google listing by day" meta="Numbers for the whole listing. Google does not give numbers for each post or about who looks.">
              <LineChart label="Views of your Google listing by day" labels={overview.google.views.days.map(shortDay)} current={{ name: "Views", values: overview.google.views.values }} />
            </Panel>
          )}
          {overview.google.terms.length === 0 ? null : (
            <Panel title="What people searched to find you" meta="Google shows search terms month by month.">
              <BarList label="Searches that found your listing" items={overview.google.terms} />
            </Panel>
          )}
        </>
      )}
      {posts.length === 0 ? null : (
        <Panel title="How each post did" meta="Numbers since each post went out" flush>
          <PostsTable rows={posts} now={now} />
        </Panel>
      )}
      {hashtags.length === 0 ? null : (
        <Panel title="Which hashtags worked" meta="Worked out from your own posts" flush>
          <Table aria-label="Hashtags">
            <TableHead>
              <TableHeader>Hashtag</TableHeader>
              <TableHeader align="end">Posts</TableHeader>
              <TableHeader align="end">Average reach</TableHeader>
            </TableHead>
            <TableBody>
              {hashtags.map((row) => (
                <TableRow key={row.tag}>
                  <TableCell className="font-medium text-ink">{row.tag}</TableCell>
                  <TableCell align="end">{formatNumber(row.posts)}</TableCell>
                  <TableCell align="end">{formatNumber(row.avgReach)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      {scope.includes("instagram") && standingOf(analytics, "instagram") !== "not_connected" ? <AudiencePanel audience={audience} /> : null}
    </>
  );
}

function AudiencePanel({ audience }: { readonly audience: ReturnType<typeof audienceOf> }) {
  if (audience.groups.length > 0) {
    return (
      <Panel title="Who follows you on Instagram" meta="About two days behind">
        <div className="grid gap-6 md:grid-cols-2">
          {audience.groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="type-section">{group.title}</h3>
              <BarList label={group.title} items={group.rows} format="percent" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  if (audience.status === "too_few_followers") {
    const followers = audience.followers;
    return (
      <Panel title="Who follows you on Instagram">
        <div className="flex flex-col gap-4">
          <PanelEmpty icon="UserCircle" title="Not enough followers yet." description="Instagram shows who follows you once the account has 100 followers. We show it here as soon as Instagram does." />
          {followers === null ? null : <Meter label="Followers" value={Math.min(followers, 100)} max={100} valueText={`${formatNumber(followers)} of 100`} />}
        </div>
      </Panel>
    );
  }
  return null;
}

/** Analytics: how the business's posts and accounts did, from the posting service, with the same channels down the side as the Posts page. Each panel is drawn only when its numbers exist, and a failed read is this page's error, never zeros. */
export async function SocialAnalytics({ customer, range, channel, now = new Date() }: ScreenProps) {
  const brand = await brandOf(customer);
  const [data, column] = await Promise.all([load("social.analytics", () => loadAnalytics(customer, now, range)), load("social.channels", () => loadChannelsColumn(customer, now))]);
  const hrefFor = (next: "all" | AnalyticsChannel | "linkedin") => (next === "all" ? SOCIAL_ANALYTICS_PATH : `${SOCIAL_ANALYTICS_PATH}?channel=${next}&range=${range}`);
  return (
    <SocialLayout column={<ChannelsColumn data={column} hint="Tap a channel to see only its numbers." selected={channel} hrefFor={hrefFor} canChange={customer.role !== "viewer"} />}>
      <SocialHeader customer={customer} current={SOCIAL_ANALYTICS_PATH} waiting={null} description={DESCRIPTION} extra={brand.view === null ? null : <BrandSwitcher view={brand.view} current={brand.externalId} />} />
      <Stack>
        {!data.ok ? (
          <Panel title="Analytics">
            <PanelError failure={data.error} what="your numbers" />
          </Panel>
        ) : data.data.analytics === null ? (
          <Waiting />
        ) : (
          <Body analytics={data.data.analytics} data={data.data} channel={channel} now={now} />
        )}
      </Stack>
    </SocialLayout>
  );
}
