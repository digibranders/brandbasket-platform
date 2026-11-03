"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The Cloudflare Turnstile widget, the browser half of the robot check whose server half is checkHuman
 * (@brandbasket/shared/server/turnstile-request). Ported from @brandbasket/shared/ui/turnstile.tsx, which this app may not
 * import. Put it inside a <form>: it fills the form's `cf-turnstile-response` field. A token works once, so a form that stays
 * on the page after a send passes a changing `resetKey` (its action state) to fetch a fresh one. With no site key (the check
 * is off on this deployment) it draws nothing.
 */

interface TurnstileOptions {
  readonly sitekey: string;
  readonly action: string;
  readonly appearance: "always";
  readonly size: "flexible";
  readonly theme: "light";
  readonly "refresh-expired": "auto";
  readonly callback: (token: string) => void;
  readonly "expired-callback": () => void;
  readonly "timeout-callback": () => void;
  readonly "error-callback": () => boolean;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SOURCE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** The field Cloudflare fixes, which checkHuman reads. */
const RESPONSE_FIELD = "cf-turnstile-response";

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once for the page. A failed load can be tried again. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile !== undefined) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SOURCE;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile === undefined) reject(new Error("Turnstile did not start."));
      else resolve(window.turnstile);
    };
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error("Turnstile could not be loaded."));
    };
    document.head.append(script);
  });
  return loading;
}

export interface TurnstileWidgetProps {
  /** The page's public key, or null when the check is off. */
  readonly siteKey: string | null;
  /** The form's name for the check; the action must check the same one. */
  readonly action: string;
  readonly resetKey?: unknown;
}

export function TurnstileWidget({ siteKey, action, resetKey }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (siteKey === null) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || container.current === null) return;
        // Always drawn: Cloudflare's own box shows the check running, and a hidden one can stall on a phone.
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          appearance: "always",
          size: "flexible",
          theme: "light",
          "refresh-expired": "auto",
          callback: (next) => {
            setFailed(false);
            setToken(next);
          },
          "expired-callback": () => setToken(""),
          "timeout-callback": () => setToken(""),
          "error-callback": () => {
            setFailed(true);
            setToken("");
            return true;
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (widgetId.current === null) return;
    // The token just sent is spent: fetch a fresh one.
    setToken("");
    window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (siteKey === null) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {/* Cloudflare draws its box here; the space is kept so the form does not jump. */}
      <div ref={container} className="min-h-16" />
      <input type="hidden" name={RESPONSE_FIELD} value={token} />
      {failed ? (
        <p role="alert" className="type-meta text-neg-text">
          The robot check could not finish. Check your connection, then reload the page.
        </p>
      ) : null}
    </div>
  );
}
