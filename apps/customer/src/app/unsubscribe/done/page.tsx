import type { Metadata } from "next";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { UNSUBSCRIBE_COPY } from "../copy";

export const metadata: Metadata = { title: UNSUBSCRIBE_COPY.doneTitle, referrer: "no-referrer" };

export default function UnsubscribeDonePage() {
  return <EntryScreen title={UNSUBSCRIBE_COPY.doneTitle} lede={UNSUBSCRIBE_COPY.doneLede} />;
}
