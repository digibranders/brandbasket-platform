import { createAppEmailTransport, onboardingSentEmail } from "@brandbasket/email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyTeamOnboardingSent } from "./onboarding-alert";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ FIRST_PREVIEW_DUE_HOURS: 48 }));
vi.mock("@brandbasket/email", () => ({
  createAppEmailTransport: vi.fn(),
  emailTeamInboxDefault: () => "hello@fynix.digital",
  onboardingSentEmail: vi.fn(),
}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ name: "staff-db" })) }));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://admin.localhost:3001" }) }));

const send = vi.fn();
const message = { to: "t", subject: "s", template: "onboarding-sent", bodyText: "b", bodyHtml: "h" };
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  vi.resetAllMocks();
  consoleError.mockImplementation(() => undefined);
  vi.mocked(createAppEmailTransport).mockReturnValue({ send });
  vi.mocked(onboardingSentEmail).mockReturnValue(message);
  send.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.FYNIX_TEAM_EMAIL;
});

describe("notifyTeamOnboardingSent", () => {
  it("emails the team inbox with a link to the client's page", async () => {
    process.env.FYNIX_TEAM_EMAIL = "team@example.com";

    await notifyTeamOnboardingSent("business-1", "Riverside Plumbing");

    expect(onboardingSentEmail).toHaveBeenCalledWith({
      to: "team@example.com",
      businessName: "Riverside Plumbing",
      clientUrl: "http://admin.localhost:3001/clients/business-1",
      previewDueHours: 48,
    });
    expect(send).toHaveBeenCalledWith(message);
  });

  it("falls back to the default team inbox when none is configured", async () => {
    await notifyTeamOnboardingSent("business-1", "Riverside Plumbing");
    expect(onboardingSentEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "hello@fynix.digital" }));
  });

  it("logs and never throws when the email cannot be sent", async () => {
    send.mockRejectedValue(new Error("smtp down"));
    await expect(notifyTeamOnboardingSent("business-1", "Riverside Plumbing")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
