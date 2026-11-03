import type { WebsitePage } from "@brandbasket/db";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { PageHeader, PanelData } from "@/components";
import { formatDate, formatQuantity } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { LinkButton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import type { WebsiteCore } from "../loader";
import { pagePath } from "../rules/overview";
import { ASK_FOR_CHANGE_HREF, WEBSITE_PAGES_PATH } from "../rules/paths";
import { LiveHeader, WebsiteTabs } from "./website-parts";

const askAbout = (path: string): string => `${ASK_FOR_CHANGE_HREF}&page=${encodeURIComponent(path)}`;

/** The pages of the website as the nightly sitemap sync found them. With none, an honest empty state and no Pages tab. */
export function PagesScreen({ core, pages, now }: { readonly core: WebsiteCore; readonly pages: Loaded<readonly WebsitePage[]>; readonly now: Date }) {
  const hasPages = pages.ok && pages.data.length > 0;
  const header =
    core.live === null ? (
      <PageHeader title="Website" />
    ) : (
      <LiveHeader
        description={core.live.hostname}
        visitHref={safeExternalHref(`https://${core.live.hostname}`)}
        actions={
          <LinkButton href={ASK_FOR_CHANGE_HREF} variant="primary">
            Ask for a change
          </LinkButton>
        }
        tabs={<WebsiteTabs current={WEBSITE_PAGES_PATH} hasPages={hasPages} />}
      />
    );
  return (
    <>
      {header}
      <PanelData
        title="Pages"
        data={pages}
        what="your pages"
        meta={(rows) => (rows.length === 0 ? undefined : formatQuantity(rows.length, "page"))}
        isEmpty={(rows) => rows.length === 0}
        empty={{ icon: "FileText", title: "No pages listed yet", description: "Your pages appear here once your website is live. We read them from the website each night." }}
        flush
      >
        {(rows) => (
          <Table>
            <TableHead>
              <TableHeader>Page</TableHeader>
              <TableHeader hideOnPhone>Address</TableHeader>
              <TableHeader>Last seen</TableHeader>
              <TableHeader align="end">
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableHead>
            <TableBody>
              {rows.map((page) => {
                const path = pagePath(page.url);
                return (
                  <TableRow key={page.url}>
                    <TableCell className="font-medium text-ink">{page.title ?? path}</TableCell>
                    <TableCell hideOnPhone className="type-mono">
                      {path}
                    </TableCell>
                    <TableCell>{formatDate(page.lastSeenAt, now)}</TableCell>
                    <TableCell align="end">
                      <LinkButton href={askAbout(path)} size="sm">
                        Request a change
                      </LinkButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </PanelData>
    </>
  );
}
