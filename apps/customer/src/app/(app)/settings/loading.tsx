import { Skeleton } from "@/ui";

/** Settings while a tab loads: the title and the tab row keep their place, then one card of lines the size of the real one. */
export default function SettingsLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="w-1/2" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-4 rounded-overlay border border-border bg-surface p-6 sm:p-7">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="w-2/3" />
        <Skeleton className="w-1/2" />
        <Skeleton className="w-3/5" />
      </div>
    </div>
  );
}
