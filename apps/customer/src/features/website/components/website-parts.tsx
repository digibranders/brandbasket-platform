import type { ReactNode } from "react";
import { StatusChip } from "@brandbasket/shared/ui/patterns";
import { PageHeader, Panel, PanelError, TimelineSteps, type TimelineStep } from "@/components";
import type { Loaded } from "@/lib/loaded";
import { Banner, Icon, TabLinks } from "@/ui";
import { buttonClasses } from "@/ui/button-styles";
import { WEBSITE_NOTICES, type WebsiteNotice } from "../rules/notices";
import type { AddressPanel } from "../rules/overview";
import { websiteTabs } from "../rules/paths";
import type { WebsiteStep } from "../rules/timeline";

/** The thank-you or refusal after a response to a preview, from the fixed `?response=` messages. */
export function NoticeBanner({ notice }: { readonly notice: WebsiteNotice | null }) {
  if (notice === null) return null;
  const { text, ok } = WEBSITE_NOTICES[notice];
  return (
    <Banner tone={ok ? "pos" : "neg"} className="mb-4">
      {text}
    </Banner>
  );
}

/** A button that opens the customer's site or preview in a new tab. Only for a link safeExternalHref accepted. */
export function ExternalButton({ href, children, primary = false }: { readonly href: string; readonly children: ReactNode; readonly primary?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses(primary ? "primary" : "secondary", "md")}>
      <Icon name="ArrowUpRight" size="sm" />
      {children}
    </a>
  );
}

/** The Website section's tabs, once the site is live. */
export function WebsiteTabs({ current, hasPages }: { readonly current: string; readonly hasPages: boolean }) {
  return <TabLinks items={websiteTabs(hasPages)} current={current} aria-label="Website" />;
}

export interface LiveHeaderProps {
  readonly description: string;
  readonly visitHref: string | null;
  readonly actions: ReactNode;
  readonly tabs: ReactNode;
  readonly domainBadge?: string;
  readonly sslStatus?: string;
}

/** The header every live Website tab shares: the address, the live date, domain badge, SSL status, Visit site and Ask for a change. */
export function LiveHeader({
  description,
  visitHref,
  actions,
  tabs,
  domainBadge,
  sslStatus = "SSL Active",
}: LiveHeaderProps) {
  return (
    <PageHeader
      title="Website"
      description={
        <span className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip label="Live" variant="active" hasDot />
            {domainBadge ? <StatusChip label={domainBadge} variant="idle" /> : null}
            <StatusChip label={sslStatus} variant="active" />
          </span>
          <span>{description}</span>
        </span>
      }
      actions={
        <>
          {visitHref === null ? null : <ExternalButton href={visitHref}>Visit site</ExternalButton>}
          {actions}
        </>
      }
      tabs={tabs}
    />
  );
}

function timelineStep(step: WebsiteStep): TimelineStep {
  const meta = [step.when, step.note].filter((part): part is string => part !== null && part !== "").join(". ");
  return { title: step.title, ...(meta === "" ? {} : { meta }), state: step.state === "next" ? "todo" : step.state };
}

/** "What happens next": the four dated steps, or the panel's error when the project's history could not be read. */
export function NextStepsPanel({ steps, history }: { readonly steps: readonly WebsiteStep[] | null; readonly history: Loaded<unknown> | null }) {
  return (
    <Panel title="What happens next">
      {history !== null && !history.ok ? (
        <PanelError failure={history.error} what="your website's progress" />
      ) : steps === null ? null : (
        <TimelineSteps steps={steps.map(timelineStep)} label="What happens next" />
      )}
    </Panel>
  );
}

export function AddressPanelView({ panel }: { readonly panel: AddressPanel | null }) {
  if (panel === null) return null;
  return (
    <Panel title="Your web address">
      <p className="type-sub text-ink">{panel.hostname}</p>
      {panel.line === null ? null : <p className="mt-1 type-meta">{panel.line}</p>}
    </Panel>
  );
}

/** Main column and a narrower aside, one column on phones. */
export function Columns({ main, aside }: { readonly main: ReactNode; readonly aside: ReactNode }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">{main}</div>
      <div className="flex min-w-0 flex-col gap-4">{aside}</div>
    </div>
  );
}
