import { requireCustomer } from "@/lib/guards";

/** Home. Phase 1 shows only who is signed in; the Home screens arrive in phase 4 (plan 61). */
export default async function HomePage() {
  const customer = await requireCustomer();
  return <h1 className="type-title">{customer.businessName}</h1>;
}
