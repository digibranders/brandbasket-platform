import Link from "next/link";
import { ServiceMark } from "@/components";
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

/**
 * One sidebar link (plan 60, section 9; owner's pick, docs/design/sidebar-v4-premium.html option 2): a light icon that
 * fills in cobalt on the current page, which lifts off the sidebar as a white chip; then its count, its service mark, or
 * for a service not on the plan an "Add" that shows on hover (the link opens that service's Not bought page).
 */
export function NavItem({ link, current }: { readonly link: NavLink; readonly current: boolean }) {
  const notBought = link.bought === false;
  return (
    <Link
      href={link.href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "group flex h-8 shrink-0 items-center gap-2.5 rounded-control px-2.5 type-table no-underline transition duration-200 ease-out",
        current ? "bg-surface font-medium text-ink shadow-chip" : notBought ? "text-ink-3 hover:bg-surface/60" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
      )}
    >
      <Icon name={link.icon} filled={current} className={current ? "text-primary" : notBought ? "text-ink-muted" : "text-ink-3"} />
      <span className="min-w-0 flex-1 truncate">
        {link.label}
        {notBought ? <span className="sr-only">, not on your plan</span> : null}
      </span>
      {link.count !== undefined ? (
        <CountPill link={link} />
      ) : notBought ? (
        <span aria-hidden className="type-label text-accent-text opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          Add
        </span>
      ) : link.service === undefined ? null : (
        <ServiceMark service={link.service} bought />
      )}
    </Link>
  );
}
