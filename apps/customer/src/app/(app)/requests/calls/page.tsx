import { permanentRedirect } from "next/navigation";
import { requireCustomer } from "@/lib/guards";

/** The old Calls page (apps/platform CALLS_PATH) is now Help & calls. Emails already sent link here. */
export default async function OldCallsPage() {
  await requireCustomer();
  permanentRedirect("/help");
}
