import { HelpContactScreen } from "@/features/calls/components/help-screens";
import { loadCalls } from "@/features/calls/loader";
import { requireCustomer } from "@/lib/guards";

export const metadata = { title: "Contact us" };

/** Help & calls, Contact us: how to reach the team. */
export default async function HelpContactPage() {
  const customer = await requireCustomer();
  const calls = await loadCalls(customer);
  return <HelpContactScreen book={calls.ok ? calls.data.book : null} />;
}
