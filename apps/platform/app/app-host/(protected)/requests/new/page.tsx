import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { AskForm } from "@/components/requests/ask-form";
import { kindOptions, readAskDefaults } from "@/lib/requests/form";
import { includedHeaderLine } from "@/lib/requests/rows";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";
import { quietly } from "@/lib/server/quietly";
import { loadRequests } from "@/lib/server/requests";

export const metadata: Metadata = { title: "Ask for a change" };

export default async function AskForAChangePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  const [services, data, query] = await Promise.all([
    loadSetupServices(tenant),
    // The included-edits line is a courtesy: a failed read leaves it out and the form still works.
    quietly("requests", "the included edits", null, () => loadRequests(tenant, billing.hasWebsite)),
    searchParams,
  ]);
  const options = kindOptions(services ?? []);
  const defaults = readAskDefaults(query, options);
  const includedLine = data === null ? null : includedHeaderLine(data.includedUsed, data.includedAllowed);
  return (
    <div className="mx-auto grid w-full max-w-[34rem] gap-6">
      <header>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Ask for a change</h1>
        {defaults.fromPreview ? <p className="mt-2 text-[0.84375rem] text-ink-2">Your preview is waiting. Tell us what to change.</p> : null}
        {includedLine === null ? null : <p className="mt-2 text-[0.84375rem] text-ink-2">{includedLine}</p>}
      </header>
      <AskForm options={options} submissionKey={randomUUID()} defaultKind={defaults.kind ?? undefined} defaultPage={defaults.page} />
    </div>
  );
}
