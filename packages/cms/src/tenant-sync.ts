import { getPayload, type SanitizedConfig } from "payload";

export interface TenantSyncInput {
  readonly businessId: string;
  readonly name: string;
}

/** Payload's ValidationError shape (see payload/dist/errors/ValidationError.js): a list of invalid fields on `data`. */
function isDuplicateBusinessIdError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const data = (error as { data?: { errors?: ReadonlyArray<{ path?: string }> } }).data;
  return data?.errors?.some((field) => field.path === "businessId") ?? false;
}

/**
 * Creates the Payload tenant that mirrors a business, so staff always find one to pick in the admin switcher (see
 * collections/Tenants.ts) — nobody has to remember to make it by hand. Called right after every place a business
 * row is created: the customer app's invite redemption, and the console's "attach account" staff repair action.
 *
 * Takes the config rather than importing one, because each app builds its own from its own environment.
 *
 * Idempotent by design, not just by luck: it looks for an existing tenant for this businessId before creating one,
 * and separately treats a unique-constraint failure from `create` (two calls racing for the same business) as
 * "already synced" rather than an error. Either path leaves exactly one tenant per business.
 *
 * Best-effort on failure: Payload's database is separate from packages/db's (see payload.config.ts), so this runs
 * after the business's own transaction has already committed and cannot be folded into it. A failure here (Payload's
 * database briefly unreachable, say) is logged rather than thrown — failing a customer's whole signup, or a staff
 * repair action, over this side system would be worse than a business temporarily missing its tenant, matching this
 * codebase's existing pattern for other best-effort post-commit side effects (see deleteStoredFiles in
 * onboarding-media.ts). There is no reconciliation job yet to retry a business left without a tenant; until one
 * exists, this log line is how staff would find out to fix it by hand.
 */
export async function syncTenantForBusiness(
  config: Promise<SanitizedConfig> | SanitizedConfig,
  { businessId, name }: TenantSyncInput,
): Promise<void> {
  try {
    const payload = await getPayload({ config });
    const existing = await payload.find({
      collection: "tenants",
      where: { businessId: { equals: businessId } },
      limit: 1,
      overrideAccess: true,
    });
    if (existing.docs.length > 0) return;

    await payload.create({
      collection: "tenants",
      data: { businessId, name },
      overrideAccess: true,
    });
  } catch (error) {
    if (isDuplicateBusinessIdError(error)) return;
    console.error("Could not create a Payload tenant for a business.", { businessId, error });
  }
}
