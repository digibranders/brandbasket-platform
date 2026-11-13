export interface Ga4Config {
  readonly measurementId: string;
  readonly apiSecret: string;
}

export interface MetaConfig {
  readonly pixelId: string;
  readonly accessToken: string;
  /** Meta retires each Graph API version after about two years, so it is a setting, not a constant in the code. */
  readonly graphVersion: string;
  /** While set, Meta shows the events in Events Manager's Test Events tab instead of counting them. */
  readonly testEventCode: string | null;
}

export interface ConversionConfig {
  readonly ga4: Ga4Config | null;
  readonly meta: MetaConfig | null;
}

const DEFAULT_GRAPH_VERSION = "v23.0";

function read(env: Readonly<Record<string, string | undefined>>, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/**
 * Where a first payment is reported (plan 59), from the server environment. A destination is on only when both of its keys are
 * set; a malformed id throws, naming the variable, so a typo is found when the first payment is reported and in `env:check`,
 * not months later in an empty report.
 */
export function conversionConfig(env: Readonly<Record<string, string | undefined>> = process.env): ConversionConfig {
  const measurementId = read(env, "GA4_MEASUREMENT_ID");
  const apiSecret = read(env, "GA4_API_SECRET");
  const pixelId = read(env, "META_PIXEL_ID");
  const accessToken = read(env, "META_CAPI_TOKEN");
  const graphVersion = read(env, "META_GRAPH_VERSION") ?? DEFAULT_GRAPH_VERSION;
  if (measurementId !== null && !/^G-[A-Z0-9]{4,20}$/.test(measurementId)) throw new Error(`GA4_MEASUREMENT_ID is not a measurement id (G-XXXXXXXX): "${measurementId}"`);
  if (pixelId !== null && !/^\d{5,20}$/.test(pixelId)) throw new Error(`META_PIXEL_ID is not a pixel id (digits only): "${pixelId}"`);
  if (!/^v\d{1,2}\.\d$/.test(graphVersion)) throw new Error(`META_GRAPH_VERSION is not a Graph API version (v23.0): "${graphVersion}"`);
  return {
    ga4: measurementId !== null && apiSecret !== null ? { measurementId, apiSecret } : null,
    meta: pixelId !== null && accessToken !== null ? { pixelId, accessToken, graphVersion, testEventCode: read(env, "META_TEST_EVENT_CODE") } : null,
  };
}
