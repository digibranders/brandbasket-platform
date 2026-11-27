"use client";

import { debounce, parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { formatDate, formatNumber } from "@/lib/format";
import { Chips, Icon, IconButton, Input, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow, type ChipOption, type IconName } from "@/ui";
import { pagePosts } from "../posts-page";
import { ANALYTICS_CHANNELS, CHANNEL_NAMES, type AnalyticsChannel } from "../rules";
import type { PostRow } from "../view";

const PLATFORM_ICON: Readonly<Record<AnalyticsChannel, IconName>> = { instagram: "InstagramLogo", facebook: "FacebookLogo", google: "MapPin" };
const NOT_GIVEN = "Not given";
const TOTAL_COLUMNS = [
  ["reach", "Reach"],
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
] as const;

/**
 * How each post did: five posts a page with a serial number (it carries on from page to page), a network filter and a search, all kept in the browser
 * and in the address (`?net=`, `?q=`, `?page=`), so the back button and a shared link work. The network chips are shown only when more than one network has posts.
 */
export function PostsTable({ rows, nowIso }: { readonly rows: readonly PostRow[]; readonly nowIso: string }) {
  const now = new Date(nowIso);
  const [net, setNet] = useQueryState("net", parseAsString.withDefault("all").withOptions({ shallow: true, clearOnDefault: true }));
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault("").withOptions({ shallow: true, clearOnDefault: true, limitUrlUpdates: debounce(300) }));
  const [pageAsked, setPage] = useQueryState("page", parseAsInteger.withDefault(1).withOptions({ shallow: true, clearOnDefault: true }));
  const present = ANALYTICS_CHANNELS.filter((one) => rows.some((row) => row.platform === one));
  const platform = (present as readonly string[]).includes(net) ? (net as AnalyticsChannel) : "all";
  const options: ChipOption[] = [{ value: "all", label: "All", count: rows.length }, ...present.map((one) => ({ value: one, label: CHANNEL_NAMES[one], count: rows.filter((row) => row.platform === one).length }))];
  const view = pagePosts(rows, { platform, query, page: pageAsked });
  const last = view.firstNumber + view.rows.length - 1;

  return (
    <div className="flex flex-col">
      <div className="flex min-w-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        {present.length < 2 ? <span /> : <Chips aria-label="Network" options={options} value={platform} onValueChange={(next) => void Promise.all([setNet(next), setPage(1)])} className="min-w-0" />}
        <div className="relative md:w-64">
          <Icon name="MagnifyingGlass" size="sm" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <Input type="search" aria-label="Search posts" placeholder="Search posts" value={query} onChange={(event) => void Promise.all([setQuery(event.target.value), setPage(1)])} className="pl-10" />
        </div>
      </div>
      <Table aria-label="How each post did">
        <TableHead>
          <TableHeader className="w-16">Sr no</TableHeader>
          <TableHeader>Post</TableHeader>
          {TOTAL_COLUMNS.map(([key, name]) => (
            <TableHeader key={key} align="end" hideOnPhone={key !== "reach"}>
              {name}
            </TableHeader>
          ))}
        </TableHead>
        <TableBody>
          {view.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2 + TOTAL_COLUMNS.length} className="py-6 text-center">
                <span className="type-meta">No posts match.</span>
              </TableCell>
            </TableRow>
          ) : (
            view.rows.map((row, index) => (
              <TableRow key={row.key}>
                <TableCell className="type-meta tabular-nums">{view.firstNumber + index}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Icon name={PLATFORM_ICON[row.platform]} size="sm" className="shrink-0" />
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
            ))
          )}
        </TableBody>
      </Table>
      <TableFooter className="justify-between">
        <span aria-live="polite">{view.total === 0 ? "No posts" : `Showing ${view.firstNumber} to ${last} of ${view.total} ${view.total === 1 ? "post" : "posts"}`}</span>
        {view.pageCount <= 1 ? null : (
          <nav aria-label="Pages of posts" className="flex items-center gap-1">
            <IconButton icon="CaretLeft" label="Previous page" disabled={view.page <= 1} onClick={() => void setPage(view.page - 1)} />
            <span className="px-1">{`Page ${view.page} of ${view.pageCount}`}</span>
            <IconButton icon="CaretRight" label="Next page" disabled={view.page >= view.pageCount} onClick={() => void setPage(view.page + 1)} />
          </nav>
        )}
      </TableFooter>
    </div>
  );
}
