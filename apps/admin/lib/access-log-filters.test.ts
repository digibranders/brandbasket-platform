import { describe, expect, it } from "vitest";
import { accessLogHref, parseAccessLogFilters } from "./access-log-filters";

describe("parseAccessLogFilters", () => {
  it("reads person, action, client, India dates and page", () => {
    const parsed = parseAccessLogFilters({
      person: "staff-rohit",
      action: "client.view",
      client: "0198f2c0-0000-7000-8000-0000000000aa",
      from: "2026-11-29",
      to: "2026-11-30",
      page: "2",
    });
    expect(parsed.filter).toEqual({
      staffUserId: "staff-rohit",
      action: "client.view",
      businessId: "0198f2c0-0000-7000-8000-0000000000aa",
      from: new Date("2026-11-28T18:30:00.000Z"),
      to: new Date("2026-11-30T18:30:00.000Z"),
    });
    expect(parsed.page).toBe(2);
  });

  it("drops anything malformed instead of failing", () => {
    const parsed = parseAccessLogFilters({ action: "not.a.real.action", client: "nope", from: "29/11/2026", page: "-3", person: ["a", "b"] });
    expect(parsed.filter).toEqual({});
    expect(parsed.page).toBe(0);
  });

  it("builds the link for another page, keeping the filters", () => {
    const parsed = parseAccessLogFilters({ action: "lead.view" });
    expect(accessLogHref(parsed.values, 1)).toBe("/access-log?action=lead.view&page=1");
    expect(accessLogHref(parsed.values, 0)).toBe("/access-log?action=lead.view");
  });
});
