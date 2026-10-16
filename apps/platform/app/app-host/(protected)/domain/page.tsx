import type { Metadata } from "next";
import type { ReactElement } from "react";
import { getConnectingDomain, withTenantScope } from "@fynix/db";
import { ConnectDomainCard } from "@/components/panel/connect-domain-card";
import { DomainMoveSteps } from "@/components/panel/domain-move-steps";
import { EmailUs } from "@/components/panel/email-us";
import { MoveDomainForm } from "@/components/panel/move-domain-form";
import { domainPageState, moveStepIndex } from "@/lib/domain-page";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { getLiveWebsite, getOnboardingSnapshot } from "@/lib/server/onboarding";
import { dnsRecordsFor } from "@fynix/shared/lib/onboarding/domain-dns";
import { isTemporarySubdomain } from "@fynix/shared/lib/onboarding/domain-form";
import { safeExternalHref } from "@fynix/shared/lib/safe-link";
import { ButtonLink, ExternalButtonLink } from "@fynix/shared/ui/panel/button";
import { SectionHeading, Surface } from "@fynix/shared/ui/panel/surface";
import { checkDomainAction } from "../project/actions";
import { requestOwnDomainAction } from "./actions";

export const metadata: Metadata = { title: "Your domain" };

function Address({ hostname, note }: { readonly hostname: string; readonly note?: string }): ReactElement {
  return (
    <p className="mt-2 text-sm text-ink-soft">
      Your website’s address is <span className="font-medium text-ink">{hostname}</span>
      {note === undefined ? "" : ` ${note}`}.
    </p>
  );
}

function HelpBlock(): ReactElement {
  return (
    <Surface tone="quiet" className="mt-6 max-w-2xl">
      <SectionHeading>Good to know</SectionHeading>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
        <li>Don’t have a domain yet? You can buy one from any domain registrar, such as GoDaddy, Namecheap or Cloudflare. It usually costs a few hundred rupees a year.</li>
        <li>Not sure which company yours is with? It’s whoever you paid for the domain, or you can look it up with a “WHOIS” search.</li>
        <li>Once you’ve moved, your free address keeps working and forwards to your own domain, so links you’ve already shared still reach you.</li>
        <li>
          Anything unclear? Email us at <EmailUs />.
        </li>
      </ul>
    </Surface>
  );
}

/**
 * The permanent home of the customer's web address: what it is, whether it's connected, and what to do next. A customer live on
 * the free address can ask for a domain of their own here and follow it through to the switch; one on their own domain sees the
 * DNS records and a check, kept for anyone who needs to look again. Which of it shows is decided by domainPageState.
 */
