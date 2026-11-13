import { PanelLoading } from "@/components";

/** The dashboard's shape while its panels load: no full-page spinner (plan 60, section 13). */
export default function AffiliateLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PanelLoading rows={3} />
      <PanelLoading rows={6} />
    </div>
  );
}
