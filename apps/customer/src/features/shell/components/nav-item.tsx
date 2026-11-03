import Link from "next/link";
import { Icon } from "@/ui";
import { cx } from "@/ui/cx";
import { SHELL_PATHS, type NavLink } from "../rules";

/** What a link's number counts, for screen readers. */
export function countWords(link: NavLink): string {
  return link.href === SHELL_PATHS.enquiries ? "new" : "waiting";
}

/** The number beside a link, said in full to screen readers: "3, 3 waiting" would repeat, so the digit is hidden. */
export function CountPill({ link, className }: { readonly link: NavLink; readonly className?: string }) {
  if (link.count === undefined) return null;
  return (
    <span className={cx("min-w-5 rounded-full bg-primary px-1.5 text-center type-label text-on-primary", className)}>
      <span aria-hidden>{link.count}</span>
      <span className="sr-only">
        , {link.count} {countWords(link)}
      </span>
    </span>
  );
}

const TILE_FILLED = { website: "bg-svc-site", social: "bg-svc-social", search: "bg-svc-search" } as const;

/**
 * One sidebar link (plan 60, section 9; owner's pick, docs/design/sidebar-v4-new.html option E). Pages are a light icon
 * that fills in cobalt on the current page, which gets a soft blue wash. A service is a coloured tile (rattan Website,
 * teal Social, blue Local SEO); one not on the plan is an empty outline with "Add" (the link opens its Not bought page).
 */
export function NavItem({ link, current }: { readonly link: NavLink; readonly current: boolean }) {
  const notBought = link.bought === false;
  const service = link.service;
  return (
    <Link
      href={link.href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "flex shrink-0 items-center gap-2.5 rounded-control px-2.5 type-table no-underline transition duration-200 ease-out",
        service === undefined ? "h-8" : "h-9",
        current ? "bg-surface-selected font-medium text-ink" : notBought ? "text-ink-3 hover:bg-canvas" : "text-ink-2 hover:bg-canvas hover:text-ink",
      )}
    >
      {service === undefined ? (
        <Icon name={link.icon} filled={current} className={current ? "text-primary" : "text-ink-3"} />
      ) : (
        <span
          aria-hidden
          className={cx("grid size-6.5 shrink-0 place-items-center rounded-control", notBought ? "border border-border text-ink-disabled" : cx(TILE_FILLED[service], "text-on-primary"))}
        >
          <Icon name={link.icon} size="sm" filled={!notBought} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {link.label}
        {notBought ? <span className="sr-only">, not on your plan</span> : null}
      </span>
      {link.count !== undefined ? (
        <CountPill link={link} />
      ) : notBought ? (
        <span aria-hidden className="type-label text-accent-text">
          Add
        </span>
      ) : null}
    </Link>
  );
}
