import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  NeedsYourOkList,
  PageHeader,
  StatTile,
  StatusChip,
} from "@brandbasket/shared/ui/patterns";

export const metadata: Metadata = { title: "Design system · Staff console" };

/**
 * Preview of shared patterns for staff console.
 */
export default function AdminDesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 p-8">
      <PageHeader
        eyebrow="Staff Console"
        title="Shared Patterns Preview"
        description="Release 2 patterns applied to staff console workflows."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Late tasks" value="3" delta="+1" deltaTone="neutral" />
        <StatTile label="Due today" value="12" />
        <StatTile label="On track" value="48" deltaTone="positive" />
        <StatTile label="Active clients" value="63" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusChip label="Live" variant="active" hasDot />
        <StatusChip label="Next step" variant="next" />
        <StatusChip label="Waiting" variant="waiting" />
        <StatusChip label="Draft" variant="idle" />
        <StatusChip label="Failed" variant="failed" />
      </div>

      <NeedsYourOkList
        items={[
          { id: "1", title: "Kickoff call overdue", context: "Sweet Crust Bakery", age: "1h" },
          { id: "2", title: "Review preview changes", context: "Urban Groomers", age: "3h" },
        ]}
      />
    </main>
  );
}
