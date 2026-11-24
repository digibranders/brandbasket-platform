import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { StatusChip } from "@brandbasket/shared/ui/patterns";
import { CHIP_VARIANTS } from "@/components/console/client-overview-cards";
import type { ServiceStatus } from "@/lib/client-services";
import { clientTabHref } from "@/lib/client-tabs";

interface Line {
  readonly text: string;
  readonly link: { readonly href: string; readonly label: string } | null;
}

/** What a card says about a service and where staff run it. Social has no staff work (D16) and Monitoring has no screen (D15). */
function lineFor(businessId: string, service: ServiceStatus): Line {
  const contacted = service.state === "setup" ? { href: `${clientTabHref(businessId, "billing")}#add-ons`, label: "Mark them as contacted" } : null;
  switch (service.id) {
    case "managed-website":
      return { text: "Built and run on the Website tab.", link: { href: clientTabHref(businessId, "website"), label: "Open website" } };
    case "social-media":
      return { text: "Posting runs on its own. Staff do no Social work.", link: contacted };
    case "paid-ads":
      return { text: "Monthly figures for the customer's report. Brandbasket does not run the ads.", link: contacted };
    case "expert-monitoring":
      return { text: "Nothing to enter for this service.", link: contacted };
  }
}

/** One card per service this client has. The Paid Ads card holds the figures form it is given as `figures`. */
export function ServicesTabCards({
  businessId,
  services,
  figures,
}: {
  readonly businessId: string;
  readonly services: readonly ServiceStatus[];
  readonly figures: ReactNode;
}): ReactElement {
  return (
    <ul className="grid gap-4">
      {services.map((service) => {
        const line = lineFor(businessId, service);
        return (
          <li key={service.id} id={service.id} className="scroll-mt-8 rounded-[14px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[0.9375rem] font-semibold text-ink">{service.title}</h2>
              <StatusChip label={service.text} variant={CHIP_VARIANTS[service.state]} />
            </div>
            <p className="mt-2 max-w-[60ch] text-sm text-ink-2">{line.text}</p>
            {line.link === null ? null : (
              <Link href={line.link.href} className="mt-3 inline-block text-xs font-semibold text-ink-2 hover:text-ink">
                {line.link.label}
              </Link>
            )}
            {service.id === "paid-ads" ? figures : null}
          </li>
        );
      })}
    </ul>
  );
}
