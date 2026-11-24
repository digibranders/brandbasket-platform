import { PanelLoading } from "@/components";

/** Checkout and payment pages while they load: a panel of lines, never a blank page. */
export default function PayLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <PanelLoading rows={4} />
    </div>
  );
}
