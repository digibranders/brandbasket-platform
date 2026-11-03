import Image from "next/image";
import Link from "next/link";
import { formatQuantity } from "@/lib/format";
import { Avatar, Icon, SERVICE_NAMES } from "@/ui";
import { cx } from "@/ui/cx";
import { linkIsCurrent, SHELL_PATHS, type NavModel } from "../rules";
import { AccountMenu } from "./account-menu";
import { NavItem } from "./nav-item";

const ROLE_WORDS = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

export interface SidebarProps {
  readonly model: NavModel;
  readonly pathname: string;
  readonly businessName: string;
  readonly services: readonly (keyof typeof SERVICE_NAMES)[];
  readonly person: { readonly name: string; readonly contact: string; readonly role: keyof typeof ROLE_WORDS };
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onSignOutError: (message: string) => void;
}

/**
 * The desktop sidebar (plan 60, section 9; owner's pick, docs/design/sidebar-v4-new.html option E): a white column with a
 * hairline edge. Logo, the business card, the sections (search lives in the top bar), then Plan & billing, Settings,
 * Help & calls and the person's menu at the foot. The button beside the logo folds it to a 64px icon rail (AppShell
 * remembers the choice). Hidden below 861px, where the tab bar takes over.
 */
export function Sidebar({ model, pathname, businessName, services, person, collapsed, onToggle, onSignOutError }: SidebarProps) {
  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors duration-200 hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Icon name="SidebarSimple" />
    </button>
  );
  return (
    <aside
      className={cx(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-r border-border bg-surface py-3.5 transition-all duration-200 ease-out md:flex",
        collapsed ? "w-rail px-2" : "w-sidebar px-2.5",
      )}
    >
      <div className={cx("mb-3 flex shrink-0 items-center", collapsed ? "flex-col gap-2" : "justify-between pt-1.5 pl-2")}>
        <Link href={SHELL_PATHS.home} className="flex w-fit shrink-0">
          {collapsed ? (
            <Image src="/brand/brandbasket-mark.svg" alt="Brandbasket, home" width={28} height={28} unoptimized />
          ) : (
            <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket, home" width={130} height={22} unoptimized />
          )}
        </Link>
        {toggle}
      </div>
      <div
        title={collapsed ? businessName : undefined}
        className={cx("mb-1.5 flex shrink-0 items-center gap-2.5 rounded-panel bg-canvas", collapsed ? "justify-center p-1.5" : "p-2.5")}
      >
        <Avatar name={businessName} kind="chip" />
        {collapsed ? (
          <span className="sr-only">{businessName}</span>
        ) : (
          <div className="min-w-0">
            <p className="truncate type-sub text-ink">{businessName}</p>
            {services.length === 0 ? null : (
              <p className="truncate type-label font-normal text-ink-3">{services.length === 1 ? SERVICE_NAMES[services[0] ?? "website"] : formatQuantity(services.length, "service")}</p>
            )}
          </div>
        )}
      </div>
      {/* The column scrolls on a short screen; nothing in it shrinks. */}
      <nav aria-label="Main" className="flex flex-1 shrink-0 flex-col">
        {model.sections.map((section) => (
          <div key={section.label ?? "top"} className={cx("flex flex-col gap-0.5", collapsed && section.label !== null && "mt-2 border-t border-border pt-2")}>
            {section.label === null ? null : <h2 className={collapsed ? "sr-only" : "px-2.5 pt-4 pb-1 type-label text-ink-3"}>{section.label}</h2>}
            {section.links.map((link) => (
              <NavItem key={link.href} link={link} current={linkIsCurrent(link, pathname)} collapsed={collapsed} />
            ))}
          </div>
        ))}
        <div className="mt-auto flex flex-col gap-0.5 pt-4">
          {model.foot.map((link) => (
            <NavItem key={link.href} link={link} current={linkIsCurrent(link, pathname)} collapsed={collapsed} />
          ))}
        </div>
      </nav>
      <AccountMenu
        name={person.name}
        contact={person.contact}
        onSignOutError={onSignOutError}
        trigger={
          <button
            type="button"
            title={collapsed ? person.name : undefined}
            className={cx("flex w-full shrink-0 items-center gap-2.5 rounded-control text-left transition-colors duration-200 hover:bg-canvas", collapsed ? "justify-center p-1.5" : "p-2")}
          >
            <Avatar name={person.name} />
            {collapsed ? (
              <span className="sr-only">{person.name}, account menu</span>
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-sub text-ink">{person.name}</span>
                  <span className="block type-label font-normal text-ink-3">{ROLE_WORDS[person.role]}</span>
                </span>
                <Icon name="DotsThree" size="sm" className="text-ink-muted" />
              </>
            )}
          </button>
        }
      />
    </aside>
  );
}
