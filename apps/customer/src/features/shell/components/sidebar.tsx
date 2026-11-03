import Image from "next/image";
import Link from "next/link";
import { formatQuantity } from "@/lib/format";
import { Avatar, Icon, SERVICE_NAMES } from "@/ui";
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
  readonly onSignOutError: (message: string) => void;
}

/**
 * The desktop sidebar (plan 60, section 9; owner's pick, docs/design/sidebar-v4-new.html option E): a white column with a
 * hairline edge. Logo, the business card, the sections (search lives in the top bar), then Plan & billing, Settings,
 * Help & calls and the person's menu at the foot. Hidden below 861px, where the tab bar takes over.
 */
export function Sidebar({ model, pathname, businessName, services, person, onSignOutError }: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface px-2.5 py-3.5 md:flex">
      <Link href={SHELL_PATHS.home} className="mb-3 flex w-fit shrink-0 px-2 pt-1.5">
        <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket, home" width={130} height={22} unoptimized />
      </Link>
      <div className="mb-1.5 flex shrink-0 items-center gap-2.5 rounded-panel bg-canvas p-2.5">
        <Avatar name={businessName} kind="chip" />
        <div className="min-w-0">
          <p className="truncate type-sub text-ink">{businessName}</p>
          {services.length === 0 ? null : (
            <p className="truncate type-label font-normal text-ink-3">{services.length === 1 ? SERVICE_NAMES[services[0] ?? "website"] : formatQuantity(services.length, "service")}</p>
          )}
        </div>
      </div>
      {/* The column scrolls on a short screen; nothing in it shrinks. */}
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
          <button type="button" className="flex w-full shrink-0 items-center gap-2.5 rounded-control p-2 text-left transition-colors duration-200 hover:bg-canvas">
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

