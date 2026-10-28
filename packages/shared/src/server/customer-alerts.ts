import "server-only";
import { findBusinessAlertDetails, type Database } from "@brandbasket/db";
import { customerEventTeamsCard, type CustomerCardInput } from "../lib/customer-alert-card";
import { displayPhone } from "./phone-display";
import { sendTeamsAlert } from "./teams-alerts";

/**
 * Tells the Customers channel that something happened to a customer's account, with who they are and where to open them.
 * Call it after the change has committed. Best-effort like every alert: it never throws.
 */
export async function announceCustomerEvent(
  db: Database,
  secret: string,
  event: Pick<CustomerCardInput, "event" | "facts" | "text" | "buttons"> & { readonly businessId: string },
  consoleOrigin: string,
): Promise<void> {
  try {
    const details = await findBusinessAlertDetails(db, event.businessId);
    if (details === null) return;
    const { business, owner } = details;
    const card = customerEventTeamsCard({
      event: event.event,
      customer: { name: owner.name, email: owner.email, phone: owner.phone === null ? null : displayPhone(owner.phone).text },
      business: { name: business.name, websiteUrl: business.websiteUrl },
      facts: event.facts,
      text: event.text,
      ...(event.buttons === undefined ? {} : { buttons: event.buttons }),
      consoleUrl: new URL(`/clients/${business.id}`, consoleOrigin).toString(),
    });
    await sendTeamsAlert(db, secret, "customers", card);
  } catch (error) {
    console.error("[teams-alert] A customer event could not be announced.", { event: event.event, error: error instanceof Error ? error.name : "error" });
  }
}
