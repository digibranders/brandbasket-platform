import type { ReactElement, ReactNode } from "react";
import { getWebsiteAddress } from "@/lib/server/website-address";
import { WebsiteTabs } from "./website-tabs";

/**
 * The heading, the site's address and the four tabs around every Website page. The label is a paragraph, not an h1: the
 * blog, the leads and the Pages pages begin with their own h1, and the Progress page adds one that only a screen reader sees.
 */
export async function WebsiteFrame({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  const address = await getWebsiteAddress();
  return (
    <div className="grid gap-6">
      <header className="grid gap-4">
        <div>
          <p className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Your website</p>
          {address === null ? null : <p className="mt-1 text-[0.84375rem] text-ink-2">{address}</p>}
        </div>
        <WebsiteTabs />
      </header>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
