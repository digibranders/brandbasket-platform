import { Globe } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { getConnectingDomain, withTenantScope } from "@brandbasket/db";
import { cn } from "@brandbasket/shared/lib/cn";
import { ConnectDomainCard } from "@/components/panel/connect-domain-card";
import { DomainSteps } from "@/components/domain/domain-steps";
import { EmailUs } from "@/components/panel/email-us";
import { MoveDomainForm } from "@/components/panel/move-domain-form";
import { DARK_BUTTON, LIFT, SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, FactRows, PageColumns, PageFrame, PageSection } from "@/components/v2/page";
import { domainPageState, domainSteps } from "@/lib/domain-page";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { getLiveWebsite, getOnboardingSnapshot } from "@/lib/server/onboarding";
import { dnsRecordsFor } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { checkDomainAction } from "../project/actions";
import { requestOwnDomainAction } from "./actions";

export const metadata: Metadata = { title: "Your domain" };

/** Where the website answers now, with a note when it is the free address. */
function AddressSection({ hostname, note, live }: { readonly hostname: string; readonly note?: string; readonly live: boolean }): ReactElement {
  return (
    <PageSection id="address" title="Your website’s address">
      <FactRows items={[{ label: live ? "Live at" : "Address", value: <span className="font-semibold">{note === undefined ? hostname : `${hostname} ${note}`}</span> }]} />
    </PageSection>
  );
}

/** A section of plain words: what is happening, or what is not yet. */
function Said({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <PageSection id={id} title={title}>
      <p className="max-w-xl text-sm leading-relaxed text-ink-2">{children}</p>
    </PageSection>
  );
}

function HelpSection(): ReactElement {
  return (
    <PageSection id="help" title="Good to know">
      <ul className="list-disc space-y-2 pl-5 text-[0.84375rem] leading-relaxed text-ink-2">
        <li>Don’t have a domain yet? You can buy one from any domain registrar, such as GoDaddy, Namecheap or Cloudflare. It usually costs a few hundred rupees a year.</li>
        <li>Not sure which company yours is with? It’s whoever you paid for the domain, or you can look it up with a “WHOIS” search.</li>
        <li>Once you’ve moved, your free address keeps working and forwards to your own domain, so links you’ve already shared still reach you.</li>
        <li>
          Anything unclear? Email us at <EmailUs />.
        </li>
      </ul>
    </PageSection>
  );
}

/** What to expect while the records take effect, beside the records themselves. */
function DnsNotesSection(): ReactElement {
  return (
    <PageSection id="dns-notes" title="Good to know">
      <ul className="list-disc space-y-2 pl-5 text-[0.84375rem] leading-relaxed text-ink-2">
        <li>If your registrar already has a record for the same name, change it to these values rather than adding a second one.</li>
        <li>
          If your registrar won’t take <code className="font-figure text-ink">@</code> as a host, leave it blank or type your domain.
        </li>
        <li>Once connected, your site may take a few more minutes to open securely.</li>
        <li>If your domain already shows a website, it switches to your new one as soon as this takes effect.</li>
      </ul>
    </PageSection>
  );
}

/**
 * The permanent home of the customer's web address: what it is, whether it's connected, and what to do next. A customer live on
 * the free address can ask for a domain of their own here and follow it through to the switch; one on their own domain sees the
 * DNS records and a check, kept for anyone who needs to look again. Which of it shows is decided by domainPageState.
 */
