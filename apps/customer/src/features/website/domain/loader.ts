import "server-only";
import { getConnectingDomain, withTenantScope, type ConnectingDomain } from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import type { WebsiteCore } from "../loader";
import { domainPageState, type DomainPageState } from "./rules";

export interface DomainPage {
  readonly state: DomainPageState;
  /** The domain a live customer asked to move to, beside their free address until staff switch; null when there is none. */
  readonly moving: ConnectingDomain | null;
  /** Setup is sent, so "Choose your address" and "Change it in setup" give way to "email us" (ported from snapshot.locked). */
  readonly locked: boolean;
}

/** The Domain page, from the core reads plus the domain being connected. Strict, like the old page: no quiet fallbacks. */
export function loadDomainPage(context: CustomerContext, core: WebsiteCore): Promise<Loaded<DomainPage>> {
  return load("website.domain", async () => {
    const connecting = await withTenantScope(getAppDb(), context.tenant, getConnectingDomain);
    const moving = connecting !== null && !connecting.isPrimary ? connecting : null;
    const state = domainPageState({
      domain: core.domain === null ? null : { hostname: core.domain.hostname, status: core.domain.status },
      moving: moving === null ? null : { hostname: moving.hostname, status: moving.status },
      isFreeAddress: core.domain?.isFreeAddress ?? false,
      live: core.live !== null,
      projectStatus: core.project?.status ?? null,
    });
    return { state, moving, locked: core.project === null || core.project.status !== "onboarding" };
  });
}
