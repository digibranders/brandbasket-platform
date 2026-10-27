import { findDeliverableForBusiness, withTenantScope } from "@brandbasket/db";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { z } from "zod";
import { AskForm } from "@/components/requests/ask-form";
import { aboutLine, kindOptions, pickKind } from "@/lib/requests/form";
import { includedHeaderLine } from "@/lib/requests/rows";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { loadSetupServices } from "@/lib/server/first-look";
import { quietly } from "@/lib/server/quietly";
import { loadRequests } from "@/lib/server/requests";

export const metadata: Metadata = { title: "Ask for a change" };

interface AskPageProps {
  readonly searchParams: Promise<{ readonly kind?: string | readonly string[]; readonly about?: string | readonly string[] }>;
}

const one = (value: string | readonly string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

export default async function AskForAChangePage({ searchParams }: AskPageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  const params = await searchParams;
  const about = z.uuid().safeParse(one(params.about));
  const [services, data, post] = await Promise.all([
    loadSetupServices(tenant),
    // The included-edits line is a courtesy: a failed read leaves it out and the form still works.
    quietly("requests", "the included edits", null, () => loadRequests(tenant, billing.hasWebsite)),
    // Another business's post (or none) reads as nothing, and nothing from the address reaches the form except what this read returns.
    about.success
      ? quietly("requests", "the post to ask about", null, () => withTenantScope(getAppDb(), tenant, (tx) => findDeliverableForBusiness(tx, tenant.businessId, about.data)))
      : null,
  ]);
  const options = kindOptions(services ?? []);
  const postLine = post === null || post.kind !== "post" || post.dueOn === null ? null : aboutLine(post.title, post.dueOn);
  const includedLine = data === null ? null : includedHeaderLine(data.includedUsed, data.includedAllowed);
  return (
    <div className="mx-auto grid w-full max-w-[34rem] gap-6">
      <header>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Ask for a change</h1>
        {includedLine === null ? null : <p className="mt-2 text-[0.84375rem] text-ink-2">{includedLine}</p>}
      </header>
      <AskForm options={options} submissionKey={randomUUID()} defaultKind={pickKind(one(params.kind), options)} defaultBody={postLine ?? undefined} />
    </div>
  );
}
