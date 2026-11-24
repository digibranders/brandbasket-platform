import type { ComponentType, ReactElement, ReactNode } from "react";

export interface SettingsTabItem {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly badge?: string | number;
  /** "danger" marks a high-consequence tab (Delete account): red label and red indicator. */
  readonly tone?: "danger";
}

/** The link element for page tabs, so an app can pass its router link and keep client navigation. */
export type SettingsTabLink = ComponentType<{
  readonly href: string;
  readonly className?: string;
  readonly "aria-current"?: "page";
  readonly children: ReactNode;
}>;

export interface SettingsTabsProps {
  readonly tabs: readonly SettingsTabItem[];
  readonly activeTabId: string;
  readonly onTabChange?: (tabId: string) => void;
  readonly className?: string;
  /** Names the nav when tabs are page links. */
  readonly ariaLabel?: string;
  readonly LinkComponent?: SettingsTabLink;
}

const BASE = "relative inline-flex shrink-0 items-center px-4 py-2.5 font-sans text-sm font-semibold no-underline transition-colors";

function indicator(tab: SettingsTabItem): string {
  const colour = tab.tone === "danger" ? "after:bg-neg-text" : "after:bg-accent-gold";
  return `after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[2px] ${colour}`;
}

function tabClass(tab: SettingsTabItem, isActive: boolean): string {
  if (isActive) return `${BASE} ${tab.tone === "danger" ? "text-neg-text" : "text-ink"} ${indicator(tab)}`;
  return `${BASE} ${tab.tone === "danger" ? "text-neg-text hover:underline" : "text-ink-2 hover:text-ink"}`;
}

function PlainLink({ children, ...rest }: { readonly href: string; readonly className?: string; readonly "aria-current"?: "page"; readonly children: ReactNode }): ReactElement {
  return <a {...rest}>{children}</a>;
}

/**
 * SettingsTabs: clean horizontal navigation for settings and account management.
 * 2px indicator on the active tab. Tabs with an href are page links (a labelled nav, aria-current);
 * tabs without one switch in place (role="tablist").
 */
export function SettingsTabs({
  tabs,
  activeTabId,
  onTabChange,
  className = "",
  ariaLabel = "Settings sections",
  LinkComponent,
}: SettingsTabsProps): ReactElement {
  const pageLinks = tabs.length > 0 && tabs.every((tab) => tab.href !== undefined);
  const Link: SettingsTabLink = LinkComponent ?? PlainLink;
  return (
    <nav
      role={pageLinks ? undefined : "tablist"}
      aria-label={ariaLabel}
      className={`flex items-center gap-1 overflow-x-auto border-b border-border pb-[1px] ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const content = (
          <span className="flex items-center gap-2">
            <span>{tab.label}</span>
            {tab.badge !== undefined ? (
              <span className="rounded-full bg-accent-wash px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-text">
                {tab.badge}
              </span>
            ) : null}
          </span>
        );

        if (tab.href) {
          return (
            <Link key={tab.id} href={tab.href} aria-current={isActive ? "page" : undefined} className={tabClass(tab, isActive)}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange?.(tab.id)}
            className={tabClass(tab, isActive)}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
