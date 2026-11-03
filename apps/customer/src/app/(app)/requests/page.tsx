import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { NewRequestDialog } from "@/features/requests/components/new-request-dialog";
import { RequestsScreen } from "@/features/requests/components/requests-screen";
import { loadAboutLine, loadIncludedLine, loadRequestRows } from "@/features/requests/loader";
import { intentOptions, paymentNoticeLine, readAskDefaults, readServiceFilter, readStatusFilter, requestPath, single } from "@/features/requests/rules";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Requests" };

type Params = Readonly<Record<string, string | string[] | undefined>>;

export default async function RequestsPage({ searchParams }: { readonly searchParams: Promise<Params> }) {
  const customer = await requireCustomer();
  const params = await searchParams;
  const asked = single(params.open);
  // Old links carry `?open=<ticket id>`; anything that is not an id is not a request.
  if (asked !== undefined && !z.uuid().safeParse(asked).success) notFound();

  const [rows, included] = await Promise.all([loadRequestRows(customer), loadIncludedLine(customer)]);
  // The list shows the newest 100: a request beyond it opens on its own page, which says whether it exists.
  if (asked !== undefined && rows.ok && !rows.data.some((row) => row.ticketId === asked)) redirect(requestPath(asked));

  const options = intentOptions(customer.services);
  const defaults = readAskDefaults(params, options);
  const about = z.uuid().safeParse(single(params.about));
  const aboutLine = params.new === "1" && about.success ? await loadAboutLine(customer, about.data) : null;

  return (
    <RequestsScreen
      customer={customer}
      rows={rows}
      includedLine={included.ok ? included.data : null}
      status={readStatusFilter(params.filter)}
      service={readServiceFilter(params.service)}
      open={asked}
      notice={paymentNoticeLine(params.charge)}
      dialog={
        <NewRequestDialog
          key={`${defaults.intent}|${defaults.page}|${about.success ? about.data : ""}`}
          options={options}
          defaultIntent={defaults.intent}
          defaultPage={defaults.page}
          defaultBody={aboutLine?.ok === true ? (aboutLine.data ?? "") : ""}
          fromPreview={defaults.fromPreview}
          includedLine={included.ok ? included.data : null}
        />
      }
    />
  );
}
