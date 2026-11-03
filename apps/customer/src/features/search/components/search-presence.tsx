import { LineChart, MetricStrip, Panel, PanelError, type Metric } from "@/components";
import { shortDay } from "@/features/website/rules/visits";
import { formatNumber } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { Banner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { SEARCH_PRESENCE_COPY as COPY, searchDateLine, type SearchLists, type SearchListRow, type SearchPresence, type SearchSummary } from "../rules/search-presence";

/** The Google clicks figure of Home's strip: only once the days are measured, with the dates it covers and its change. */
export function googleClicksMetric(search: Loaded<SearchPresence | null> | null): Metric[] {
  if (search === null || !search.ok || search.data === null || search.data.kind !== "measured") return [];
  const { summary } = search.data;
  return [
    {
      label: COPY.homeFigure,
      value: formatNumber(summary.clicks),
      period: `${shortDay(summary.from)} to ${shortDay(summary.to)}`,
      ...(summary.change === null ? {} : { change: { value: summary.change } }),
    },
  ];
}

function strip(summary: SearchSummary): Metric[] {
  return [
    {
      label: COPY.clicks,
      value: formatNumber(summary.clicks),
      ...(summary.change === null ? {} : { change: { value: summary.change }, period: COPY.changeNote }),
    },
    ...(summary.impressions === null ? [] : [{ label: COPY.appeared, value: formatNumber(summary.impressions) }]),
    ...(summary.averagePosition === null ? [] : [{ label: COPY.position, value: formatNumber(summary.averagePosition), period: COPY.positionNote }]),
  ];
}

function RankedTable({ title, rows }: { readonly title: string; readonly rows: readonly SearchListRow[] }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-control border border-border">
      <Table>
        <TableHead>
          <TableHeader>{title}</TableHeader>
          <TableHeader align="end">{COPY.clicks}</TableHeader>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell>{row.label}</TableCell>
              <TableCell align="end">{formatNumber(row.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Lists({ lists }: { readonly lists: SearchLists }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {lists.queries.length === 0 ? null : <RankedTable title={COPY.topSearches} rows={lists.queries} />}
      {lists.pages.length === 0 ? null : <RankedTable title={COPY.topPages} rows={lists.pages} />}
    </div>
  );
}

/**
 * "How people find you on Google" (mock: google-screens-mock.html, tab 4). Drawn only when the loader returned something: the
 * switch is on and the business has a Search Console connection. Waiting says numbers are coming; a failed read says so with
 * the app's own Try again. Measured days only are drawn, so the line never dips for a day nobody counted.
 */
export function SearchPresencePanel({ search }: { readonly search: Loaded<SearchPresence | null> | null }) {
  if (search === null) return null;
  if (!search.ok) {
    return (
      <Panel title={COPY.title}>
        <PanelError failure={search.error} what={COPY.failedWhat} />
      </Panel>
    );
  }
  const presence = search.data;
  if (presence === null) return null;
  if (presence.kind === "waiting") {
    return (
      <Panel title={COPY.title}>
        <Banner>{COPY.waitingBanner}</Banner>
      </Panel>
    );
  }
  const { summary, lists } = presence;
  return (
    <Panel title={COPY.title} meta={searchDateLine(summary)}>
      <div className="flex flex-col gap-4">
        <MetricStrip label={COPY.title} metrics={strip(summary)} />
        {summary.days.length < 2 ? null : (
          <LineChart label={COPY.chartLabel} labels={summary.days.map((point) => shortDay(point.day))} current={{ name: COPY.clicks, values: summary.days.map((point) => point.value) }} height={200} />
        )}
        <p className="type-meta">{COPY.foot}</p>
        {lists === null ? null : <Lists lists={lists} />}
      </div>
    </Panel>
  );
}
