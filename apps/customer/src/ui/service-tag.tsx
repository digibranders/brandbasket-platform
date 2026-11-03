import { cx } from "./cx";

export type ServiceKey = "website" | "social" | "search";

/** The services' names, the same in the app, in email and on the website. */
export const SERVICE_NAMES: Readonly<Record<ServiceKey, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Local SEO + AEO",
};

const MARKS: Readonly<Record<ServiceKey, string>> = {
  website: "bg-svc-site",
  social: "bg-svc-social",
  search: "bg-svc-search",
};

/** A small square mark beside the service's name. The mark is never a fill (plan 60, section 3). */
export function ServiceTag({ service, className }: { readonly service: ServiceKey; readonly className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap type-meta text-ink-2", className)}>
      <span aria-hidden className={cx("size-2 shrink-0 rounded-mark", MARKS[service])} />
      {SERVICE_NAMES[service]}
    </span>
  );
}
