import { loadEnquiriesForExport } from "@/features/enquiries/loader";
import { enquiriesCsv } from "@/features/enquiries/rules";
import { requirePaid } from "@/lib/guards";
import { load } from "@/lib/loaded";

export const dynamic = "force-dynamic";

/** Today in India, for the file name. */
function fileDay(now: Date): string {
  return new Date(now.getTime() + 19_800_000).toISOString().slice(0, 10);
}

/** The business's enquiries as a CSV download. Same guard as the page (a lapsed customer keeps reading); the business is the session's. */
export async function GET(): Promise<Response> {
  const customer = await requirePaid();
  const loaded = await load("enquiries.export", () => loadEnquiriesForExport(customer));
  if (!loaded.ok) return new Response("We could not export your enquiries. Try again in a minute.", { status: 500, headers: { "Cache-Control": "no-store" } });
  return new Response(enquiriesCsv(loaded.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enquiries-${fileDay(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
