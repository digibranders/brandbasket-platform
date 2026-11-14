import type { BillingCurrency } from "@brandbasket/db";
import { dnsRecordsFor } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { ErrorState, StatusChip } from "@brandbasket/shared/ui/patterns";
import type { ReactNode } from "react";
import { PageHeader, Panel, TimelineSteps } from "@/components";
import { BRAND } from "@/features/entry/rules/brand";
import { EmptyState, Icon, LinkButton } from "@/ui";
import type { WebsiteCore } from "../../loader";
import { ASK_FOR_CHANGE_HREF, WEBSITE_DOMAIN_PATH } from "../../rules/paths";
import { LiveHeader, WebsiteTabs, Columns } from "../../components/website-parts";
import type { DomainPage } from "../loader";
import { connectTarget, domainSteps, type DomainPageState } from "../rules";
import { ConnectDomain } from "./connect-domain";
import { MoveDomainForm } from "./move-domain-form";

/*
 * Ported from apps/platform app/app-host/(protected)/domain/page.tsx: one section per state of domainPageState, the copy kept.
 * The records and DNS wording sit behind a disclosure in ConnectDomain.
 */

/** Setup step 04 moved into the checklist (plan 61, route map). */
const CHOOSE_ADDRESS_HREF = "/checklist";

/** What a domain usually costs a year, in the money the customer thinks in. */
const DOMAIN_YEARLY_COST: Readonly<Record<BillingCurrency, string>> = { INR: "a few hundred rupees a year", USD: "about $10 to $15 a year" };

function EmailUs() {
  return <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>;
}

function Said({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Panel title={title}>
      <div className="flex max-w-reading flex-col gap-4 type-body text-ink-2">{children}</div>
    </Panel>
  );
}

function freeNote(state: DomainPageState): string | null {
  if (state === "free" || state === "free-building") return "Free, temporary address.";
  if (state === "move-requested" || state === "move-connect") return "Free, temporary address for now.";
  return null;
}

function HelpPanel({ currency }: { readonly currency: BillingCurrency }) {
  return (
    <Panel title="Good to know">
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5 type-meta">
        <li>Don’t have a domain yet? You can buy one from any domain registrar, such as GoDaddy, Namecheap or Cloudflare. It usually costs {DOMAIN_YEARLY_COST[currency]}.</li>
        <li>Not sure which company yours is with? It’s whoever you paid for the domain, or you can look it up with a “WHOIS” search.</li>
        <li>Once you’ve moved, your free address keeps working and forwards to your own domain, so links you’ve already shared still reach you.</li>
        <li>
          Anything unclear? Email us at <EmailUs />.
        </li>
      </ul>
    </Panel>
  );
}

export interface DomainScreenProps {
  readonly core: WebsiteCore;
  readonly page: DomainPage;
  readonly hasPages: boolean;
  readonly currency: BillingCurrency;
  readonly canChange: boolean;
}

