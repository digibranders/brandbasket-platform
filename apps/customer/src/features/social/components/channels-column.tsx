import Link from "next/link";
import { Panel, PanelError } from "@/components";
import type { Loaded } from "@/lib/loaded";
import { Badge } from "@/ui";
import { cx } from "@/ui/cx";
import { ChannelLogo } from "@/legacy-social/components/channel-logo";
import { ConnectButton } from "../accounts/components/connect-button";
import type { Platform } from "../analytics/rules";
import { CHANNEL_NAMES } from "../analytics/rules";
import { PLATFORM_HINTS } from "../accounts/rules";
import type { ChannelsColumnData } from "../loader";

export interface ChannelsColumnProps {
  readonly data: Loaded<ChannelsColumnData>;
  /** The channel being looked at, or all. */
  readonly selected: "all" | Platform;
  /** The address that shows one channel (or all) on this page. */
  readonly hrefFor: (channel: "all" | Platform) => string;
  readonly canChange: boolean;
}

/**
 * The page's second sidebar: the accounts posts go to, each a link that shows only that channel; Reconnect on one whose
 * connection is ending and Connect for each network with no account yet. On a phone it is a row at the top. A failed read says so, and
 * never "nothing connected".
 */
export function ChannelsColumn({ data, selected, hrefFor, canChange }: ChannelsColumnProps) {
  return (
    <aside aria-labelledby="channels-title" className="flex min-w-0 flex-col gap-3 border-t border-line bg-surface p-4 md:px-8 lg:sticky lg:top-topbar lg:h-channels-column lg:w-52 lg:shrink-0 lg:self-start lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-4 lg:pt-4 lg:pb-8">
      <h2 id="channels-title" className="type-section">
        Channels
      </h2>
      {!data.ok ? (
        <Panel>
          <PanelError failure={data.error} what="your channels" />
        </Panel>
      ) : (
        <Body data={data.data} selected={selected} hrefFor={hrefFor} canChange={canChange} />
      )}
    </aside>
  );
}

function Body({ data, selected, hrefFor, canChange }: Omit<ChannelsColumnProps, "data"> & { readonly data: ChannelsColumnData }) {
  const { rows, missing, live } = data;
  return (
    <>
      {rows.length === 0 ? null : (
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 lg:flex-col lg:overflow-visible">
          <li className="shrink-0 lg:shrink">
            <Link href={hrefFor("all")} aria-current={selected === "all" ? "true" : undefined} className={cx("flex items-center gap-2.5 rounded-control px-2 py-1.5 no-underline hover:bg-neutral-wash", selected === "all" && "bg-neutral-wash")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink text-xs font-bold text-on-primary" aria-hidden="true">
                All
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate type-body font-medium text-ink">All channels</span>
              </span>
            </Link>
          </li>
          {rows.map((row) => (
            <li key={row.id} className="shrink-0 lg:shrink">
              <Link
                href={hrefFor(row.platform)}
                aria-current={selected === row.platform ? "true" : undefined}
                className={cx("flex items-center gap-2.5 rounded-control px-2 py-1.5 no-underline hover:bg-neutral-wash", selected === row.platform && "bg-neutral-wash")}
              >
                <ChannelLogo platform={row.platform} medium />
                <span className="min-w-0 flex-1">
                  <span title={row.account} className="block truncate type-body font-medium text-ink">
                    {row.account}
                  </span>
                  <span className="sr-only">{CHANNEL_NAMES[row.platform]}</span>
                  {row.paused ? <span className="type-meta">Paused</span> : null}
                </span>
              </Link>
              {row.ending === null ? null : (
                <div className="flex flex-col items-start gap-2 pb-2 pl-12">
                  <Badge tone="warn" icon="Warning">
                    {row.ending}
                  </Badge>
                  {live && canChange ? (
                    <ConnectButton platform={row.platform} size="sm">
                      Reconnect
                    </ConnectButton>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!live || !canChange || missing.length === 0 ? null : (
        <section aria-labelledby="add-channel-title" className="flex flex-col gap-2">
          <h3 id="add-channel-title" className="type-meta font-medium">
            {rows.length === 0 ? "Connect your accounts" : "Add a channel"}
          </h3>
          {missing.map((platform) => (
            <div key={platform} className="flex flex-col items-start gap-1">
              <ConnectButton platform={platform} size="sm" className="h-auto min-h-8 w-full justify-start py-1.5 text-left leading-tight" leading={<span aria-hidden="true"><ChannelLogo platform={platform} small /></span>}>{`Connect ${platform === "google" ? "Google" : CHANNEL_NAMES[platform]}`}</ConnectButton>
              <p className="type-meta">{PLATFORM_HINTS[platform]}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
