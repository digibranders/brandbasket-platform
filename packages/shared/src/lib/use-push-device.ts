"use client";

import { useCallback, useEffect, useState } from "react";
import { classifyPushEnvironment, urlBase64ToBytes, type PushEnvironment, type PushFacts } from "./push-device";

/** The wording both apps show. */
export const PUSH_MESSAGES = {
  blocked: "Notifications are blocked for this site in your browser. Allow them in the browser's site settings, then try again.",
  unsupported: "This browser cannot show notifications from a website.",
  needsInstall: "On iPhone, add Brandbasket to your Home Screen first, then open it from there and turn this on.",
  failed: "We could not turn notifications on. Please try again in a moment.",
  removeFailed: "We could not turn notifications off. Please try again in a moment.",
} as const;

export type PushDeviceState = "checking" | "unavailable" | PushEnvironment | "off" | "on";

export interface PushSubscriptionPayload {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

export interface PushDeviceOptions {
  /** The VAPID public key; null when the server has none, so the switch is not offered. */
  readonly publicKey: string | null;
  readonly save: (subscription: PushSubscriptionPayload) => Promise<{ readonly ok: boolean }>;
  readonly remove: (endpoint: string) => Promise<{ readonly ok: boolean }>;
}

function readFacts(): PushFacts {
  const agent = navigator.userAgent;
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "default",
    // iPadOS reports itself as a Mac with a touch screen.
    ios: /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1),
    standalone: nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
  };
}

/**
 * This browser's web push switch. Nothing is registered, asked or saved until turnOn runs, which belongs in a click handler:
 * the browser's permission question appears only then.
 */
export function usePushDevice({ publicKey, save, remove }: PushDeviceOptions) {
  const [state, setState] = useState<PushDeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    (async () => {
      if (publicKey === null) return setState("unavailable");
      const environment = classifyPushEnvironment(readFacts());
      if (environment !== "ready") return setState(environment);
      try {
        // getRegistration does not register anything: it only looks for a worker a person already turned on.
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (current) setState(subscription ? "on" : "off");
      } catch {
        if (current) setState("off");
      }
    })();
    return () => {
      current = false;
    };
  }, [publicKey]);

  const turnOn = useCallback(async (): Promise<void> => {
    if (publicKey === null) return;
    setMessage(null);
    setBusy(true);
    try {
      const environment = classifyPushEnvironment(readFacts());
      if (environment !== "ready") {
        setState(environment);
        setMessage(environment === "needs-install" ? PUSH_MESSAGES.needsInstall : environment === "blocked" ? PUSH_MESSAGES.blocked : PUSH_MESSAGES.unsupported);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("blocked");
        setMessage(PUSH_MESSAGES.blocked);
        return;
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) });
      const json = subscription.toJSON();
      const saved =
        json.endpoint !== undefined && json.keys?.p256dh !== undefined && json.keys.auth !== undefined
          ? await save({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
          : { ok: false };
      if (!saved.ok) {
        // Not saved on our side, so the browser must not keep a subscription we will never send to.
        await subscription.unsubscribe();
        setMessage(PUSH_MESSAGES.failed);
        return;
      }
      setState("on");
    } catch {
      setMessage(PUSH_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  }, [publicKey, save]);

  const turnOff = useCallback(async (): Promise<void> => {
    setMessage(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const removed = await remove(subscription.endpoint);
        if (!removed.ok) {
          setMessage(PUSH_MESSAGES.removeFailed);
          return;
        }
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setMessage(PUSH_MESSAGES.removeFailed);
    } finally {
      setBusy(false);
    }
  }, [remove]);

  return { state, busy, message, turnOn, turnOff } as const;
}
