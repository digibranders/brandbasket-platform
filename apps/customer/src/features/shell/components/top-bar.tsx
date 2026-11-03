"use client";

import type { Loaded } from "@/lib/loaded";
import { Icon, IconButton, Kbd } from "@/ui";
import type { BellView, NavModel } from "../rules";
import { currentPage } from "../rules";
import { AccountMenu } from "./account-menu";
import { NotificationsBell } from "./notifications-bell";

export interface TopBarProps {
  readonly model: NavModel;
  readonly pathname: string;
  readonly businessName: string;
  readonly person: { readonly name: string; readonly contact: string };
  readonly notifications: Loaded<BellView>;
  readonly onSearch: () => void;
  readonly onSignOutError: (message: string) => void;
}

/** The top bar (plan 60, section 9): where you are, search, the bell, and on phones the account button. No page actions. */
export function TopBar({ model, pathname, businessName, person, notifications, onSearch, onSignOutError }: TopBarProps) {
  const page = currentPage(model, pathname);
  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-border bg-surface px-4 md:px-5">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="m-0 flex list-none items-center gap-1.5 p-0 type-meta whitespace-nowrap">
          <li className="hidden truncate lg:block">{businessName}</li>
          {page === null ? null : (
            <>
              <li aria-hidden className="hidden lg:block">
                <Icon name="CaretRight" size="sm" className="text-ink-muted" />
              </li>
              <li className="truncate font-medium text-ink" aria-current={page.child === undefined ? "page" : undefined}>
                {page.link.label}
              </li>
              {page.child === undefined ? null : (
                <>
                  <li aria-hidden>
                    <Icon name="CaretRight" size="sm" className="text-ink-muted" />
                  </li>
                  <li className="truncate font-medium text-ink" aria-current="page">
                    {page.child.label}
                  </li>
                </>
              )}
            </>
          )}
        </ol>
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="hidden h-8 w-80 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-left type-meta shadow-control hover:border-border-button-hover md:flex"
      >
        <Icon name="MagnifyingGlass" size="sm" />
        <span className="flex-1">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      <IconButton icon="MagnifyingGlass" label="Search" tooltip={false} onClick={onSearch} className="md:hidden" />
      <NotificationsBell notifications={notifications} />
      <span className="md:hidden">
        <AccountMenu name={person.name} contact={person.contact} align="end" onSignOutError={onSignOutError} trigger={<IconButton icon="UserCircle" label="Account" tooltip={false} />} />
      </span>
    </header>
  );
}
