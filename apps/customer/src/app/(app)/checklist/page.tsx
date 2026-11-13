import { PageHeader, PanelData } from "@/components";
import { ChecklistRows } from "@/features/checklist/components/checklist-rows";
import { ItemView } from "@/features/checklist/components/item-view";
import { readChecklistState } from "@/features/checklist/loader";
import { isChecklistKey } from "@/features/checklist/rules-items";
import { requirePaid } from "@/lib/guards";
import { load } from "@/lib/loaded";

type SearchParams = Promise<Readonly<Record<string, string | string[] | undefined>>>;

/** Setup checklist. Each item saves on its own in a sheet (`?item=<key>`); there is no send step. */
export default async function ChecklistPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const customer = await requirePaid();
  const params = await searchParams;
  const state = await load("checklist.items", () => readChecklistState(customer));
  const requested = Array.isArray(params.item) ? params.item[0] : params.item;
  const open = isChecklistKey(requested) && state.ok && state.data.rows.some((row) => row.item.key === requested) ? requested : null;

  return (
    <>
      <PageHeader title="Setup checklist" />
      <PanelData
        data={state}
        title="Get ready for your call"
        flush
        what="your checklist"
        isEmpty={(data) => data.rows.length === 0}
        empty={{ icon: "CheckCircle", title: "There's nothing to set up right now", description: "Anything we need from you will show here." }}
      >
        {(data) => <ChecklistRows rows={data.rows} canWrite={customer.role !== "viewer"} />}
      </PanelData>
      {open !== null && state.ok ? <ItemView itemKey={open} state={state.data} customer={customer} /> : null}
    </>
  );
}
