import { beforeEach, describe, expect, it, vi } from "vitest";

const record = vi.fn();
vi.mock("@brandbasket/db", () => ({ RETENTION_PERIODS: { enquiryMonths: 12 }, recordEnquiryContents: (...args: unknown[]) => record(...args) }));

import { acceptEnquiryContents, EnquiryContentsDisabledError, retainUntil } from "./enquiry-contents";

const DB = {} as never;
const ON = { ENQUIRY_FORM_CONTENTS_ENABLED: "1" };
const valid = { businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c", kind: "form" as const, name: " Asha ", email: "asha@example.com", receivedAt: new Date("2026-11-03T05:00:00.000Z"), sourceRef: "form:1" };

beforeEach(() => record.mockReset().mockResolvedValue(true));

describe("acceptEnquiryContents", () => {
  it("stores nothing and says why while the switch is off", async () => {
    await expect(acceptEnquiryContents(DB, valid, {})).rejects.toBeInstanceOf(EnquiryContentsDisabledError);
    expect(record).not.toHaveBeenCalled();
  });

  it("stores trimmed details with the retention date once the switch is on", async () => {
    expect(await acceptEnquiryContents(DB, valid, ON)).toBe(true);
    expect(record).toHaveBeenCalledWith(DB, expect.objectContaining({ name: "Asha", phone: null, retainUntil: new Date("2027-11-03T05:00:00.000Z") }));
  });

  it("refuses a row with no details, a bad email and an unknown kind, before the database", async () => {
    await expect(acceptEnquiryContents(DB, { ...valid, name: " ", email: null }, ON)).rejects.toThrow("needs a name");
    await expect(acceptEnquiryContents(DB, { ...valid, email: "not-an-email" }, ON)).rejects.toThrow();
    await expect(acceptEnquiryContents(DB, { ...valid, kind: "chat" as never }, ON)).rejects.toThrow();
    expect(record).not.toHaveBeenCalled();
  });

  it("counts the retention date from when the enquiry arrived", () => {
    expect(retainUntil(new Date("2026-01-31T00:00:00.000Z")).getUTCFullYear()).toBe(2027);
  });
});
