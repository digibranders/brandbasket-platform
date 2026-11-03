import { SEARCH_PRESENCE_COPY } from "@/features/search/rules/search-presence";
import { BarList, LineChart, Panel, PanelError, type Metric } from "@/components";
import { formatNumber } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import type { VisitsData } from "../loader";
import { listPeriod, periodLine, shortDay, updatedLine } from "../rules/visits";
import { Columns } from "./website-parts";

/** The Visits figure of the strip: left out until a day has been counted, and never drawn as 0 for a source that is not measuring. */
export function visitsMetric(visits: Loaded<VisitsData | null> | null): Metric[] {
  if (visits === null || !visits.ok || visits.data === null) return [];
  const { summary } = visits.data;
  return [
    {
      label: "Visits",
      value: formatNumber(summary.total),
      period: periodLine(summary),
      asOf: summary.updatedAt,
      ...(summary.change === null ? {} : { change: { value: summary.change, unit: "percent" as const } }),
    },
  ];
}

/** Where the Visits figure would be while a connected Google site has no measured day yet: one line, never a 0. */
export function visitsWaitingMetric(waiting: Loaded<boolean> | null): Metric[] {
  if (waiting === null || !waiting.ok || !waiting.data) return [];
  return [{ label: SEARCH_PRESENCE_COPY.websiteLabel, value: SEARCH_PRESENCE_COPY.websiteValue, period: SEARCH_PRESENCE_COPY.websiteLine }];
}

/**
 * Visits by day, the most visited pages and where visitors come from (mock: screens-b.js, Website). Each is drawn only when its
 * numbers exist and carries the date they were last updated. A failed read says so in its own panel.
 */
export function VisitsPanels({ visits, now }: { readonly visits: Loaded<VisitsData | null> | null; readonly now: Date }) {
  if (visits === null) return null;
  if (!visits.ok) {
    return (
      <Panel title="Visits">
        <PanelError failure={visits.error} what="your visits" />
      </Panel>
    );
  }
  if (visits.data === null) return null;
  const { summary, lists } = visits.data;
  const listMeta = lists === null ? null : `${listPeriod(lists.month, now)}. ${updatedLine(lists.updatedAt, summary.source, now)}`;
  return (
    <>
      {summary.days.length < 2 ? null : (
        <Panel title="Visits by day" meta={updatedLine(summary.updatedAt, summary.source, now)}>
          <LineChart
            label="Website visits per day"
            labels={summary.days.map((point) => shortDay(point.day))}
            current={{ name: "Visits", values: summary.days.map((point) => point.value) }}
          />
        </Panel>
      )}
      {lists === null ? null : (
        <Columns
          main={
            lists.pages.length === 0 ? null : (
              <Panel title="Most visited pages" meta={listMeta} flush>
                <Table>
                  <TableHead>
                    <TableHeader>Page</TableHeader>
                    <TableHeader align="end">Views</TableHeader>
                  </TableHead>
                  <TableBody>
                    {lists.pages.map((page) => (
                      <TableRow key={page.label}>
                        <TableCell className="type-mono">{page.label}</TableCell>
                        <TableCell align="end">{formatNumber(page.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            )
          }
          aside={
            lists.channels.length === 0 ? null : (
              <Panel title="Where visitors come from" meta={listMeta}>
                <BarList label="Visits by where visitors came from" items={lists.channels} />
              </Panel>
            )
          }
        />
      )}
    </>
  );
}
