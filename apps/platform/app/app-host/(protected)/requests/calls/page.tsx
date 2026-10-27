import { isPhoneAccountEmail } from "@brandbasket/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { CallsView } from "@/components/calls/calls-view";
import { kindOptions } from "@/lib/requests/form";
import { REQUESTS_PATH } from "@/lib/requests/links";
import { callsAreOpen, loadCalls } from "@/lib/server/calls";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";
import { getSetupCallState } from "@/lib/server/setup-call";

export const metadata: Metadata = { title: "Calls" };

export default async function CallsPage(): Promise<ReactElement> {
  const { user, tenant, billing } = await requireCustomerAccess();
  // Until the kickoff call has happened it is the only call, and it is booked from Overview.
  if (!(await callsAreOpen(tenant, billing))) redirect(REQUESTS_PATH);
  const [data, services, callState] = await Promise.all([loadCalls(tenant, new Date()), loadSetupServices(tenant), getSetupCallState(tenant)]);
  return (
    <CallsView
      upcoming={data.upcoming}
      past={data.past}
      options={kindOptions(services ?? [])}
      bookingUrl={callState.url}
      canBook={!isPhoneAccountEmail(user.email)}
    />
  );
}
