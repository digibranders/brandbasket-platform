import { describe, expect, it } from "vitest";
import {
  AD_RETURN_PARAM,
  PRESS_RELEASE_RETURN_VALUE,
  chargeKindOfReturn,
  chargeNoticeHref,
  chargeReturnHref,
  readChargeNotice,
  type ChargeNotice,
} from "./charge-notices";

describe("readChargeNotice", () => {
  it("reads the notices it knows", () => {
    expect(readChargeNotice("paid")).toBe("paid");
    expect(readChargeNotice("not-open")).toBe("not-open");
  });

  it("ignores anything else, including inherited object keys", () => {
    expect(readChargeNotice(undefined)).toBeNull();
    expect(readChargeNotice(["paid"])).toBeNull();
    expect(readChargeNotice("toString")).toBeNull();
    expect(readChargeNotice("nope")).toBeNull();
  });
});

describe("chargeNoticeHref", () => {
  it("points at the Billing page", () => {
    expect(chargeNoticeHref("failed")).toBe("/billing?charge=failed");
  });
});

describe("chargeReturnHref", () => {
  it("returns an ordinary charge to Billing", () => {
    expect(chargeReturnHref("charge", "paid")).toBe("/billing?charge=paid");
  });

  it("returns a won ad spot to Advertise", () => {
    expect(chargeReturnHref("directory_ad", "failed")).toBe("/advertise?notice=pay-failed");
  });

  it("returns a plan upgrade or a press release to Billing like any other charge, for every outcome", () => {
    const notices: readonly ChargeNotice[] = ["paid", "processing", "failed", "duplicate", "review", "stale", "not-open"];
    for (const kind of ["plan_upgrade", "press_release"]) {
      for (const notice of notices) expect(chargeReturnHref(kind, notice), `${kind} ${notice}`).toBe(`/billing?charge=${notice}`);
    }
  });
});

describe("chargeKindOfReturn", () => {
  it("reads the mark a pay page puts on its provider return address", () => {
    expect(AD_RETURN_PARAM).toBe("for");
    expect(chargeKindOfReturn("ad")).toBe("directory_ad");
    expect(chargeKindOfReturn("upgrade")).toBe("plan_upgrade");
    expect(chargeKindOfReturn(PRESS_RELEASE_RETURN_VALUE)).toBe("press_release");
  });

  it("treats anything else as an ordinary charge", () => {
    expect(chargeKindOfReturn(null)).toBe("charge");
    expect(chargeKindOfReturn("nope")).toBe("charge");
  });
});
