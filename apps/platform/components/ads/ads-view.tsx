import { Target } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { EmptyState, PageFrame } from "@/components/v2/page";
import type { AdsPanel } from "@/lib/social/ads";
import { AdsSection } from "./ads-section";

/** Made-up figures, shown until the real ones are wired in. They are labelled as a sample on the page and are never read from anything stored. */
const SAMPLE_MONTH = "November";
const SAMPLE: AdsPanel = { spent: "₹6,240 of ₹10,000", percent: 62, enquiries: 21, adMoney: "₹1,500" };

/** Ads: a sample page for now, a standalone menu item with made-up figures. */
export function AdsView(): ReactElement {
  return (
    <PageFrame title="Ads" lede="What is spent on your ads, and what they have brought in.">
      <p role="status" className="text-[0.8125rem] font-semibold text-ink-2">
        Sample figures for now. Your own numbers will appear here.
      </p>
      <AdsSection ads={SAMPLE} month={SAMPLE_MONTH} />
      <EmptyState compact icon={Target} title="More to come" text="Your ad budget and a report of what your ads brought in will be here." />
    </PageFrame>
  );
}
