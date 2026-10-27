import type { StaffAccessAction } from "@brandbasket/db";

/** Typed over every action, so a new one cannot be added to the log without saying what it means here. */
export const ACTION_LABELS: Readonly<Record<StaffAccessAction, string>> = {
  "staff.sign_in": "Signed in",
  "access_log.view": "Opened the access log",
  "access.denied": "Was refused: needs a higher role",
  "client.view": "Opened a client",
  "lead.view": "Opened an enquiry",
  "outbox.view": "Opened an outbox message",
  "support_ticket.view": "Opened a request",
  "support_attachment.view": "Opened a request screenshot",
  "directory.view": "Opened the directory",
  "invoice.view": "Downloaded an invoice",
  "invoice.export": "Exported the invoice register",
  "breach.view": "Opened the breach register",
  "breach.log": "Logged a breach",
  "breach.update": "Updated a breach",
  "privacy_request.view": "Opened the privacy requests",
  "privacy_request.log": "Logged a privacy request",
  "privacy_request.update": "Updated a privacy request",
  "privacy_request.close": "Closed a privacy request",
  "search.run": "Searched the console",
  "lead.export": "Exported enquiries",
  "client.people_view": "Opened a client's people",
  "client.closure_restore": "Restored a closing account",
  "client.closure_extend": "Extended a closing account",
  "payment.list_view": "Opened payments",
  "payment.export": "Exported payments",
  "delivery.view": "Opened a delivery",
  "email.resend": "Resent an email",
  "alert.resend": "Resent an alert",
  "staff.invite": "Invited someone to the console",
  "staff.role_change": "Changed a staff role",
  "staff.deactivate": "Switched off a staff member",
  "staff.reactivate": "Switched a staff member back on",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action as StaffAccessAction] ?? action;
}
