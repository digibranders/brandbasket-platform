import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

import SupportRequest from "@/app/app-host/(support)/support/[ticketId]/page";
import MySupportRequests from "@/app/app-host/(support)/support/page";

const TICKET = "0192f3c4-0000-7000-8000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("the old support pages", () => {
  it("send the old list to Requests", () => {
    expect(() => MySupportRequests()).toThrow("redirect:/requests");
  });

  it("send an old ticket link to the same conversation in Requests", async () => {
    await expect(SupportRequest({ params: Promise.resolve({ ticketId: TICKET }) })).rejects.toThrow(`redirect:/requests?open=${TICKET}`);
  });

  it("do not follow an address that is not a ticket id", async () => {
    await expect(SupportRequest({ params: Promise.resolve({ ticketId: "../billing" }) })).rejects.toThrow("notFound");
  });
});
