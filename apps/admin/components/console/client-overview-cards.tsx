import Link from "next/link";
import type { ReactElement } from "react";
import { StatusChip, type StatusChipVariant } from "@brandbasket/shared/ui/patterns";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { FOCAL_CARD } from "@/components/console/classes";
import { KickoffPromptOpener } from "@/components/console/kickoff-prompt-opener";
import { TryAgain } from "@/components/console/try-again";
import type { ClientException } from "@/lib/client-exceptions";
import type { OverviewCard } from "@/lib/client-next-step";
import type { ServiceState, ServiceStatus } from "@/lib/client-services";
import { clientTabHref, type ClientTabSlug } from "@/lib/client-tabs";

const TAB_BUTTONS: Readonly<Record<ClientTabSlug, string>> = {
  "": "Open overview",
  website: "Open website",
  services: "Open services",
  billing: "Open money",
  requests: "Open requests",
  people: "Open account",
};

function tabLink(businessId: string, tab: ClientTabSlug, anchor: string | null): string {
  return `${clientTabHref(businessId, tab)}${anchor === null ? "" : `#${anchor}`}`;
}

/** The call a kickoff exception asks about. With it, the kickoff exception opens the one kickoff prompt instead of linking to the Website tab. */
export interface KickoffPromptTarget {
  readonly businessName: string;
  readonly endsAt: Date;
}

