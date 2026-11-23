import type { ConfirmCopy } from "@brandbasket/shared/ui/patterns";

/** The confirm before a setup link goes out: it names the address, because the person is emailed now and a sent email cannot be unsent. */
export function setupLinkCopy(email: string): ConfirmCopy {
  return {
    title: `Email the setup link to ${email}?`,
    consequence: "They are emailed now and the status moves to Setup link sent. Any earlier link stops working. A sent email cannot be unsent.",
    confirmLabel: "Send setup link",
  };
}
