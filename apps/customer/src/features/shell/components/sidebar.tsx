import Image from "next/image";
import Link from "next/link";
import { formatQuantity } from "@/lib/format";
import { Avatar, Icon, Kbd, SERVICE_NAMES } from "@/ui";
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
  readonly onSearch: () => void;
  readonly onSignOutError: (message: string) => void;
}

/**
 * The desktop sidebar (plan 60, section 9; owner's pick, docs/design/sidebar-v4-premium.html option 2): no box of its own,
 * it is the grey the page sheet sits on. Logo, the business, search, the sections, then Plan & billing, Settings, Help &
 * calls and the person's menu at the foot. Hidden below 861px, where the tab bar takes over.
 */
export function Sidebar({ model, pathname, businessName, services, person, onSearch, onSignOutError }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-0.5 overflow-y-auto bg-sidebar px-2.5 py-3 md:flex">
      <Link href={SHELL_PATHS.home} className="mb-1 flex w-fit shrink-0 px-2 pt-1.5 pb-2.5">
        <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket, home" width={130} height={22} unoptimized />
      </Link>
      <div className="flex shrink-0 items-center gap-2.5 px-2 pt-2 pb-3">
        <Avatar name={businessName} kind="chip" />
        <div className="min-w-0">
          <p className="truncate type-sub text-ink">{businessName}</p>
          {services.length === 0 ? null : (
            <p className="truncate type-label font-normal text-ink-3">{services.length === 1 ? SERVICE_NAMES[services[0] ?? "website"] : formatQuantity(services.length, "service")}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="mb-2 flex h-8 w-full shrink-0 items-center gap-2 rounded-control border border-border-subtle bg-surface/70 px-2.5 text-left type-meta transition-colors duration-200 hover:bg-surface"
      >
        <Icon name="MagnifyingGlass" size="sm" />
        <span className="flex-1">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      {/* The column scrolls on a short screen; nothing in it shrinks, so the search box keeps its height. */}
      <nav aria-label="Main" className="flex flex-1 shrink-0 flex-col">
        {model.sections.map((section) => (
          <div key={section.label ?? "top"} className="flex flex-col gap-0.5">
            {section.label === null ? null : <h2 className="px-2.5 pt-4 pb-1 type-label text-ink-3">{section.label}</h2>}
            {section.links.map((link) => (
              <NavItem key={link.href} link={link} current={linkIsCurrent(link, pathname)} />
            ))}
          </div>
        ))}
        <div className="mt-auto flex flex-col gap-0.5 pt-4">
          {model.foot.map((link) => (
            <NavItem key={link.href} link={link} current={linkIsCurrent(link, pathname)} />
          ))}
        </div>
      </nav>
      <AccountMenu
        name={person.name}
        contact={person.contact}
        onSignOutError={onSignOutError}
        trigger={
          <button type="button" className="flex w-full shrink-0 items-center gap-2.5 rounded-control p-2 text-left transition-colors duration-200 hover:bg-surface/60">
            <Avatar name={person.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate type-sub text-ink">{person.name}</span>
              <span className="block type-label font-normal text-ink-3">{ROLE_WORDS[person.role]}</span>
            </span>
            <Icon name="DotsThree" size="sm" className="text-ink-muted" />
          </button>
        }
      />
    </aside>
  );
}

