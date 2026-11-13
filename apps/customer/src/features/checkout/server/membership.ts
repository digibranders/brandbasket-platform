import "server-only";
import { findActivePlan, type BillingCurrency, type Plan } from "@brandbasket/db";
import { cache } from "react";
import type { MembershipTier } from "../rules/membership";
import { getStaffDb } from "./db";

/*
 * Ported from apps/platform lib/server/membership.ts. The "continue with the free listing" choice is not ported: Brandbasket
 * sells no free listing (CLAUDE.md, dormant code).
 */

/**
 * The plan on sale in one currency for one tier: what a business is offered in the currency it is billed in. On the staff
 * connection, like the public prices: a price on sale is published on the website anyway, and this reads nothing about any
 * customer. Null when no plan of that tier is on sale in that currency.
 */
export const getMembershipPlan = cache(
  async (tier: MembershipTier, currency: BillingCurrency): Promise<Plan | null> => findActivePlan(getStaffDb(), currency, tier),
);
