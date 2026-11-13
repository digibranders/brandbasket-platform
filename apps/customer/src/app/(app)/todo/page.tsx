import { permanentRedirect } from "next/navigation";
import { requireCustomer } from "@/lib/guards";

/** The old /todo page now lives on Home. */
export default async function OldTodoPage() {
  await requireCustomer();
  permanentRedirect("/");
}
