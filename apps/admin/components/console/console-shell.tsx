import type { StaffRole } from "@brandbasket/db";
import type { ReactElement, ReactNode } from "react";
import { adminBrand } from "@/lib/brand";
import { railFor } from "@/lib/console-rail";
import { readRailCounts } from "@/lib/server/rail-counts";
import { signOut } from "@/lib/server/sign-out";
import { PhoneBar } from "./phone-bar";
import { Rail } from "./rail";

interface ConsoleShellProps {
  readonly userName: string;
  readonly role: StaffRole;
  readonly children: ReactNode;
}

/** The staff console v2: the dark rail on desktop (a top bar and menu on phones) around the page. */
export async function ConsoleShell({ userName, role, children }: ConsoleShellProps): Promise<ReactElement> {
  const sections = railFor(role);
  const counts = await readRailCounts();
  const logo = adminBrand().logo;
  const shared = { sections, counts, userName, role, signOut, logo };
  return (
    <div className="flex min-h-dvh bg-bg lg:bg-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <Rail {...shared} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneBar {...shared} />
        <div className="flex min-w-0 flex-1 flex-col bg-bg lg:my-2 lg:mr-2 lg:rounded-lift">
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-5 pb-16 pt-6 sm:px-8 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
