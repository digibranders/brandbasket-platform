import { PageHeader } from "@/components";
import { TabLinks } from "@/ui";

export const BUSINESS_TABS = [
  { href: "/business", label: "Details" },
  { href: "/business/brand", label: "Brand kit" },
] as const;

/** The page title and its two tabs, shared by Details and Brand kit. */
export function BusinessHeader({ current }: { readonly current: (typeof BUSINESS_TABS)[number]["href"] }) {
  return (
    <PageHeader
      title="Business profile"
      description="Your details are used everywhere we work for you. Change them here once."
      tabs={<TabLinks aria-label="Business profile" items={BUSINESS_TABS} current={current} />}
    />
  );
}
