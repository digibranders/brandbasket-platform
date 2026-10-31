import { describe, expect, it } from "vitest";
import { conversionConfig } from "./config";

describe("conversionConfig", () => {
  it("has each destination only when both of its keys are set", () => {
    expect(conversionConfig({})).toEqual({ ga4: null, meta: null });
    expect(conversionConfig({ GA4_MEASUREMENT_ID: "G-ABC123", GA4_API_SECRET: "s3cret" }).ga4).toEqual({ measurementId: "G-ABC123", apiSecret: "s3cret" });
    expect(conversionConfig({ GA4_MEASUREMENT_ID: "G-ABC123" }).ga4).toBeNull();
    expect(conversionConfig({ META_PIXEL_ID: "123456789", META_CAPI_TOKEN: "tok" }).meta).toEqual({ pixelId: "123456789", accessToken: "tok", graphVersion: "v23.0", testEventCode: null });
    expect(conversionConfig({ META_CAPI_TOKEN: "tok" }).meta).toBeNull();
  });

  it("trims what it reads, treats blanks as unset, and takes a test code and a Graph version when given", () => {
    const config = conversionConfig({ GA4_MEASUREMENT_ID: " G-ABC123 ", GA4_API_SECRET: "  ", META_PIXEL_ID: "123456789", META_CAPI_TOKEN: "t", META_TEST_EVENT_CODE: " TEST123 ", META_GRAPH_VERSION: "v24.0" });
    expect(config.ga4).toBeNull();
    expect(config.meta).toEqual({ pixelId: "123456789", accessToken: "t", graphVersion: "v24.0", testEventCode: "TEST123" });
  });

  it("refuses a malformed id, so a typo fails loudly instead of sending to nowhere", () => {
    expect(() => conversionConfig({ GA4_MEASUREMENT_ID: "UA-1", GA4_API_SECRET: "s" })).toThrow(/GA4_MEASUREMENT_ID/);
    expect(() => conversionConfig({ META_PIXEL_ID: "abc", META_CAPI_TOKEN: "t" })).toThrow(/META_PIXEL_ID/);
    expect(() => conversionConfig({ META_PIXEL_ID: "123456789", META_CAPI_TOKEN: "t", META_GRAPH_VERSION: "latest" })).toThrow(/META_GRAPH_VERSION/);
  });
});
