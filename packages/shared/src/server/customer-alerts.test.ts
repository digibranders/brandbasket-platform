import type { Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announceCustomerEvent } from "./customer-alerts";
import { sendTeamsAlert } from "./teams-alerts";

vi.mock("server-only", () => ({}));
vi.mock("./teams-alerts", () => ({ sendTeamsAlert: vi.fn(async () => undefined) }));
const queries = vi.hoisted(() => ({ findBusinessAlertDetails: vi.fn() }));
vi.mock("@brandbasket/db", () => queries);

const DB = {} as Database;
const SECRET = "a-secret-of-at-least-thirty-two-characters!!";

beforeEach(() => {
  vi.clearAllMocks();
  queries.findBusinessAlertDetails.mockResolvedValue({
    business: { id: "biz-1", name: "Rao Clinic", websiteUrl: null, stateCode: "mh" },
    owner: { name: "Asha Rao", email: "asha@example.com", phone: "+919820011111" },
  });
});

describe("announceCustomerEvent", () => {
  it("posts to the Customers channel with the customer and a link to the client", async () => {
    await announceCustomerEvent(DB, SECRET, { businessId: "biz-1", event: "signed_up" }, "https://console.example");
    expect(sendTeamsAlert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTeamsAlert).mock.calls[0]?.[2]).toBe("customers");
    const card = JSON.stringify(vi.mocked(sendTeamsAlert).mock.calls[0]?.[3]);
    for (const part of ["New sign-up: Rao Clinic", "asha@example.com", "https://console.example/clients/biz-1"]) expect(card).toContain(part);
  });

  it("sends nothing for a business that is not there, and never throws", async () => {
    queries.findBusinessAlertDetails.mockResolvedValueOnce(null);
    await announceCustomerEvent(DB, SECRET, { businessId: "gone", event: "signed_up" }, "https://console.example");
    expect(sendTeamsAlert).not.toHaveBeenCalled();

    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queries.findBusinessAlertDetails.mockRejectedValueOnce(new Error("connection lost for asha@example.com"));
    await expect(announceCustomerEvent(DB, SECRET, { businessId: "biz-1", event: "setup_sent" }, "https://console.example")).resolves.toBeUndefined();
    expect(JSON.stringify(logged.mock.calls)).not.toContain("asha@example.com");
    logged.mockRestore();
  });
});
