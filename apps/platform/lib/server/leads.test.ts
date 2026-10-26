import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, createLead, recordConsent, type Database } from "@brandbasket/db";
import type { LeadInput } from "@brandbasket/shared/lib/lead-form";
import { recordLead } from "./leads";
import { getPublicDb } from "./public-db";
import { alertTeams } from "./teams";

vi.mock("server-only", () => ({}));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn() }));
vi.mock("./teams", () => ({ alertTeams: vi.fn(async () => undefined) }));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://admin.localhost:3003" }) }));
vi.mock("@brandbasket/email", () => ({
  createAppEmailTransport: () => ({ send: vi.fn(async () => undefined) }),
  leadReceivedEmail: vi.fn(() => ({})),
}));
vi.mock("@brandbasket/db", () => ({
  consumeRateLimit: vi.fn(),
  createLead: vi.fn(),
  recordConsent: vi.fn(),
}));

const DB = {} as Database;
const LEAD: LeadInput = {
  name: "Asha Rao",
  businessName: "Smile Dental",
  email: "asha@example.com",
  phone: "+919876543210",
  businessType: "clinic",
  message: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPublicDb).mockReturnValue(DB);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(createLead).mockResolvedValue({ id: "lead-1" });
  vi.mocked(recordConsent).mockResolvedValue(undefined);
});

describe("recordLead", () => {
  it("keeps proof of the notice the visitor saw, against the lead it created", async () => {
    expect(await recordLead(LEAD, "203.0.113.9", "pre-dpdp")).toBe("recorded");
    expect(recordConsent).toHaveBeenCalledWith(DB, {
      subject: { type: "lead", ref: "lead-1" },
      purpose: "lead_contact",
      noticeVersion: "pre-dpdp",
      channel: "web",
    });
  });

  it("tells the Teams enquiries channel, with the lead's details and a link to it", async () => {
    expect(await recordLead({ ...LEAD, message: "Please call me." }, "203.0.113.9", null)).toBe("recorded");
    expect(alertTeams).toHaveBeenCalledTimes(1);
    const [destination, message] = vi.mocked(alertTeams).mock.calls[0] ?? [];
    expect(destination).toBe("enquiries");
    const text = JSON.stringify(message);
    expect(text).toContain("Smile Dental");
    expect(text).toContain("asha@example.com");
    expect(text).toContain("Please call me.");
    expect(text).toContain("http://admin.localhost:3003/leads/lead-1");
  });

  it("records no consent when the website sent no notice version", async () => {
    expect(await recordLead(LEAD, "203.0.113.9", null)).toBe("recorded");
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("still records the lead when the consent record cannot be written", async () => {
    vi.mocked(recordConsent).mockRejectedValue(new Error("connection reset"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await recordLead(LEAD, "203.0.113.9", "pre-dpdp")).toBe("recorded");
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("consent"), expect.anything());
    logged.mockRestore();
  });

  it("records no consent for a lead it refused", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await recordLead(LEAD, "203.0.113.9", "pre-dpdp")).toBe("limited");
    expect(createLead).not.toHaveBeenCalled();
    expect(recordConsent).not.toHaveBeenCalled();
  });
});
