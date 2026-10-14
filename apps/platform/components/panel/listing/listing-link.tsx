"use client";

import { useState, type ReactElement } from "react";
import { useBrand } from "@/components/panel/brand-provider";
import { brandText } from "@/lib/brand";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { Button, ExternalButtonLink } from "@firstfold/shared/ui/panel/button";

interface ListingLinkProps {
  readonly url: string;
  /** Only a live listing has a page to open or share. */
  readonly live: boolean;
}

const VIEW_LABEL = "View on Firstfold Local";

/** The listing's address, a link to open it, and a copy button that falls back to asking for the text to be
 * selected when the clipboard is not available (an insecure origin, or permission refused). */
export function ListingLink({ url, live }: ListingLinkProps): ReactElement {
  const [note, setNote] = useState("");
  const viewLabel = brandText(VIEW_LABEL, useBrand());

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied.");
    } catch {
      setNote("Select the address above to copy it.");
    }
  }

  const arrow = <ArrowIcon className="size-4 -rotate-45" />;

  return (
    <div className="space-y-4">
      <p className="break-all font-mono text-xs text-ink-soft">{url.replace(/^https:\/\//, "")}</p>
      <div className="flex flex-wrap items-center gap-3">
        {live ? (
          <ExternalButtonLink href={url} target="_blank" rel="noopener noreferrer" size="sm">
            {viewLabel}
            {arrow}
            <span className="sr-only">(opens in a new tab)</span>
          </ExternalButtonLink>
        ) : (
          <Button type="button" size="sm" disabled>
            {viewLabel}
            {arrow}
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" disabled={!live} onClick={() => void copy()}>
          Copy link
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-ink-soft">
          {note}
        </p>
      </div>
    </div>
  );
}
