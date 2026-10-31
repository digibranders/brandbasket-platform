import { consentSignals, isUntrackedPath, measurementCookies } from "@/lib/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Starts Google Tag Manager once measurement is allowed, then passes every later choice to it. Consent Mode v2 defaults to
 * denied before gtm.js loads, so container tags only fire for granted purposes. Never starts on a page whose address
 * carries a one-time secret (lib/consent.ts, isUntrackedPath).
 */
export function syncTagManager(gtmId: string, measurement: boolean): void {
  const signals = consentSignals(measurement);
  if (!window.gtag) {
    if (!measurement || isUntrackedPath(window.location.pathname)) return;
    window.dataLayer = window.dataLayer ?? [];
    // gtag reads Arguments objects from the dataLayer, not arrays, so this cannot use rest parameters.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
    window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", functionality_storage: "denied", personalization_storage: "denied", security_storage: "granted" });
    window.gtag("consent", "update", signals);
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.append(script);
  } else {
    window.gtag("consent", "update", signals);
  }
  window.dataLayer?.push({ event: "bb_consent", consent_measurement: measurement });
}

/** Deletes the measurement cookies on this host and its parent domain, where the tags set them. */
export function clearMeasurementCookies(): void {
  const names = document.cookie.split(";").map((pair) => pair.split("=")[0]?.trim() ?? "").filter(Boolean);
  const host = window.location.hostname;
  const domains = ["", host, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of measurementCookies(names)) {
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
  }
}
