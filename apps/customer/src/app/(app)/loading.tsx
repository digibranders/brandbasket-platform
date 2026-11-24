import { PanelLoading } from "@/components";
import { Skeleton } from "@/ui";

/**
 * Any workspace page while its data loads: the title and a line under it keep their place, then a panel the size of a
 * typical one. A page with a closer loading.tsx (Business, Settings) shows its own shape instead.
 */
export default function AppLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="w-1/2" />
      </div>
      <PanelLoading rows={4} />
    </div>
  );
}
