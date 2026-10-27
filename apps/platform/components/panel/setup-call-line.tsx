import { isPhoneAccountEmail } from "@brandbasket/db";
import type { ReactElement } from "react";
import { BookCallButton } from "@/components/calls/book-call-button";
import { kindOptions } from "@/lib/requests/form";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";
import { getOnboardingSnapshot } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";

/**
 * The other way to set up: a short call, instead of the steps. A quiet line that opens the Book a call sheet; a customer
 * who would rather fill the steps in themselves just carries on. Until the setup has been sent (after that there is
 * nothing left to set up together), and only where staff have set a booking page.
 */
export async function SetupCallLine(): Promise<ReactElement | null> {
  const { user, tenant } = await requireWebsiteClient();
  const snapshot = await getOnboardingSnapshot();
  if (snapshot.project === null || snapshot.locked) return null;
  const [callState, services] = await Promise.all([getSetupCallState(tenant), loadSetupServices(tenant)]);
  if (callState.url === null) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-[0.8125rem] text-ink-2">
      <span>Want to set this up together?</span>
      <BookCallButton look="link" options={kindOptions(services ?? [])} bookingUrl={callState.url} canBook={!isPhoneAccountEmail(user.email)} />
    </div>
  );
}
