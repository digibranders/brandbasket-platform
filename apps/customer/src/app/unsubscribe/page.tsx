import type { Metadata } from "next";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { readUnsubscribeLink } from "@/platform/lib/server/unsubscribe";
import { Button } from "@/ui";
import { unsubscribeAction } from "./actions";
import { UNSUBSCRIBE_COPY } from "./copy";

export const metadata: Metadata = { title: UNSUBSCRIBE_COPY.title, referrer: "no-referrer" };

// Never cached: the link carries the address and its signature.
export const dynamic = "force-dynamic";

/**
 * Where an unsubscribe link from an email lands. Opening it changes nothing (a link scanner must not unsubscribe anyone): the
 * address is suppressed only when the button is pressed. Signed out is fine: the signed link is the proof.
 */
export default async function UnsubscribePage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const e = typeof params.e === "string" ? params.e : null;
  const t = typeof params.t === "string" ? params.t : null;
  const address = readUnsubscribeLink({ e, t });
  if (address === null || e === null || t === null) {
    return <EntryScreen title={UNSUBSCRIBE_COPY.invalidTitle} lede={UNSUBSCRIBE_COPY.invalidLede} />;
  }
  return (
    <EntryScreen framed title={UNSUBSCRIBE_COPY.title} lede={UNSUBSCRIBE_COPY.ledeFor(address)}>
      <form action={unsubscribeAction} className="flex flex-col gap-4">
        <input type="hidden" name="e" value={e} />
        <input type="hidden" name="t" value={t} />
        <Button type="submit" variant="primary" size="lg">
          {UNSUBSCRIBE_COPY.button}
        </Button>
      </form>
    </EntryScreen>
  );
}