export default async function DomainPage(): Promise<ReactElement> {
  const { tenant } = await requireCustomerAccess();
  const [snapshot, live, connecting] = await Promise.all([
    getOnboardingSnapshot(),
    getLiveWebsite(),
    withTenantScope(getAppDb(), tenant, getConnectingDomain),
  ]);
  const domain = snapshot.domain;
  const moving = connecting !== null && !connecting.isPrimary ? connecting : null;
  const state = domainPageState({
    domain: domain === null ? null : { hostname: domain.hostname, status: domain.status },
    moving: moving === null ? null : { hostname: moving.hostname, status: moving.status },
    isFreeAddress: domain !== null && isTemporarySubdomain(domain.hostname),
    live: live !== null,
    projectStatus: snapshot.project?.status ?? null,
  });
  const liveHref = live === null ? null : safeExternalHref(`https://${live.hostname}`);
  const connect = state === "move-connect" ? moving : state === "own-connect" || state === "own-live" ? domain : null;

  return (
    <>
      <h1 className="panel-title">
        Your <em>domain.</em>
      </h1>

      {state === "none" ? (
        <Surface tone="quiet" className="mt-6 max-w-2xl">
          <SectionHeading>No web address yet</SectionHeading>
          <p className="mt-2 text-sm text-ink-soft">
            Your website needs an address to live at: a domain of your own, or a free one to start with.
          </p>
          {snapshot.locked ? (
            <p className="mt-3 text-sm text-ink-soft">
              Email us at <EmailUs /> and we’ll sort it out.
            </p>
          ) : (
            <ButtonLink href="/onboarding/domain" className="mt-5">
              Choose your address
            </ButtonLink>
          )}
        </Surface>
      ) : null}

      {state === "free-building" && domain !== null ? (
        <>
          <Address hostname={domain.hostname} note="(free, temporary)" />
          <Surface tone="quiet" className="mt-6 max-w-2xl">
            <SectionHeading>Your own domain</SectionHeading>
            <p className="mt-2 text-sm text-ink-soft">
              Once your website is live, you can ask for a domain of your own here. If you already have one, you can enter it in your setup instead.
            </p>
            {snapshot.locked ? null : (
              <ButtonLink href="/onboarding/domain" variant="secondary" className="mt-5">
                Change it in setup
              </ButtonLink>
            )}
          </Surface>
        </>
      ) : null}

      {state === "free" && domain !== null ? (
        <>
          <Address hostname={domain.hostname} note="(free, temporary)" />
          {liveHref === null ? null : (
            <ExternalButtonLink href={liveHref} target="_blank" rel="noopener noreferrer" variant="secondary" className="mt-4">
              Visit your website
            </ExternalButtonLink>
          )}
          <DomainMoveSteps current={0} />
          <Surface className="mt-6 max-w-2xl" labelledBy="own-domain-heading">
            <SectionHeading id="own-domain-heading">I’ve got my own domain</SectionHeading>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Tell us the name and we’ll get your website ready for it. Your free address keeps working until you’re moved over.
            </p>
            <div className="mt-5">
              <MoveDomainForm action={requestOwnDomainAction} />
            </div>
          </Surface>
          <HelpBlock />
        </>
      ) : null}

      {state === "move-requested" && domain !== null && moving !== null ? (
        <>
          <Address hostname={domain.hostname} note="(free, temporary) for now" />
          <DomainMoveSteps current={moveStepIndex(state)} />
          <Surface tone="quiet" className="mt-6 max-w-2xl">
            <SectionHeading>We’re getting it ready</SectionHeading>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              We’ve got <span className="font-medium text-ink">{moving.hostname}</span>. We’re adding it to your website now and we’ll email you the moment it’s time to connect it. Please don’t change anything at your domain company until then. Your website carries on at your free address meanwhile.
            </p>
          </Surface>
          <HelpBlock />
        </>
      ) : null}

      {state === "own-not-approved" && domain !== null ? (
        <>
          <Address hostname={domain.hostname} />
          <Surface tone="quiet" className="mt-6 max-w-2xl">
            <SectionHeading>Nothing to do yet</SectionHeading>
            <p className="mt-2 text-sm text-ink-soft">
              Once you’ve approved your website’s preview, we’ll show you here exactly what to change at the company you bought your
              domain from. Please leave your domain’s settings alone until then, so your current website and email carry on as they are.
            </p>
          </Surface>
        </>
      ) : null}

      {state === "own-getting-ready" && domain !== null ? (
        <>
          <Address hostname={domain.hostname} />
          <Surface tone="quiet" className="mt-6 max-w-2xl">
            <SectionHeading>We’re getting it ready</SectionHeading>
            <p className="mt-2 text-sm text-ink-soft">
              We’ll email you the moment it’s time to connect it. Please don’t change anything at your domain company until then.
            </p>
          </Surface>
        </>
      ) : null}

      {connect !== null ? (
        <>
          {state === "own-live" ? (
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Your website is live at{" "}
              {liveHref === null ? (
                <span className="font-medium text-ink">{connect.hostname}</span>
              ) : (
                <a href={liveHref} target="_blank" rel="noopener noreferrer" className="link-underline font-medium text-ink">
                  {connect.hostname}
                </a>
              )}
              .
            </p>
          ) : state === "move-connect" && domain !== null ? (
            <Address hostname={domain.hostname} note="(free, temporary) for now" />
          ) : (
            <p role="status" className="mt-4 max-w-2xl rounded-control bg-accent-pale px-5 py-4 text-sm text-accent-deep">
              One last step: connect your domain to put your website live.
            </p>
          )}
          {state === "move-connect" ? <DomainMoveSteps current={moveStepIndex(state)} /> : null}

          <Surface className="mt-6 max-w-2xl" labelledBy="dns-heading">
            <SectionHeading id="dns-heading">{state === "own-live" ? "Your DNS settings" : "Connect your domain"}</SectionHeading>
            <div className="mt-5">
              <ConnectDomainCard
                hostname={connect.hostname}
                records={dnsRecordsFor(connect.hostname)}
                checkAction={checkDomainAction}
                emailUs={<EmailUs />}
                alreadyConnected={connect.status === "verifying"}
              />
            </div>
          </Surface>

          {state === "own-live" && liveHref !== null ? (
            <ExternalButtonLink href={liveHref} target="_blank" rel="noopener noreferrer" className="mt-6">
              Visit your website
            </ExternalButtonLink>
          ) : null}
        </>
      ) : null}
    </>
  );
}
