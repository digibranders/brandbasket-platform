import { permanentRedirect } from "next/navigation";
import { requireCustomer } from "@/lib/guards";

/** The old /add-ons page is part of Plan & billing now. */
export default async function OldAddOnsPage() {
  await requireCustomer();
  permanentRedirect("/billing");
}
