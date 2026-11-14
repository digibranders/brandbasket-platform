import "server-only";
import { findLiveBundledAddOns, isPackageOfferForfeited, withTenantScope } from "@brandbasket/db";
import { isMonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { postingServiceHasAccounts, readSavedAnswers } from "@/features/checklist/server/saved-answers";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { notBoughtView, setupAsks, type NotBoughtView, type SetupAsk, type SetupService, type SoldSetupService } from "./rules";

type Reader = Pick<CustomerContext, "tenant" | "businessId"> & { readonly businessName?: string };

/** The questions still open for a service, from the answers saved so far. Throws when the answers cannot be read: the card then shows its error. */
export async function loadSetupAsks(customer: Reader, service: SetupService): Promise<readonly SetupAsk[]> {
  // Accounts connected in Social media live in the posting service: asked before the transaction, so the setup never asks for pages that are already connected.
  const connectedInPostingService = service === "social" ? await postingServiceHasAccounts(customer) : false;
  const answers = await withTenantScope(getAppDb(), customer.tenant, (tx) => readSavedAnswers(tx, customer.businessId, new Date(), connectedInPostingService));
  return setupAsks(service, answers);
}

/** The Not bought screen's content, priced as part of the services the business already holds. */
export async function loadNotBought(customer: Reader & Pick<CustomerContext, "currency">, service: SoldSetupService): Promise<NotBoughtView> {
  const { bundled, forfeited } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => ({
    bundled: await findLiveBundledAddOns(tx, customer.businessId),
    forfeited: await isPackageOfferForfeited(tx, customer.businessId),
  }));
  // Same lines as the add-on quote of the old Services page: the services staying, at the list price each was sold at.
  const held = bundled.flatMap((row) => (row.status === "active" && row.endRequestedAt === null && isMonthlyAddOnId(row.addOn) ? [{ addOn: row.addOn, listCents: row.listAmountCents }] : []));
  return notBoughtView({ service, held, forfeited, currency: customer.currency });
}
