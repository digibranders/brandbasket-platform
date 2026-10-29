import "server-only";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import { summaryRows, type IntakeSummaryRow } from "@brandbasket/shared/lib/intake/questions";
import type { HomeAttentionItem } from "@/components/home/attention";
import type { ServiceKey } from "@/lib/first-look";
import { deriveClientHomeState, homeLayoutOf, type ClientHomeState } from "@/lib/home/state";
import { needsYouFrom, waitingOnYouFrom } from "@/lib/requests/needs";
import { isBlockingSetup } from "@/lib/service-setup";
import { setupPageHref } from "@/lib/setup-asks";
import { loadActiveServices } from "./active-services";
import { loadIntake } from "./intake";
import { getLiveWebsite, getProjectOverview } from "./onboarding";
import { loadOverview, type OverviewData } from "./overview";
import { loadRequestNeeds, loadWaitingOnYou } from "./requests";
import { getSetupCallState, type SetupCallState } from "./setup-call";

export interface HomeData {
  readonly state: ClientHomeState;
  readonly services: readonly ServiceKey[];
  readonly call: SetupCallState;
  /** The project's own facts the progress screens say in words: the first preview's due date, and when the preview went out. */
  readonly project: { readonly slaDueAt: Date | null; readonly previewSentAt: Date | null; readonly launchPlannedOn: string | null } | null;
  /** What the customer told us before paying, as rows that were answered. */
  readonly intake: readonly IntakeSummaryRow[];
  /** What staff wrote about what was agreed on the call, or null. */
  readonly kickoffNotes: string | null;
  /** The things BrandBasket needs from the customer, most blocking first. */
  readonly attention: readonly HomeAttentionItem[];
  /** This month's figures, activity, requests and next payment: read only for the screens that show them. */
  readonly overview: OverviewData | null;
}

/**
 * Everything Home needs, read once: the facts the state is worked out from, then (only for the screens that show them)
 * the month's figures and activity. The state is a pure function of the facts (lib/home/state.ts), so what is drawn is
 * always what the backend holds. A billing problem skips every other read: the old unpaid Home draws that case.
 */
export async function loadHome(tenant: TenantContext, billing: CustomerBilling, now: Date): Promise<HomeData> {
  const [services, call, { project }, live] = await Promise.all([loadActiveServices(tenant), getSetupCallState(tenant), getProjectOverview(), getLiveWebsite()]);
  const state = deriveClientHomeState({
    now,
    billing: { status: billing.status, paymentUnderReview: billing.paymentUnderReview },
    services,
    kickoff:
      call.booking === null
        ? null
        : {
            startsAt: call.booking.startsAtIso === null ? null : new Date(call.booking.startsAtIso),
            endsAt: call.booking.endsAtIso === null ? null : new Date(call.booking.endsAtIso),
            heldAt: call.booking.heldAtIso === null ? null : new Date(call.booking.heldAtIso),
          },
    project: project === null ? null : { status: project.status, slaDueAt: project.slaDueAt, onHoldReason: project.onHoldReason },
    live,
  });
  const layout = homeLayoutOf(state);
  const base = { state, services, call, project: project === null ? null : { slaDueAt: project.slaDueAt, previewSentAt: project.previewSentAt, launchPlannedOn: project.launchPlannedOn }, kickoffNotes: call.booking?.summary ?? null };
  if (layout === "billing") return { ...base, intake: [], attention: [], overview: null };

  const [{ answers }, needs, waiting] = await Promise.all([loadIntake(tenant), loadRequestNeeds(tenant), loadWaitingOnYou(tenant)]);
  const asked = [...needsYouFrom(needs), ...waitingOnYouFrom(waiting, needs)];
  const intake = summaryRows(services, answers).filter((row) => row.value !== null);
  if (layout === "kickoff") return { ...base, intake, attention: asked, overview: null };

  const overview = await loadOverview(tenant, billing, now);
  // What blocks the Social and Local SEO work is asked on those pages, in one card each; Home only points at it. The website's own checklist items are not asked.
  const setup = overview.todo
    .filter((item): item is typeof item & { readonly kind: "form" } => item.kind === "form" && !item.done && isBlockingSetup(item.setup))
    .map((item): HomeAttentionItem => ({ key: item.key, label: item.label, hint: item.hint, href: setupPageHref(item.service) }));
  const attention = [...overview.requests.concat(waitingOnYouFrom(waiting, needs)).map((row): HomeAttentionItem => ({ key: row.key, label: row.label, hint: row.hint, href: row.href })), ...setup];
  return { ...base, intake, attention, overview };
}