export default async function DomainPage(): Promise<ReactElement> {
  const { tenant } = await requireWebsiteClient();
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
  const steps = domainSteps(state);
  const visit =
    (state === "free" || state === "own-live") && liveHref !== null ? (
      <a href={liveHref} target="_blank" rel="noopener noreferrer" className={SOFT_BUTTON}>
        Visit your website
      </a>
    ) : undefined;
  const lede = "Where your website lives, and what to do to move it to a domain of your own.";

  if (state === "none") {
    return (
      <PageFrame title="Your domain" lede={lede}>
        <EmptyState
          icon={Globe}
          title="No web address yet"
          text={
            snapshot.locked ? (
              <>
                Your website needs an address to live at. Email us at <EmailUs /> and we’ll sort it out.
              </>
            ) : (
              "Your website needs an address to live at: a domain of your own, or a free one to start with."
            )
          }
          action={
            snapshot.locked ? undefined : (
              <Link href="/onboarding/domain" className={DARK_BUTTON}>
                Choose your address
              </Link>
            )
          }
        />
      </PageFrame>
    );
  }

  const freeNote = state === "free" || state === "free-building" ? "(free, temporary)" : state === "move-requested" || state === "move-connect" ? "(free, temporary) for now" : undefined;

  const task: ReactNode =
    state === "free-building" ? (
      <Said id="own-domain" title="Your own domain">
        Once your website is live, you can ask for a domain of your own here. If you already have one, you can enter it in your setup instead.
        {snapshot.locked ? null : (
          <Link href="/onboarding/domain" className={cn(SOFT_BUTTON, "mt-4 flex w-fit")}>
            Change it in setup
          </Link>
        )}
      </Said>
    ) : state === "free" ? (
      <section aria-labelledby="own-domain-heading" className={cn(LIFT, "p-6 sm:p-7")}>
        <h2 id="own-domain-heading" className="font-display text-[1.125rem] font-semibold tracking-[-0.02em] text-ink">
          I’ve got my own domain
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-2">
          Tell us the name and we’ll get your website ready for it. Your free address keeps working until you’re moved over.
        </p>
        <div className="mt-6 max-w-xl">
          <MoveDomainForm action={requestOwnDomainAction} />
        </div>
      </section>
    ) : state === "move-requested" && moving !== null ? (
      <Said id="getting-ready" title="We’re getting it ready">
        We’ve got <span className="font-semibold text-ink">{moving.hostname}</span>. We’re adding it to your website now and we’ll email you the moment it’s time to connect it. Please don’t change anything at your domain company until then. Your website carries on at your free address meanwhile.
      </Said>
    ) : state === "own-not-approved" ? (
      <Said id="nothing-yet" title="Nothing to do yet">
        Once you’ve approved your website’s preview, we’ll show you here exactly what to change at the company you bought your domain from. Please leave your domain’s settings alone until then, so your current website and email carry on as they are.
      </Said>
    ) : state === "own-getting-ready" ? (
      <Said id="getting-ready" title="We’re getting it ready">
        We’ll email you the moment it’s time to connect it. Please don’t change anything at your domain company until then.
      </Said>
    ) : connect !== null ? (
      <section aria-labelledby="dns-heading" className={cn(LIFT, "p-6 sm:p-7")}>
        <h2 id="dns-heading" className="font-display text-[1.125rem] font-semibold tracking-[-0.02em] text-ink">
          {state === "own-live" ? "Your DNS settings" : "Connect your domain"}
        </h2>
        <p className="mt-1 mb-6 max-w-xl text-sm leading-relaxed text-ink-2">
          {state === "own-live"
            ? "Your website is live. These are the records it needs, kept here in case you need to look again."
            : "One last step: connect your domain to put your website live."}
        </p>
        <ConnectDomainCard
          hostname={connect.hostname}
          records={dnsRecordsFor(connect.hostname)}
          checkAction={checkDomainAction}
          emailUs={<EmailUs />}
          alreadyConnected={connect.status === "verifying"}
        />
      </section>
    ) : null;

  const aside =
    steps === null && connect === null ? null : (
      <>
        {steps === null ? null : <DomainSteps steps={steps} />}
        {connect !== null ? <DnsNotesSection /> : state === "free" || state === "move-requested" ? <HelpSection /> : null}
      </>
    );

  return (
    <PageFrame title="Your domain" lede={lede} action={visit}>
      <PageColumns
        main={
          <>
            {domain === null ? null : <AddressSection hostname={domain.hostname} note={freeNote} live={state === "own-live"} />}
            {task}
          </>
        }
        aside={aside}
      />
    </PageFrame>
  );
}
