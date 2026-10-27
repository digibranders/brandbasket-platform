import { describe, expect, it } from "vitest";
import {
  AD_RETURN_PARAM,
  PRESS_RELEASE_RETURN_VALUE,
  ADD_ON_RETURN_VALUE,
  CHANGE_RETURN_VALUE,
  CHANGE_TICKET_PARAM,
  changeTicketOfReturn,
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

  it("returns an add-on's charge to Services, for every outcome", () => {
    const notices: readonly ChargeNotice[] = ["paid", "processing", "failed", "duplicate", "review", "stale", "not-open"];
    for (const notice of notices) expect(chargeReturnHref("add_on", notice), notice).toBe(`/services?charge=${notice}`);
  });

  it("returns a change quote's charge to Requests, for every outcome", () => {
    const notices: readonly ChargeNotice[] = ["paid", "processing", "failed", "duplicate", "review", "stale", "not-open"];
    for (const notice of notices) expect(chargeReturnHref("change_hours", notice), notice).toBe(`/requests?charge=${notice}`);
  });

  it("returns a change quote's charge to its own request when the ticket is known, and ignores a ticket for any other kind", () => {
    const ticket = "0192f3c4-0000-7000-8000-000000000002";
    expect(chargeReturnHref("change_hours", "paid", ticket)).toBe(`/requests?open=${ticket}&charge=paid`);
    expect(chargeReturnHref("add_on", "paid", ticket)).toBe("/services?charge=paid");
    expect(chargeReturnHref("charge", "paid", ticket)).toBe("/billing?charge=paid");
  });

  it("returns a plan upgrade or a press release to Billing like any other charge, for every outcome", () => {
    const notices: readonly ChargeNotice[] = ["paid", "processing", "failed", "duplicate", "review", "stale", "not-open"];
    for (const kind of ["plan_upgrade", "press_release"]) {
      for (const notice of notices) expect(chargeReturnHref(kind, notice), `${kind} ${notice}`).toBe(`/billing?charge=${notice}`);
    }
  });
});

describe("changeTicketOfReturn", () => {
  it("reads the ticket a pay page puts on its provider return address, and nothing else", () => {
    expect(CHANGE_TICKET_PARAM).toBe("ticket");
    const ticket = "0192f3c4-0000-7000-8000-000000000002";
    expect(changeTicketOfReturn(ticket)).toBe(ticket);
    expect(changeTicketOfReturn(null)).toBeUndefined();
    expect(changeTicketOfReturn("nope")).toBeUndefined();
    expect(changeTicketOfReturn("/requests?open=x")).toBeUndefined();
  });
});

describe("chargeKindOfReturn", () => {
  it("reads the mark a pay page puts on its provider return address", () => {
    expect(AD_RETURN_PARAM).toBe("for");
    expect(chargeKindOfReturn("ad")).toBe("directory_ad");
    expect(chargeKindOfReturn("upgrade")).toBe("plan_upgrade");
    expect(chargeKindOfReturn(PRESS_RELEASE_RETURN_VALUE)).toBe("press_release");
    expect(chargeKindOfReturn(ADD_ON_RETURN_VALUE)).toBe("add_on");
    expect(chargeKindOfReturn(CHANGE_RETURN_VALUE)).toBe("change_hours");
  });

  it("treats anything else as an ordinary charge", () => {
    expect(chargeKindOfReturn(null)).toBe("charge");
    expect(chargeKindOfReturn("nope")).toBe("charge");
  });
});
