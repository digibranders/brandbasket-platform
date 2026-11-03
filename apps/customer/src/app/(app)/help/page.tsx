import { HelpCallsScreen } from "@/features/calls/components/help-screens";
import { loadCalls } from "@/features/calls/loader";
import { requireCustomer } from "@/lib/guards";

export const metadata = { title: "Help & calls" };

/** Help & calls: the upcoming call, past calls with what was agreed, and Book a call once calls are open. */
export default async function HelpPage() {
  const customer = await requireCustomer();
  return <HelpCallsScreen calls={await loadCalls(customer)} />;
}
