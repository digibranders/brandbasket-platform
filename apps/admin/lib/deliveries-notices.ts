/** What a Notice above the Deliveries list says after a resend. Tones match the console's Notice component. */
export interface ResendNotice {
  readonly tone: "ok" | "problem";
  readonly text: string;
}

const ONE: Readonly<Record<string, ResendNotice>> = {
  sent: { tone: "ok", text: "Sent again." },
  failed: { tone: "problem", text: "It still did not go. The reason is on the row." },
  refused: { tone: "problem", text: "This one cannot be sent again: it went already, or the copy kept leaves out a sign-in link." },
  unavailable: { tone: "problem", text: "Email sending is not set up here, so nothing was sent." },
};

export function resendNotice(params: { readonly resent?: string; readonly resentAll?: string }): ResendNotice | null {
  if (params.resent !== undefined) return ONE[params.resent] ?? null;
  const match = /^(\d+)-(\d+)$/.exec(params.resentAll ?? "");
  if (match === null) return null;
  const sent = Number(match[1]);
  const failed = Number(match[2]);
  return failed === 0 ? { tone: "ok", text: `Sent ${sent} again.` } : { tone: "problem", text: `Sent ${sent} again; ${failed} still did not go.` };
}
