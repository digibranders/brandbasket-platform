import Image from "next/image";
import Link from "next/link";
import { formatQuantity } from "@/lib/format";
import { Avatar, Icon, Kbd } from "@/ui";
import { linkIsCurrent, SHELL_PATHS, type NavModel } from "../rules";
import { AccountMenu } from "./account-menu";
import { NavItem } from "./nav-item";

const ROLE_WORDS = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

export interface SidebarProps {
  readonly model: NavModel;
  readonly pathname: string;
  readonly businessName: string;
  readonly serviceCount: number;
  readonly person: { readonly name: string; readonly contact: string; readonly role: keyof typeof ROLE_WORDS };
  readonly onSearch: () => void;
  readonly onSignOutError: (message: string) => void;
}

/**
 * The desktop sidebar (plan 60, section 9): logo, the business, search, the sections, then Plan & billing, Settings, Help
 * & calls and the person's menu at the foot. Hidden below 861px, where the tab bar takes over.
 */
export function Sidebar({ model, pathname, businessName, serviceCount, person, onSearch, onSignOutError }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-sidebar px-2 py-2.5 md:flex">
      <Link href={SHELL_PATHS.home} className="mb-1 flex w-fit px-2 pt-1.5 pb-2.5">
        <Image src="/brand/brandbasket-lockup-ink.svg" alt="Brandbasket, home" width={126} height={22} unoptimized />
      </Link>
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Avatar name={businessName} kind="business" />
        <div className="min-w-0">
          <p className="truncate type-sub text-ink">{businessName}</p>
          {serviceCount === 0 ? null : <p className="type-label font-normal text-ink-3">{formatQuantity(serviceCount, "service")}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="mb-1 flex h-8 w-full items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-left type-meta shadow-control hover:border-border-button-hover"
      >
        <Icon name="MagnifyingGlass" size="sm" />
        <span className="flex-1">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      <nav aria-label="Main" className="flex flex-1 flex-col">
        {model.sections.map((section) => (
          <div key={section.label ?? "top"} className="flex flex-col gap-0.5">
            {section.label === null ? null : <h2 className="px-2.5 pt-4 pb-1 type-label text-ink-3">{section.label}</h2>}
            {section.links.map((link) => (
              <NavItem key={link.href} link={link} current={linkIsCurrent(link, pathname)} />
            ))}
          </div>
        ))}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-2">
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
          <button type="button" className="flex w-full items-center gap-2.5 rounded-control p-2 text-left hover:bg-surface-hover">
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
