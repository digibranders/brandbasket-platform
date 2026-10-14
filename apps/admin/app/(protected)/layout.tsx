import type { ReactElement, ReactNode } from "react";
import { StaffShell } from "@/components/console/staff-shell";
import { requireStaffAccess } from "@/lib/server/staff-access";

interface AdminProtectedLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminProtectedLayout({ children }: AdminProtectedLayoutProps): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  return (
    <StaffShell userName={user.name} userEmail={user.email} role={staff.role}>
      {children}
    </StaffShell>
  );
}
