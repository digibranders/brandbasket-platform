import Link from "next/link";
import type { ReactElement } from "react";
import { brandedLabel, featureShownTo } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { UPGRADE_PATH } from "@/lib/membership";
import { CARE_INCLUDES, premiumOnlyFeatures } from "@/lib/plan-features";

/**
 * What the Care plan includes, on a Care client's Home (docs/superpowers/specs/2026-10-07-care-plan-design.md): the four
 * things they have, and one line naming what Premium adds, so what is missing from their menu is explained rather than
 * silently absent. Hairlines and short lines, like the rest of the dashboard.
 */
export async function CareIncludes(): Promise<ReactElement> {
  const brand = await requestBrand();
  const premiumAdds = premiumOnlyFeatures()
    .filter((feature) => featureShownTo(feature.id, brand))
    .slice(0, 4)
    .map((feature) => brandedLabel(feature.label, brand).toLowerCase());
  return (
    <section aria-labelledby="care-includes-heading" className="mt-10">
      <h2 id="care-includes-heading" className="panel-section">
        Your Care plan
      </h2>
      <ul className="mt-5 max-w-2xl border-t border-line">
        {CARE_INCLUDES.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3.5">
            <span className="text-[0.9375rem] font-medium">{item.title}</span>
            <span className="max-w-md text-sm text-ink-soft">{item.line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-2xl text-sm text-ink-soft">
        Premium adds {premiumAdds.join(", ")} and more.{" "}
        <Link href={UPGRADE_PATH} className="link-underline text-ink">
          See what it costs to move up
        </Link>
        .
      </p>
    </section>
  );
}
