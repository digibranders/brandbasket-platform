import { listAddOnsToContact, listClients, listPaymentsNeedingAttention, type StaffRole } from "@fynix/db";
import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { WordmarkLogo } from "@fynix/shared/ui/logo";
import { adminBrand } from "@/lib/brand";
import { getStaffDb } from "@/lib/server/db";
import { signOut } from "@/lib/server/sign-out";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";
import { Dock } from "./dock";
import { TopPill } from "./top-pill";

interface StaffShellProps {
  readonly userName: string;
  readonly userEmail: string;
  readonly role: StaffRole;
  readonly children: ReactNode;
}

/**
 * Whether anything is urgent enough to mark the Journey tab: money to sort, a new add-on purchase nobody has followed
 * up, or a preview past its promise.
 */
async function somethingIsUrgent(): Promise<boolean> {
  const db = getStaffDb();
  const [flagged, addOns, clients] = await Promise.all([
    listPaymentsNeedingAttention(db, { limit: 1 }),
    listAddOnsToContact(db, 1),
    listClients(db),
  ]);
  return flagged.length > 0 || addOns.length > 0 || clientsWaitingOnUs(clients, new Date()).some((entry) => entry.overdue);
}

/**
 * The staff console frame: cream paper, the logo and a glass account pill at the top, and the glass dock floating
 * at the bottom. Content scrolls between them with room left under it so the dock never covers the last row.
 */
export async function StaffShell({ userName, userEmail, role, children }: StaffShellProps): Promise<ReactElement> {
  const urgent = await somethingIsUrgent();

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        Skip to content
      </a>
      <header className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 pt-5 sm:px-8 lg:px-12">
        <WordmarkLogo href="/" brand={adminBrand().logo} />
        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-5">
          <Link href="/support" className="rounded-full px-3 py-2 text-sm font-semibold text-ink hover:bg-ink/5 hover:text-accent">Support</Link>
          <TopPill userName={userName} userEmail={userEmail} signOut={signOut} />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-5 pb-40 pt-10 sm:px-8 lg:px-12">
        {children}
      </main>
      <Dock needsYou={urgent} role={role} />
    </div>
  );
}
