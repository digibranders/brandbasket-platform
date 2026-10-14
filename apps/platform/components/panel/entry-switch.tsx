import Link from "next/link";
import type { ReactElement } from "react";
import { CREATE_ACCOUNT_HREF, ENTRY_PATH } from "@/lib/account-entry";

interface EntrySwitchProps {
  readonly current: "sign-in" | "create";
}

const VIEWS = [
  { id: "sign-in", label: "Sign in", href: ENTRY_PATH },
  { id: "create", label: "Create account", href: CREATE_ACCOUNT_HREF },
] as const;

/**
 * The entry page's two views as tabs above its title: one page for signing in and for creating an account. Plain
 * links, so it works before any script has loaded, and the address always says which view is open. The open one is
 * underlined in burgundy and set in ink; on a phone the two share the width.
 */
export function EntrySwitch({ current }: EntrySwitchProps): ReactElement {
  return (
    <nav aria-label="Sign in or create an account" className="mb-7 grid grid-cols-2 border-b border-line sm:flex sm:gap-7">
      {VIEWS.map((view) => {
        const active = view.id === current;
        return (
          <Link
            key={view.id}
            href={view.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-10 items-end justify-center border-b-2 pb-2.5 text-sm sm:min-h-11 sm:pb-3 sm:text-[0.9375rem] transition-colors duration-300 ease-calm sm:justify-start ${
              active ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-ink-soft hover:text-ink"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
