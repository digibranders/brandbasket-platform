/** Draft wording for the unsubscribe page. Not approved: the owner decides it (docs/implementation/reports/NOTIFY-03.md). */
export const UNSUBSCRIBE_COPY = {
  title: "Stop these emails?",
  ledeFor: (address: string): string => `We will stop sending reports and reminders to ${address}. We will still email you about payments, your account and security.`,
  button: "Stop these emails",
  doneTitle: "You will not get these emails",
  doneLede: "We will still email you about payments, your account and security.",
  invalidTitle: "This link does not work",
  invalidLede: "It may be incomplete. Use the link in the latest email we sent you.",
} as const;
