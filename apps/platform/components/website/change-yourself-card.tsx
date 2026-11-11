import Link from "next/link";
import type { ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageSection } from "@/components/v2/page";
import { CHANGE_YOURSELF_ITEMS } from "@/lib/website/change-yourself";

/** The two things the customer changes in the dashboard, which reach the website without a request. */
export function ChangeYourselfCard(): ReactElement {
  return (
    <PageSection id="change-yourself" title="Change it yourself">
      <p className="text-[0.9375rem] text-ink-2">These update your website in about a minute.</p>
      <ul className="mt-2 divide-y divide-line">
        {CHANGE_YOURSELF_ITEMS.map((item) => (
          <li key={item.label} className="grid justify-items-start gap-3 py-4 last:pb-0">
            <div>
              <p className="text-base font-semibold text-ink">{item.label}</p>
              {item.line === null ? null : <p className="mt-0.5 text-[0.9375rem] text-ink-2">{item.line}</p>}
            </div>
            <Link href={item.href} className={SOFT_BUTTON} aria-label={`Open ${item.label}`}>
              Open
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
