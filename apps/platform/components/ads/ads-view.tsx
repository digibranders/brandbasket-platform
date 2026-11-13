import { Target } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { dayMonth } from "@/lib/call-dates";
import { campaignsByPlatform, campaignsUpdatedAt, type AdsView as Figures, type CampaignRow } from "@/lib/social/ads";
import type { AdsData } from "@/lib/server/ads";
import { EmptyState, FactRows, PageFrame, PageSection } from "@/components/v2/page";

const FIGURE = "font-figure font-semibold tabular-nums";
const NOT_MEASURED = "Not measured yet";

/** Ads: what staff entered for this month, spend against budget, leads and cost per lead, and each campaign by platform. */
export function AdsView({ data }: { readonly data: AdsData }): ReactElement {
  const { ads, campaigns, month, unavailable } = data;
  const empty = ads === null && campaigns.length === 0;
  return (
    <PageFrame title="Ads" lede="What is spent on your ads, and what they have brought in.">
      {unavailable ? (
        <EmptyState icon={Target} title="We could not load your ad figures" text="Please try again in a moment." />
      ) : empty ? (
        <EmptyState icon={Target} title={`No ad figures for ${month} yet`} text="Your figures appear here once your first campaign has run." />
      ) : (
        <>
          {ads === null ? null : <MonthFigures ads={ads} month={month} />}
          {campaigns.length === 0 ? null : <Campaigns rows={campaigns} month={month} />}
        </>
      )}
    </PageFrame>
  );
}

function MonthFigures({ ads, month }: { readonly ads: Figures; readonly month: string }): ReactElement {
  const items = [
    { label: ads.budget === null ? "Spent" : "Spent of budget", value: ads.spent === null ? NOT_MEASURED : ads.budget === null ? ads.spent : `${ads.spent} of ${ads.budget}` },
    { label: "Leads from ads", value: ads.leads === null ? NOT_MEASURED : String(ads.leads) },
    { label: "Cost per lead", value: ads.costPerLead ?? (ads.leads === 0 ? "No leads yet" : NOT_MEASURED) },
  ];
  return (
    <PageSection id="ads" title={`Ads in ${month}`} aside={ads.updatedAt === null ? undefined : `Updated ${dayMonth(ads.updatedAt)}`}>
      {ads.percent === null ? null : (
        <div role="img" aria-label={`${ads.percent}% of the budget spent`} className="mb-4 h-1.5 overflow-hidden rounded-full bg-sunken">
          <span className="block h-full rounded-full bg-ink" style={{ width: `${ads.percent}%` }} />
        </div>
      )}
      <FactRows items={items.map((item) => ({ label: item.label, value: <span className={item.value === NOT_MEASURED ? "text-ink-2" : FIGURE}>{item.value}</span> }))} />
    </PageSection>
  );
}

function Campaigns({ rows, month }: { readonly rows: readonly CampaignRow[]; readonly month: string }): ReactElement {
  const updated = campaignsUpdatedAt(rows);
  return (
    <PageSection id="campaigns" title={`Campaigns in ${month}`} aside={updated === null ? undefined : `Updated ${dayMonth(updated)}`}>
      <div className="grid gap-6">
        {campaignsByPlatform(rows).map((group) => (
          <div key={group.platform}>
            <h3 className="mb-1 text-[0.9375rem] font-semibold text-ink">{group.platform}</h3>
            <ul className="divide-y divide-line">
              {group.rows.map((row) => (
                <li key={row.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
                  <span className="min-w-0 break-words text-base text-ink">{row.name}</span>
                  <span className="text-[0.9375rem] text-ink-2">
                    <span className={`${FIGURE} text-ink`}>{row.budget === null ? row.spent : `${row.spent} of ${row.budget}`}</span> spent
                    {", "}
                    {row.leads === null ? "leads not measured yet" : row.leads === 0 ? "no leads yet" : `${row.leads} ${row.leads === 1 ? "lead" : "leads"}, ${row.costPerLead} per lead`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageSection>
  );
}
