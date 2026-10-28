import { describe, expect, it } from "vitest";
import { visitorHash } from "./visitor-hash";

const input = { salt: "salt-a", businessId: "b1", ip: "203.0.113.7", userAgent: "UA/1" };

describe("visitorHash", () => {
  it("is 32 hex characters and the same for the same visitor", () => {
    expect(visitorHash(input)).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorHash({ ...input })).toBe(visitorHash(input));
  });

  it("changes with the day's salt, so a visitor cannot be followed across days", () => {
    expect(visitorHash({ ...input, salt: "salt-b" })).not.toBe(visitorHash(input));
  });

  it("changes with the business, so a visitor cannot be followed across sites", () => {
    expect(visitorHash({ ...input, businessId: "b2" })).not.toBe(visitorHash(input));
  });

  it("changes with the address and the browser", () => {
    expect(visitorHash({ ...input, ip: "203.0.113.8" })).not.toBe(visitorHash(input));
    expect(visitorHash({ ...input, userAgent: "UA/2" })).not.toBe(visitorHash(input));
  });

  it("does not let two different inputs run together into one", () => {
    expect(visitorHash({ ...input, ip: "1.2.3", userAgent: "4 UA" })).not.toBe(visitorHash({ ...input, ip: "1.2.3 4", userAgent: "UA" }));
  });

  it("refuses an empty salt, which would make the hash linkable", () => {
    expect(() => visitorHash({ ...input, salt: "" })).toThrow(RangeError);
  });
});
