import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";

const SERVICE_TAGS: Readonly<Record<string, { readonly label: string; readonly dot: string }>> = {
  "managed-website": { label: "Website", dot: "bg-c-site" },
  "digital-growth": { label: "Social & Ads", dot: "bg-c-growth" },
  "local-seo-aeo": { label: "Search", dot: "bg-c-search" },
};

/** The services a business has, each with its colour. "None" when it has none. */
export function ServiceTags({ addOns }: { readonly addOns: readonly string[] }): ReactElement {
  if (addOns.length === 0) return <span className="text-xs text-ink-2">None</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {addOns.map((addOn) => {
        const tag = SERVICE_TAGS[addOn];
        if (tag === undefined) return null;
        return (
          <span key={addOn} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
            <span aria-hidden="true" className={cn("size-[7px] rounded-[2px]", tag.dot)} />
            {tag.label}
          </span>
        );
      })}
    </span>
  );
}
