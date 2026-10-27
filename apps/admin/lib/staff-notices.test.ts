import { describe, expect, it } from "vitest";
import { readStaffNotice, STAFF_NOTICES } from "./staff-notices";
import { ROLE_CAN, ROLE_LABELS, ROLE_ORDER } from "./staff-roles";

describe("staff notices", () => {
  it("reads only known notice codes from the address", () => {
    expect(readStaffNotice("invited")).toBe("invited");
    expect(readStaffNotice("last-admin")).toBe("last-admin");
    expect(readStaffNotice("anything")).toBeNull();
    expect(readStaffNotice(["invited"])).toBeNull();
    expect(readStaffNotice(undefined)).toBeNull();
  });

  it("marks problems as not ok and has words for each", () => {
    expect(STAFF_NOTICES.invited.ok).toBe(true);
    expect(STAFF_NOTICES["self-off"].ok).toBe(false);
    for (const notice of Object.values(STAFF_NOTICES)) expect(notice.text.length).toBeGreaterThan(0);
  });
});

describe("staff roles", () => {
  it("names every role, says what it can do, and lists them lowest first", () => {
    expect(ROLE_ORDER).toEqual(["support", "finance", "admin"]);
    expect(ROLE_LABELS.finance).toBe("Finance");
    expect(ROLE_CAN.admin).toBe("Everything");
  });
});
