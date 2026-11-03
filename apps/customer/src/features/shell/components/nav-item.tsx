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
    <span className={cx("min-w-5 rounded-full bg-accent-wash px-1.5 text-center type-label text-accent-text", className)}>
      <span aria-hidden>{link.count}</span>
      <span className="sr-only">
        , {link.count} {countWords(link)}
      </span>
    </span>
  );
}

/** One sidebar link (plan 60, section 9): icon, label, then its count or its service mark. */
export function NavItem({ link, current }: { readonly link: NavLink; readonly current: boolean }) {
  const notBought = link.bought === false;
  return (
    <Link
      href={link.href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "flex h-8 items-center gap-2.5 rounded-control px-2.5 type-table no-underline transition-colors duration-100 hover:bg-surface-hover",
        current ? "bg-surface-selected font-medium text-ink hover:bg-surface-selected" : notBought ? "text-ink-3" : "text-ink-2",
      )}
    >
      <Icon name={link.icon} className={current ? "text-accent-text" : notBought ? "text-ink-muted" : undefined} />
      <span className="min-w-0 flex-1 truncate">
        {link.label}
        {notBought ? <span className="sr-only">, not on your plan</span> : null}
      </span>
      {link.count === undefined ? link.service === undefined ? null : <ServiceMark service={link.service} bought={!notBought} /> : <CountPill link={link} />}
    </Link>
  );
}
