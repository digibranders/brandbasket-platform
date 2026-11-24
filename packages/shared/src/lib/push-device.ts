import { z } from "zod";

/*
 * What the browser side of web push needs, kept free of React and the DOM so it can be tested and shared by both apps.
 */

/** The VAPID public key for the browser. Read at request time (never inlined at build), so it is the same as the sending key. */
export function publicVapidKey(env: Readonly<Record<string, string | undefined>>): string | null {
  const key = env.VAPID_PUBLIC_KEY?.trim() || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key ? key : null;
}

/** The url-safe base64 a VAPID key is written in, as the bytes `pushManager.subscribe` wants. */
export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=").replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export type PushEnvironment = "ready" | "blocked" | "needs-install" | "unsupported";

export interface PushFacts {
  readonly hasServiceWorker: boolean;
  readonly hasPushManager: boolean;
  readonly hasNotification: boolean;
  readonly permission: "default" | "granted" | "denied";
  readonly ios: boolean;
  /** Opened from the home screen icon rather than a browser tab. */
  readonly standalone: boolean;
}

/** What this browser can do. On iPhone web push exists only in the app added to the home screen (iOS 16.4 and later). */
export function classifyPushEnvironment(facts: PushFacts): PushEnvironment {
  if (facts.ios && !facts.standalone) return "needs-install";
  if (!facts.hasServiceWorker || !facts.hasPushManager || !facts.hasNotification) return "unsupported";
  return facts.permission === "denied" ? "blocked" : "ready";
}

/** The push services browsers use: Chrome, Edge, Brave and Opera (FCM or Windows), Firefox, and Safari. */
const PUSH_HOSTS: readonly RegExp[] = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

/**
 * A subscription a browser sends us. The endpoint is a URL our server will post to, so only the known push services are
 * accepted: no other host, no address literal, no port, no credentials.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(MAX_ENDPOINT_LENGTH)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && PUSH_HOSTS.some((host) => host.test(url.hostname));
      } catch {
        return false;
      }
    }, "That is not a push service address."),
  keys: z.object({ p256dh: z.string().min(1).max(MAX_KEY_LENGTH), auth: z.string().min(1).max(MAX_KEY_LENGTH) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export function parsePushSubscription(input: unknown) {
  return pushSubscriptionSchema.safeParse(input);
}

/** A device's removal request: the endpoint only. */
export const pushEndpointSchema = z.object({ endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH) });
