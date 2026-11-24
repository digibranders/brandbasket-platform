import type { ReactElement, ReactNode } from "react";
import { ConsoleShell } from "@/components/console/console-shell";
import { KickoffPromptPopup } from "@/components/console/kickoff-prompt-popup";
import { loadKickoffPrompts } from "@/lib/server/pending-kickoffs";
import { requireStaffAccess } from "@/lib/server/staff-access";

interface AdminProtectedLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminProtectedLayout({ children }: AdminProtectedLayoutProps): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  // The popup is a convenience over Today's card: a failed read must not take the console down with it.
  const prompts = await loadKickoffPrompts().catch((error: unknown) => {
    console.error("The kickoff prompts could not be loaded.", { errorName: error instanceof Error ? error.name : "unknown" });
    return [];
  });
  return (
    <ConsoleShell userName={user.name} role={staff.role}>
      {children}
      <KickoffPromptPopup prompts={prompts} />
    </ConsoleShell>
  );
}
