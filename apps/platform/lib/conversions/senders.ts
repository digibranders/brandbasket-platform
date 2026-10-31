import type { Ga4Config, MetaConfig } from "./config";
import type { Ga4Body } from "./ga4";
import type { MetaBody } from "./meta";

const TIMEOUT_MS = 8_000;

type Fetcher = typeof fetch;

/**
 * Both senders throw an error that names the service and the status and nothing else: the address holds the GA4 secret and
 * the answer can echo the Meta token, and the message is what ends up in conversion_events and in logs.
 */

/** Sends a purchase to GA4's Measurement Protocol. The secret has to be in the address; Google offers no other place for it. */
export async function sendGa4(config: Ga4Config, body: Ga4Body, fetcher: Fetcher = fetch): Promise<void> {
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`;
  let response: Response;
  try {
    response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error("GA4 request failed");
  }
  if (!response.ok) throw new Error(`GA4 answered ${String(response.status)}`);
}

/** Sends a purchase to Meta's Conversions API, with the token in the body so it is never in an address or a log line. */
export async function sendMeta(config: MetaConfig, body: MetaBody, fetcher: Fetcher = fetch): Promise<void> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.pixelId)}/events`;
  const payload = { ...body, access_token: config.accessToken, ...(config.testEventCode === null ? {} : { test_event_code: config.testEventCode }) };
  let response: Response;
  try {
    response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error("Meta request failed");
  }
  if (!response.ok) throw new Error(`Meta answered ${String(response.status)}`);
}
