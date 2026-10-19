import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findSiteSetting: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));

import { findSiteSetting } from "@brandbasket/db";
import { getSetupCallUrl } from "./setup-call-link";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("getSetupCallUrl", () => {
  it("is the link staff saved", async () => {
    vi.mocked(findSiteSetting).mockResolvedValue({ key: "setup_call_url", value: "https://calendly.com/brandbasket/setup", updatedByStaffId: null, updatedAt: new Date() });

    expect(await getSetupCallUrl()).toBe("https://calendly.com/brandbasket/setup");
    expect(findSiteSetting).toHaveBeenCalledWith({ name: "staff-db" }, "setup_call_url");
  });

  it("is nothing when no link was saved", async () => {
    vi.mocked(findSiteSetting).mockResolvedValue(null);

    expect(await getSetupCallUrl()).toBeNull();
  });

  it("is nothing for a saved value that is not a safe address, whatever put it there", async () => {
    for (const value of ["javascript:alert(1)", "http://calendly.com/x", "not a link"]) {
      vi.mocked(findSiteSetting).mockResolvedValue({ key: "setup_call_url", value, updatedByStaffId: null, updatedAt: new Date() });
      expect(await getSetupCallUrl()).toBeNull();
    }
  });

  it("is nothing, without throwing, when the setting cannot be read", async () => {
    vi.mocked(findSiteSetting).mockRejectedValue(new Error("connection lost"));

    expect(await getSetupCallUrl()).toBeNull();
  });
});
