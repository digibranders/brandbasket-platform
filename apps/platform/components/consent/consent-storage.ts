import { CONSENT_KEY, type ConsentRecord, decodeRecord, encodeRecord } from "@/lib/consent";

let cached: ConsentRecord | null | undefined;
const listeners = new Set<() => void>();

/** The saved choice for useSyncExternalStore; read once, then served from memory so the snapshot stays stable. */
export function readConsent(): ConsentRecord | null {
  if (cached === undefined) {
    try {
      cached = decodeRecord(window.localStorage.getItem(CONSENT_KEY), new Date());
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function saveConsent(measurement: boolean): void {
  const raw = encodeRecord(measurement, new Date());
  try {
    window.localStorage.setItem(CONSENT_KEY, raw);
  } catch {
    // Storage blocked (private mode, site data off): the choice still holds for this page view.
  }
  cached = decodeRecord(raw, new Date());
  listeners.forEach((listener) => listener());
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
