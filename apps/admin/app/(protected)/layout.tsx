import type { ReactElement, ReactNode } from "react";
import { ConsoleShell } from "@/components/console/console-shell";
import { requireStaffAccess } from "@/lib/server/staff-access";

interface AdminProtectedLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminProtectedLayout({ children }: AdminProtectedLayoutProps): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  return (
    <ConsoleShell userName={user.name} role={staff.role}>
      {children}
    </ConsoleShell>
  );
}