/** The web address: what it is, whether it is connected, and what to do next, for all nine states. */
export function DomainScreen({ core, page, hasPages, currency, canChange }: DomainScreenProps) {
  const { state, moving, locked } = page;
  const domain = core.domain;
  const isDnsError = domain?.status === "misconfigured" || moving?.status === "misconfigured";
  const header =
    core.live === null ? (
      <PageHeader
        title="Your domain"
        description="Where your website lives, and how to move it to a domain of your own."
        tabs={<WebsiteTabs current={WEBSITE_DOMAIN_PATH} hasPages={true} />}
      />
    ) : (
      <LiveHeader
        description={core.live.hostname}
        visitHref={safeExternalHref(`https://${core.live.hostname}`)}
        domainBadge={core.live.hostname}
        sslStatus="SSL Active"
        actions={
          <LinkButton href={ASK_FOR_CHANGE_HREF} variant="primary">
            Ask for a change
          </LinkButton>
        }
        tabs={<WebsiteTabs current={WEBSITE_DOMAIN_PATH} hasPages={hasPages} />}
      />
    );

  if (state === "none" || domain === null) {
    return (
      <>
        {header}
        <Panel>
          <EmptyState
            icon="Link"
            title="No web address yet"
            description={
              locked ? (
                <>
                  Your website needs an address to live at. Email us at <EmailUs /> and we’ll sort it out.
                </>
              ) : (
                "Your website needs an address to live at: a domain of your own, or a free one to start with."
              )
            }
            {...(locked ? {} : { action: <LinkButton href={CHOOSE_ADDRESS_HREF} variant="primary">Choose your address</LinkButton> })}
          />
        </Panel>
      </>
    );
  }

  const target = connectTarget(state, { hostname: domain.hostname, status: domain.status }, moving === null ? null : { hostname: moving.hostname, status: moving.status });
  const note = freeNote(state);
  const steps = domainSteps(state);

  const task: ReactNode =
    state === "free-building" ? (
      <Said title="Your own domain">
        <p>Once your website is live, you can ask for a domain of your own here. If you already have one, you can enter it in your setup instead.</p>
        {locked ? null : (
          <div>
            <LinkButton href={CHOOSE_ADDRESS_HREF}>Change it in setup</LinkButton>
          </div>
        )}
      </Said>
    ) : state === "free" ? (
      <Said title="I’ve got my own domain">
        <p>Tell us the name and we’ll get your website ready for it. Your free address keeps working until you’re moved over.</p>
        {canChange ? <MoveDomainForm /> : null}
      </Said>
    ) : state === "move-requested" && moving !== null ? (
      <Said title="We’re getting it ready">
        <p>
          We’ve got <strong className="font-semibold text-ink">{moving.hostname}</strong>. We’re adding it to your website now and we’ll email you the moment it’s time to connect it. Please don’t change anything at
          your domain company until then. Your website carries on at your free address meanwhile.
        </p>
      </Said>
    ) : state === "own-not-approved" ? (
      <Said title="Nothing to do yet">
        <p>
          Once you’ve approved your website’s preview, we’ll show you here exactly what to change at the company you bought your domain from. Please leave your domain’s settings alone until then, so your current
          website and email carry on as they are.
        </p>
      </Said>
    ) : state === "own-getting-ready" ? (
      <Said title="We’re getting it ready">
        <p>We’ll email you the moment it’s time to connect it. Please don’t change anything at your domain company until then.</p>
      </Said>
    ) : target !== null && state !== "own-live" ? (
      <Panel title="Connect your domain">
        <div className="flex flex-col gap-4">
          <p className="type-body text-ink-2">One last step: connect your domain to put your website live.</p>
          <ConnectDomain
            hostname={target.hostname}
            records={dnsRecordsFor(target.hostname)}
            alreadyConnected={target.status === "verifying"}
            disclosure="What to change at your domain company"
            live={false}
            emailUs={<EmailUs />}
          />
        </div>
      </Panel>
    ) : null;

  return (
    <>
      {header}
      {isDnsError ? (
        <ErrorState
          title="Domain verification DNS error"
          message="Your domain still points somewhere else or records are misconfigured. Check that your DNS settings match the records below, and remove any older record for the same name."
          className="mb-4"
        />
      ) : null}
      <Columns
        main={
          <>
            <Panel title="Web address">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-wash text-ink-3">
                    <Icon name="Link" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="type-sub text-ink">{domain.hostname}</p>
                    {note === null ? null : <p className="type-meta">{note}</p>}
                  </div>
                  {state === "own-live" ? (
                    <StatusChip label="Connected" variant="active" hasDot />
                  ) : isDnsError ? (
                    <StatusChip label="DNS Error" variant="failed" />
                  ) : null}
                </div>
                {state === "own-live" && target !== null ? (
                  <ConnectDomain
                    hostname={target.hostname}
                    records={dnsRecordsFor(target.hostname)}
                    alreadyConnected={false}
                    disclosure="DNS records we set up"
                    live
                    emailUs={<EmailUs />}
                  />
                ) : null}
              </div>
            </Panel>
            {task}
          </>
        }
        aside={
          <>
            {steps === null ? null : (
              <Panel title="Where it stands">
                <TimelineSteps
                  label="Getting your own domain"
                  steps={steps.map((step) => ({ title: step.label, meta: step.detail, state: step.status === "next" ? "todo" : step.status }))}
                />
              </Panel>
            )}
            {state === "free" || state === "move-requested" ? <HelpPanel currency={currency} /> : null}
          </>
        }
      />
    </>
  );
}
