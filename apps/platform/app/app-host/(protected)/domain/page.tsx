import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ConnectDomainCard } from "@/components/panel/connect-domain-card";
import { EmailUs } from "@/components/panel/email-us";
import { domainPageState } from "@/lib/domain-page";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getOnboardingSnapshot } from "@/lib/server/onboarding";
import { dnsRecordsFor } from "@fynix/shared/lib/onboarding/domain-dns";
import { isTemporarySubdomain } from "@fynix/shared/lib/onboarding/domain-form";
import { safeExternalHref } from "@fynix/shared/lib/safe-link";
import { ButtonLink, ExternalButtonLink } from "@fynix/shared/ui/panel/button";
import { SectionHeading, Surface } from "@fynix/shared/ui/panel/surface";
import { checkDomainAction } from "../project/actions";

export const metadata: Metadata = { title: "Your domain" };

function Address({ hostname, note }: { readonly hostname: string; readonly note?: string }): ReactElement {
  return (
    <p className="mt-2 text-sm text-ink-soft">
      Your website’s address is <span className="font-medium text-ink">{hostname}</span>
      {note === undefined ? "" : ` ${note}`}.
    </p>
  );
}

/**
 * The permanent home of the customer's web address: what it is, whether it's connected, and (once it is time) the DNS
 * records to add with a button to check them. The same records card the project page shows while the site goes live,
 * kept here for anyone who needs to look again or re-check later. Which of it shows is decided by domainPageState.
 */
export default async function DomainPage(): Promise<ReactElement> {
  await requireCustomerAccess();
  const [snapshot, live] = await Promise.all([getOnboardingSnapshot(), getLiveWebsite()]);
  const domain = snapshot.domain;
  const state = domainPageState({
    domain: domain === null ? null : { hostname: domain.hostname, status: domain.status },
    isFreeAddress: domain !== null && isTemporarySubdomain(domain.hostname),
    live: live !== null,
    projectStatus: snapshot.project?.status ?? null,
  });
  const liveHref = live === null ? null : safeExternalHref(`https://${live.hostname}`);

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

      {state === "free" && domain !== null ? (
        <>
          <Address hostname={domain.hostname} note="(free, temporary)" />
          <Surface tone="quiet" className="mt-6 max-w-2xl">
            <SectionHeading>Moving to your own domain</SectionHeading>
            <p className="mt-2 text-sm text-ink-soft">
              Whenever you’ve registered a domain, email us at <EmailUs /> with its name. We’ll move your website over, and show you
              here exactly what to change at the company you bought it from. We’ll never ask for your login.
            </p>
          </Surface>
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

      {(state === "own-connect" || state === "own-live") && domain !== null ? (
        <>
          {state === "own-live" ? (
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Your website is live at{" "}
              {liveHref === null ? (
                <span className="font-medium text-ink">{domain.hostname}</span>
              ) : (
                <a href={liveHref} target="_blank" rel="noopener noreferrer" className="link-underline font-medium text-ink">
                  {domain.hostname}
                </a>
              )}
              .
            </p>
          ) : (
            <p role="status" className="mt-4 max-w-2xl rounded-control bg-accent-pale px-5 py-4 text-sm text-accent-deep">
              One last step: connect your domain to put your website live.
            </p>
          )}

          <Surface className="mt-6 max-w-2xl" labelledBy="dns-heading">
            <SectionHeading id="dns-heading">{state === "own-live" ? "Your DNS settings" : "Connect your domain"}</SectionHeading>
            <div className="mt-5">
              <ConnectDomainCard
                hostname={domain.hostname}
                records={dnsRecordsFor(domain.hostname)}
                checkAction={checkDomainAction}
                emailUs={<EmailUs />}
                alreadyConnected={domain.status === "verifying"}
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
