import type { CustomerContext } from "@/lib/guards";

/** What checkout's server modules need of the signed-in customer: the old app's GrantedCustomer, from a guard's context. */
export type GrantedCustomer = Pick<CustomerContext, "user" | "tenant" | "billing">;
