import { permanentRedirect } from "next/navigation";
import { requireCustomer } from "@/lib/guards";

/** The old /monitoring page now lives on Home. */
export default async function OldMonitoringPage() {
  await requireCustomer();
  permanentRedirect("/");
}
