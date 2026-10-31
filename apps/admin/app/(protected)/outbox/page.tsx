import { redirect } from "next/navigation";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";

/** The outbox is now the Going out half of Deliveries; old links land there. */
export default async function OutboxPage(): Promise<never> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "outbox.list", targetType: "outbox" });
  redirect("/deliveries?direction=out");
}
