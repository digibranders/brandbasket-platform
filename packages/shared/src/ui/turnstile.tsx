"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

/*
 * The Cloudflare Turnstile widget (https://developers.cloudflare.com/turnstile/), the browser half of the robot check
 * whose server half is src/server/turnstile.ts. Put <TurnstileWidget action="..."/> inside a <form>: it fills in the
 * form's `cf-turnstile-response` field, which the server then checks with `checkHuman`. A token works once, so a form
 * that stays on the page after a submission passes a changing `resetKey` (its action state) to fetch a fresh one.
 *
 * The page's site key comes from <TurnstileProvider>, set once in a layout that reads it on the server. Without a key
 * (Turnstile off on this deployment) the widget draws nothing and the form is sent as it always was.
 */

const SITE_KEY = createContext<string | null>(null);

export function TurnstileProvider({ siteKey, children }: { readonly siteKey: string | null; readonly children: ReactNode }): ReactElement {
  return <SITE_KEY.Provider value={siteKey}>{children}</SITE_KEY.Provider>;
}

interface TurnstileOptions {
  readonly sitekey: string;
  readonly action: string;
  readonly appearance: "always" | "execute" | "interaction-only";
  /** "flexible" fills the form's width (300px or more), so the box suits a phone screen. */
  readonly size: "normal" | "flexible" | "compact";
  readonly theme: "auto" | "light" | "dark";
  readonly "refresh-expired": "auto" | "manual" | "never";
  readonly callback: (token: string) => void;
  readonly "expired-callback": () => void;
  readonly "timeout-callback": () => void;
  /** Returning true tells Turnstile the error is handled; it keeps retrying on its own. */
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

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once for the page, however many widgets ask. A failed load can be tried again. */
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

/** Puts the token in the holder (or clears it) and tells the form, so its submit gate checks again. */
function holdToken(holder: HTMLInputElement | null, token: string): void {
  if (holder === null || holder.value === token) return;
  holder.value = token;
  holder.dispatchEvent(new Event("input", { bubbles: true }));
}

export function TurnstileWidget({ action, resetKey }: { readonly action: string; readonly resetKey?: unknown }): ReactElement | null {
  const siteKey = useContext(SITE_KEY);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  /** Holds the token while there is one: a required field with no name, so the submit gate waits for it. */
  const holder = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (siteKey === null) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || container.current === null) return;
        // Always drawn: Cloudflare's own box reads "Verifying" and then "Success", so the person can see the check
        // run and nothing about the page changes when it finishes. Hiding it (or clipping it off screen) can leave
        // a phone's browser holding the check back, and an invisible check cannot ask for a tap when it needs one.
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          appearance: "always",
          size: "flexible",
          theme: "auto",
          "refresh-expired": "auto",
          callback: (token) => {
            setFailed(false);
            holdToken(holder.current, token);
          },
          "expired-callback": () => holdToken(holder.current, ""),
          "timeout-callback": () => holdToken(holder.current, ""),
          "error-callback": () => {
            setFailed(true);
            holdToken(holder.current, "");
            return true;
          },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (widgetId.current === null) return;
    // A token works once: the one just sent is spent, so the form waits again for the fresh one.
    holdToken(holder.current, "");
    window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (siteKey === null) return null;
  return (
    <>
      {/* The box is 65px tall, reserved up front so the form does not jump when Cloudflare draws it. */}
      <div ref={container} className="min-h-[65px]" />
      <input ref={holder} required tabIndex={-1} aria-hidden="true" autoComplete="off" defaultValue="" className="sr-only" />
      {failed ? (
        <p role="alert" className="text-sm text-accent-deep">
          The robot check could not finish. Check your connection, then reload the page.
        </p>
      ) : null}
    </>
  );
}