/** Everything wrong for this client in one list; the first line is also the Next step card. Says when a check could not be read. */
export function ExceptionsStrip({
  businessId,
  exceptions,
  unreadable,
  kickoffPrompt,
}: {
  readonly businessId: string;
  readonly exceptions: readonly ClientException[];
  readonly unreadable: readonly string[];
  readonly kickoffPrompt?: KickoffPromptTarget;
}): ReactElement | null {
  if (exceptions.length === 0 && unreadable.length === 0) return null;
  return (
    <section aria-label="Needs a look" role={unreadable.length > 0 ? "alert" : undefined} className="mb-6 rounded-[14px] border border-neg-border bg-neg-wash px-5 py-4">
      {exceptions.length === 0 ? null : (
        <>
          <h2 className="text-sm font-semibold text-neg-text">{exceptions.length === 1 ? "1 thing needs a look" : `${exceptions.length} things need a look`}</h2>
          <ul className="mt-1">
            {exceptions.map((exception) => (
              <li key={exception.key} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t border-neg-border py-1.5 first:border-t-0">
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{exception.text}</span>
                {exception.clock === null ? null : <span className={`font-figure text-[13px] font-semibold ${exception.late ? "text-error" : "text-ink-2"}`}>{exception.clock}</span>}
                {exception.key === "kickoff" && kickoffPrompt !== undefined ? (
                  <KickoffPromptOpener businessId={businessId} businessName={kickoffPrompt.businessName} endsAt={kickoffPrompt.endsAt} className={buttonSecondary}>
                    Call completed
                  </KickoffPromptOpener>
                ) : (
                  <Link href={tabLink(businessId, exception.tab, exception.anchor)} className={buttonSecondary}>
                    {TAB_BUTTONS[exception.tab].replace("Open ", "")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {unreadable.length === 0 ? null : (
        <div className={`flex flex-wrap items-center gap-3 ${exceptions.length === 0 ? "" : "mt-2 border-t border-neg-border pt-3"}`}>
          <p className="min-w-0 flex-1 text-sm font-semibold text-neg-text">Could not read {unreadable.join(", ")}.</p>
          <TryAgain />
        </div>
      )}
    </section>
  );
}

interface CardView {
  readonly title: string;
  readonly detail: string | null;
  readonly late: boolean;
  readonly action: ReactElement | null;
}

function cardView(card: OverviewCard, businessId: string, kickoffPrompt: KickoffPromptTarget | undefined): CardView {
  switch (card.kind) {
    case "exception": {
      const { exception } = card;
      return {
        title: exception.title,
        detail: exception.detail,
        late: exception.late,
        action:
          exception.key === "kickoff" && kickoffPrompt !== undefined ? (
            <KickoffPromptOpener businessId={businessId} businessName={kickoffPrompt.businessName} endsAt={kickoffPrompt.endsAt} className={buttonPrimary}>
              Call completed
            </KickoffPromptOpener>
          ) : (
            <Link href={tabLink(businessId, exception.tab, exception.anchor)} className={buttonPrimary}>
              {TAB_BUTTONS[exception.tab]}
            </Link>
          ),
      };
    }
    case "unreadable":
      return {
        title: "We could not check what is waiting",
        detail: `Could not read ${card.unreadable.join(", ")}, so this page cannot say nothing is waiting. Try again before relying on it.`,
        late: true,
        action: <TryAgain />,
      };
    case "not-paid":
      return { title: "Not paid yet", detail: "They signed up and have not paid. What they told us is on the right.", late: false, action: null };
    case "stage":
      return {
        title: card.step.label,
        detail: null,
        late: false,
        action: (
          <Link href={tabLink(businessId, "website", card.step.anchor)} className={buttonPrimary}>
            Open website
          </Link>
        ),
      };
    case "service":
      return {
        title: `Set up ${card.service.title}`,
        detail: "They paid for it and nobody has marked them as contacted yet.",
        late: false,
        action: (
          <Link href={tabLink(businessId, "billing", "add-ons")} className={buttonPrimary}>
            Open money
          </Link>
        ),
      };
    case "clear":
      return { title: "Nothing is waiting on us.", detail: "Checked: the website, the services, the money and the account.", late: false, action: null };
  }
}

/** The single focal card of the Overview: the one thing to do for this client, across every service. */
export function OverviewNextStepCard({
  card,
  businessId,
  kickoffPrompt,
}: {
  readonly card: OverviewCard;
  readonly businessId: string;
  readonly kickoffPrompt?: KickoffPromptTarget;
}): ReactElement {
  const view = cardView(card, businessId, kickoffPrompt);
  return (
    <section aria-labelledby="next-step-title" className={`${FOCAL_CARD} !overflow-visible p-5`}>
      <h2 id="next-step-title" className="font-display text-[0.9375rem] font-semibold text-ink">
        Next step
      </h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${view.late ? "text-error" : "text-ink"}`}>{view.title}</p>
          {view.detail === null ? null : <p className="mt-1 max-w-[60ch] text-sm text-ink-2">{view.detail}</p>}
        </div>
        {view.action}
      </div>
    </section>
  );
}

const CHIP_VARIANTS: Readonly<Record<ServiceState, StatusChipVariant>> = { active: "active", setup: "waiting", late: "failed", waiting: "idle" };

/** One card per service this client has, with where it stands and a link to where staff work on it. */
export function ServiceCards({
  businessId,
  services,
  linkTo,
}: {
  readonly businessId: string;
  readonly services: readonly ServiceStatus[];
  /** The Overview points at the Services tab; the Services tab points at the place each service is run today. */
  readonly linkTo: "services" | "work";
}): ReactElement {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {services.map((service) => {
        const href = linkTo === "services" ? { href: tabLink(businessId, "services", null), label: "Open services" } : workLink(businessId, service);
        return (
          <li key={service.id} className="rounded-[14px] border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">{service.title}</h3>
              <StatusChip label={service.text} variant={CHIP_VARIANTS[service.state]} />
            </div>
            {href === null ? null : (
              <Link href={href.href} className="mt-3 inline-block text-xs font-semibold text-ink-2 hover:text-ink">
                {href.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function workLink(businessId: string, service: ServiceStatus): { readonly href: string; readonly label: string } | null {
  switch (service.id) {
    case "managed-website":
      return { href: tabLink(businessId, "website", null), label: "Open website" };
    case "paid-ads":
      return { href: tabLink(businessId, "billing", "numbers"), label: "Open the monthly figures" };
    case "social-media":
    case "expert-monitoring":
      return service.state === "setup" ? { href: tabLink(businessId, "billing", "add-ons"), label: "Mark them as contacted" } : null;
  }
}
