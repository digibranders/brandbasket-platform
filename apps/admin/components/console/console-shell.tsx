import type { StaffRole } from "@brandbasket/db";
import type { ReactElement, ReactNode } from "react";
import { adminBrand } from "@/lib/brand";
import { CONSOLE_RAIL_LINKS } from "@/lib/console-rail";
import { readRailCounts } from "@/lib/server/rail-counts";
import { signOut } from "@/lib/server/sign-out";
import { readStaffBell } from "@/lib/server/staff-notifications";
import { PhoneBar } from "./phone-bar";
import { Rail } from "./rail";
import { StaffBellRefresh } from "./staff-bell-refresh";
import { TopBar } from "./top-bar";

interface ConsoleShellProps {
  readonly userName: string;
  /** Only the rail counts use it (money and Google counts follow the role). The menu is the same for everyone. */
  readonly role: StaffRole;
  readonly children: ReactNode;
}

/** The staff console v2: the dark rail and a top bar (command bar field, bell) on desktop, a phone bar and menu on phones, around the page. */
export async function ConsoleShell({ userName, role, children }: ConsoleShellProps): Promise<ReactElement> {
  const [counts, bell] = await Promise.all([readRailCounts(role), readStaffBell()]);
  const logo = adminBrand().logo;
  const shared = { links: CONSOLE_RAIL_LINKS, counts, userName, signOut, logo };
  return (
    <div className="flex min-h-dvh bg-bg lg:bg-[#23242A]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <StaffBellRefresh />
      <Rail {...shared} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneBar {...shared} bell={bell} />
        <div className="flex min-w-0 flex-1 flex-col bg-bg lg:my-2 lg:mr-2 lg:rounded-[14px]">
          <TopBar bell={bell} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-5 pb-16 pt-6 sm:px-8 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
