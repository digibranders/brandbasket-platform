/*
 * How notify() hands a push to a device. The real sender (web-push with VAPID keys, quiet hours, revoking a subscription on 404 or 410) is web-push-sender.ts. Development uses the fake sender, which only remembers
 * what it was asked to send, so no real push leaves the machine.
 */

export interface PushTarget {
  readonly audience: "customer" | "staff";
  /** The customer to push to; null for the one staff account. */
  readonly userId: string | null;
}

/** What goes to the device: no private detail, an absolute address to open, and a tag that makes a repeat replace the one before it. */
export interface PushMessage {
  readonly title: string;
  readonly body?: string;
  readonly url: string;
  readonly tag: string;
  /** The event key. Lets the real sender apply quiet hours (payment failed is the one exception). */
  readonly event?: string;
}

export interface PushSender {
  /** Sends to every subscription the target has. Sending to a target with none is not an error. May throw; notify() catches it. */
  readonly send: (target: PushTarget, message: PushMessage) => Promise<void>;
}

export interface FakePushSender extends PushSender {
  readonly sent: { readonly target: PushTarget; readonly message: PushMessage }[];
}

export function createFakePushSender(): FakePushSender {
  const sent: FakePushSender["sent"] = [];
  return {
    sent,
    send: async (target, message) => {
      sent.push({ target, message });
    },
  };
}
