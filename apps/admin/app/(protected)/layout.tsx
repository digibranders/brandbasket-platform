import type { ReactElement, ReactNode } from "react";
import { ConsoleShell } from "@/components/console/console-shell";
import { KickoffPromptPopup } from "@/components/console/kickoff-prompt-popup";
import { listPendingKickoffPrompts } from "@/lib/server/pending-kickoffs";
import { requireStaffAccess } from "@/lib/server/staff-access";

interface AdminProtectedLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminProtectedLayout({ children }: AdminProtectedLayoutProps): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  const pendingKickoffs = await listPendingKickoffPrompts(new Date());
  return (
    <ConsoleShell userName={user.name} role={staff.role}>
      <KickoffPromptPopup pendingKickoffs={pendingKickoffs} />
      {children}
    </ConsoleShell>
  );
}
