import { SignOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import type { StaffRole } from "@brandbasket/db";
import { cn } from "@brandbasket/shared/lib/cn";
import { ROLE_LABELS, type ConsoleRailLink, type ConsoleRailSection, type RailCounts } from "@/lib/console-rail";
import { avatarInitials } from "@/lib/avatar";
import { RailIconMark } from "./rail-icon";

type Tone = "dark" | "light";

const COUNT_TONES: Readonly<Record<NonNullable<ConsoleRailLink["countTone"]>, Readonly<Record<Tone, string>>>> = {
  accent: { dark: "bg-rattan text-ink", light: "bg-rattan text-ink" },
  alert: { dark: "bg-error text-white", light: "bg-error text-white" },
  quiet: { dark: "bg-white/10 text-white/80", light: "bg-sunken text-ink-2" },
};

interface RailNavProps {
  readonly sections: readonly ConsoleRailSection[];
  readonly counts: RailCounts;
  /** The entry for the page that is open (lib/console-rail.ts currentHref). */
  readonly current: string | null;
  /** "dark" on the desktop rail, "light" in the phone menu. */
  readonly tone: Tone;
  /** Called when a link is followed, so the phone menu can close. */
  readonly onNavigate?: () => void;
}

/** The rail's sections and links, with a count beside an entry when there is something waiting. */
export function RailNav({ sections, counts, current, tone, onNavigate }: RailNavProps): ReactElement {
  return (
    <>
      {sections.map((section) => (
        <nav key={section.label ?? "main"} aria-label={section.label ?? "Main"} className="grid gap-px">
          {section.label === null ? null : <p className={cn("px-3 pb-1 pt-3 text-xs", tone === "dark" ? "text-white/55" : "text-ink-2")}>{section.label}</p>}
          {section.links.map((link) => {
            const isOpen = link.href === current;
            const count = link.countKey === undefined ? undefined : counts[link.countKey];
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                aria-current={isOpen ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-[0.5625rem] px-3 py-[0.4375rem] text-[0.84375rem] transition-colors duration-200",
                  tone === "dark"
                    ? isOpen
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/75 hover:bg-white/5 hover:text-white"
                    : isOpen
                      ? "bg-sunken font-semibold text-ink"
                      : "text-ink hover:bg-sunken",
                )}
              >
                <RailIconMark name={link.icon} current={isOpen} />
                {link.label}
                {count === undefined || count === 0 ? null : (
                  <span className={cn("ml-auto rounded-md px-1.5 font-figure text-[0.6875rem] font-semibold tabular-nums", COUNT_TONES[link.countTone ?? "accent"][tone])}>{count}</span>
                )}
              </Link>
            );
          })}
        </nav>
      ))}
    </>
  );
}

interface RailAccountProps {
  readonly userName: string;
  readonly role: StaffRole;
  /** The app's sign-out server action. */
  readonly signOut: () => Promise<void>;
  readonly tone: Tone;
}

/** Who is signed in, their role, and Sign out, at the foot of the rail and the phone menu. */
export function RailAccount({ userName, role, signOut, tone }: RailAccountProps): ReactElement {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-[0.625rem] p-2.5 text-[0.8125rem]", tone === "dark" ? "bg-white/[0.06] text-white" : "bg-sunken text-ink")}>
      <span aria-hidden="true" className="grid size-[1.875rem] shrink-0 place-items-center rounded-lg bg-rattan font-display text-xs font-bold text-ink">
        {avatarInitials(userName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{userName}</span>
        <span className={cn("block text-xs", tone === "dark" ? "text-white/60" : "text-ink-2")}>{ROLE_LABELS[role]}</span>
      </span>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="Sign out"
          className={cn("grid size-8 place-items-center rounded-lg transition-colors duration-200", tone === "dark" ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-ink-2 hover:bg-line hover:text-ink")}
        >
          <SignOut size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
