"use server";

import { DomainTakenError, findLatestProject, getConnectingDomain, getPrimaryDomain, recordDomainDnsCheck, requestDomainMove, withTenantScope } from "@brandbasket/db";
import { clientSiteBaseDomain, isTemporarySubdomain, parseDomainForm, reservedHostnamesFrom } from "@brandbasket/shared/lib/onboarding/domain-form";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { revalidatePath } from "next/cache";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb, getStaffDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { requireWebsite } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { notifyTeamDomainConnected, notifyTeamDomainRequested } from "../alerts";
import { VIEWER_MESSAGE } from "../rules/notices";
import { WEBSITE_DOMAIN_PATH } from "../rules/paths";
import { checkDomainDns, type DomainCheck } from "./dns-check";
import { CHECK_FAILED_MESSAGE, MOVE_NOT_AVAILABLE_MESSAGE, MOVE_TAKEN_MESSAGE, NO_DOMAIN_TO_CHECK_MESSAGE, NOT_TIME_TO_CONNECT_MESSAGE } from "./rules";

/*
 * Ported from apps/platform app/app-host/(protected)/project/actions.ts (checkDomainAction) and domain/actions.ts
 * (requestOwnDomainAction).
 */

/**
 * "Check my domain": looks up the DNS of the business's own STORED domain, never a form value, so it cannot probe arbitrary
 * names. Runs once staff have asked the customer to connect it, and for a live site too (only a domain in the DNS step changes
 * status). The result is recorded on the staff connection, because the customer role cannot change a domain's status; the
 * guard proves the business is the caller's own. The team is told the first time it is found connected.
 */
export async function checkDomainAction(): Promise<ActionResult<DomainCheck>> {
  const context = await requireWebsite();
  const domain = await withTenantScope(getAppDb(), context.tenant, getConnectingDomain);
  if (domain === null || isTemporarySubdomain(domain.hostname)) return actionFail(NO_DOMAIN_TO_CHECK_MESSAGE);
  if (domain.status === "pending") return actionFail(NOT_TIME_TO_CONNECT_MESSAGE);
  try {
    const check = await checkDomainDns(domain.hostname);
    const recorded = await recordDomainDnsCheck(getStaffDb(), { businessId: context.businessId, hostname: domain.hostname, result: check.overall });
    if (recorded.becameConnected) await notifyTeamDomainConnected({ id: context.businessId, name: context.businessName }, domain.hostname);
    revalidatePath(WEBSITE_DOMAIN_PATH);
    return actionOk(check);
  } catch (error) {
    reportError(error, { area: "website.domain-check" });
    return actionFail(CHECK_FAILED_MESSAGE);
  }
}

/** Brandbasket's own hosts, which no customer may claim. */
function reservedHosts(): string[] {
  const origins = [siteConfig.url, siteConfig.appUrl, serverEnv().APP_ORIGIN, process.env.ADMIN_ORIGIN?.trim() ?? ""].filter((origin) => origin !== "");
  const base = clientSiteBaseDomain();
  return [...reservedHostnamesFrom(origins), ...(base === null ? [] : [base])];
}

/**
 * A customer live on the free address asks to move to a domain of their own. Checked again here whatever the page showed: it
 * must be live on a free address, and the domain passes the same checks as setup (a valid name, not one of ours, the ownership
 * box ticked). It is saved beside the current address, which keeps working; an earlier unswitched request is retired.
 */
export async function requestOwnDomainAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await requireWebsite({ write: true });
  if (context.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const { primary, live } = await withTenantScope(getAppDb(), context.tenant, async (tx) => ({
    primary: await getPrimaryDomain(tx),
    live: (await findLatestProject(tx))?.status === "live",
  }));
  if (!live || primary === null || !isTemporarySubdomain(primary.hostname)) return actionFail(MOVE_NOT_AVAILABLE_MESSAGE);

  const parsed = parseDomainForm(formData, reservedHosts());
  if (!parsed.success) return actionFail(parsed.message, { [parsed.field === "ownerConfirmed" ? "ownerConfirmed" : "domain"]: parsed.message });

  try {
    await withTenantScope(getAppDb(), context.tenant, (tx) => requestDomainMove(tx, { hostname: parsed.data.hostname, ownerConfirmedAt: new Date() }));
  } catch (error) {
    if (error instanceof DomainTakenError) return actionFail(MOVE_TAKEN_MESSAGE, { domain: MOVE_TAKEN_MESSAGE });
    throw error;
  }
  await notifyTeamDomainRequested({ id: context.businessId, name: context.businessName }, parsed.data.hostname);
  revalidatePath(WEBSITE_DOMAIN_PATH);
  return actionOk();
}
