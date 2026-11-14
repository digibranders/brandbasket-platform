import { CreditCard, Eye, Globe, Phone } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import type { ClientDetail, SetupCallBooking } from "@brandbasket/db";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { CUSTOMER_STAGE_HEADLINE } from "@brandbasket/shared/lib/project-customer-line";
import { formatTimingWindow, kickoffMeetingLink } from "@brandbasket/shared/lib/setup-call-link";
import { clock, weekdayDate } from "@/lib/team-time";

export interface CustomerMirrorPanelProps {
  readonly client: ClientDetail;
  readonly booking: SetupCallBooking | null;
  readonly now: Date;
  readonly fallbackCallUrl?: string | null;
}

function kickoffCustomerMessage(booking: SetupCallBooking | null, now: Date): string {
  if (booking === null) return "Kickoff call not yet booked";
  if (booking.heldAt !== null) return "Thanks for the call. We are getting your website started";
  if (booking.startsAt !== null && now.getTime() > booking.startsAt.getTime()) {
    return "We will start your website right after your call";
  }
  if (booking.startsAt !== null) {
    if (booking.endsAt !== null) {
      return `Your kickoff call is booked for ${clock(booking.startsAt)} to ${clock(booking.endsAt)} on ${weekdayDate(booking.startsAt)}`;
    }
    return `Your kickoff call is booked for ${clock(booking.startsAt)} on ${weekdayDate(booking.startsAt)}`;
  }
  return "Your kickoff call is booked";
}

function billingCustomerMessage(client: ClientDetail, now: Date): string {
  if (client.billing?.subscription?.status === "past_due") return "Payment past due";
  if (client.billing && clientPaymentState(client.billing, now).kind === "lapsed") return "Plan has lapsed";
  return "Plan active";
}

function projectStepInfo(status: string | null): { readonly step: number; readonly label: string } {
  if (status === null || status === "onboarding") return { step: 1, label: "Kickoff" };
  if (status === "submitted" || status === "building") return { step: 2, label: "Building" };
  if (status === "preview" || status === "revisions") return { step: 3, label: "Preview" };
  if (status === "approved" || status === "live") return { step: 4, label: "Live" };
  return { step: 1, label: "Kickoff" };
}

/**
 * Mirror panel: "What the customer sees".
 * Read-only mirror reflecting the exact customer status across Website, Kickoff call, and Plan and billing.
 */
export function CustomerMirrorPanel({ client, booking, now, fallbackCallUrl }: CustomerMirrorPanelProps): ReactElement {
  const stepInfo = projectStepInfo(client.project?.status ?? null);
  const websiteStatus = client.project ? CUSTOMER_STAGE_HEADLINE[client.project.status] : "No website service active";
  const kickoffStatus = kickoffCustomerMessage(booking, now);
  const billingStatus = billingCustomerMessage(client, now);
  const meetingUrl = kickoffMeetingLink(booking?.inviteeUri, fallbackCallUrl);

  return (
    <section aria-labelledby="customer-sees-title" className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Eye size={18} aria-hidden="true" className="text-rattan-text" />
          <h2 id="customer-sees-title" className="font-display text-[0.9375rem] font-semibold text-ink">
            What the customer sees
          </h2>
        </div>
        <span className="rounded-full bg-sunken px-2.5 py-0.5 font-sans text-xs font-semibold text-ink-2">
          Read only mirror
        </span>
      </div>

      <div className="mt-4 rounded-[10px] border border-line bg-canvas/40 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-sunken/40 px-3.5 py-2">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-ink-2/30" />
            <span className="size-2 rounded-full bg-ink-2/30" />
            <span className="size-2 rounded-full bg-ink-2/30" />
          </div>
          <span className="ml-2 font-mono text-xs text-ink-2">app.brandbasket.in/website</span>
        </div>

        <div className="p-4">
          {client.project ? (
            <div className="mb-4 flex items-center gap-2 font-sans text-xs text-ink-2">
              <span className={`flex size-5 items-center justify-center rounded-full text-xs font-semibold ${stepInfo.step >= 1 ? "bg-sage text-white" : "border border-line bg-surface"}`}>
                {stepInfo.step > 1 ? "✓" : "1"}
              </span>
              <span>Kickoff</span>
              <span className="text-ink-2/40">·</span>
              <span className={`flex size-5 items-center justify-center rounded-full text-xs font-semibold ${stepInfo.step >= 2 ? (stepInfo.step > 2 ? "bg-sage text-white" : "bg-rattan-text text-white") : "border border-line bg-surface"}`}>
                {stepInfo.step > 2 ? "✓" : "2"}
              </span>
              <span>Building</span>
              <span className="text-ink-2/40">·</span>
              <span className={`flex size-5 items-center justify-center rounded-full text-xs font-semibold ${stepInfo.step >= 3 ? (stepInfo.step > 3 ? "bg-sage text-white" : "bg-rattan-text text-white") : "border border-line bg-surface"}`}>
                {stepInfo.step > 3 ? "✓" : "3"}
              </span>
              <span>Preview</span>
              <span className="text-ink-2/40">·</span>
              <span className={`flex size-5 items-center justify-center rounded-full text-xs font-semibold ${stepInfo.step >= 4 ? "bg-sage text-white" : "border border-line bg-surface"}`}>
                4
              </span>
              <span>Live</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[8px] border border-line/60 bg-surface p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                <Globe size={14} aria-hidden="true" />
                <span>Website</span>
              </div>
              <p className="mt-1 font-sans text-sm font-semibold text-ink">
                {websiteStatus}
              </p>
              {client.project?.previewUrl ? (
                <p className="mt-1 truncate font-sans text-xs text-ink-2">
                  Preview available
                </p>
              ) : null}
            </div>

            <div className="rounded-[8px] border border-line/60 bg-surface p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                <Phone size={14} aria-hidden="true" />
                <span>Kickoff call</span>
              </div>
              <p className="mt-1 font-sans text-sm font-semibold text-ink">
                {kickoffStatus}
              </p>
              {booking?.startsAt !== null && booking?.startsAt !== undefined && booking?.endsAt !== null && booking?.endsAt !== undefined ? (
                <p className="mt-1 font-mono text-xs text-ink-2">
                  {formatTimingWindow(booking.startsAt, booking.endsAt)}
                </p>
              ) : null}
              {meetingUrl && booking?.heldAt === null ? (
                <div className="mt-2">
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rattan-text hover:underline"
                  >
                    Join meeting &rarr;
                  </a>
                </div>
              ) : null}
            </div>

            <div className="rounded-[8px] border border-line/60 bg-surface p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
                <CreditCard size={14} aria-hidden="true" />
                <span>Plan and billing</span>
              </div>
              <p className="mt-1 font-sans text-sm font-semibold text-ink">
                {billingStatus}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
