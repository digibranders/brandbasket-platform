import { redirect } from "next/navigation";
import { requireStaffAccess } from "@/lib/server/staff-access";

/** The outbox is now the Going out half of Deliveries; old links land there. */
export default async function OutboxPage(): Promise<never> {
  await requireStaffAccess();
  redirect("/deliveries?direction=out");
}
