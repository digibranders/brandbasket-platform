import type { ReactElement } from "react";

export interface SettingsTabItem {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly badge?: string | number;
}

export interface SettingsTabsProps {
  readonly tabs: readonly SettingsTabItem[];
  readonly activeTabId: string;
  readonly onTabChange?: (tabId: string) => void;
  readonly className?: string;
}

/**
 * SettingsTabs: clean horizontal navigation tabs for settings and account management.
 * 3px gold indicator on the active tab, accessible role="tablist".
 */
export function SettingsTabs({
  tabs,
  activeTabId,
  onTabChange,
  className = "",
}: SettingsTabsProps): ReactElement {
  return (
    <nav
      role="tablist"
      aria-label="Settings sections"
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
            <a
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              className={`relative inline-flex items-center px-4 py-2.5 font-sans text-sm font-semibold transition-colors no-underline ${
                isActive
                  ? "text-ink after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[2px] after:bg-accent-gold"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {content}
            </a>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange?.(tab.id)}
            className={`relative inline-flex items-center px-4 py-2.5 font-sans text-sm font-semibold transition-colors ${
              isActive
                ? "text-ink after:absolute after:right-0 after:bottom-0 after:left-0 after:h-[2px] after:bg-accent-gold"
                : "text-ink-2 hover:text-ink"
            }`}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
