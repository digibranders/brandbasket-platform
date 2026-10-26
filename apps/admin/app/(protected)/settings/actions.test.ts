import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffCan } from "@/lib/server/staff-role";
import { removeTeamsUrl, saveTeamsUrl, testTeamsUrl } from "@/lib/server/teams-admin";
import { removeTeamsWebhookAction, saveTeamsWebhookAction, testTeamsWebhookAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/settings-admin", () => ({ saveSetupCallUrl: vi.fn() }));
vi.mock("@/lib/server/teams-admin", () => ({ saveTeamsUrl: vi.fn(), removeTeamsUrl: vi.fn(), testTeamsUrl: vi.fn() }));

const ADDRESS = "https://prod-12.centralindia.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=hush";
const STAFF = { user: { id: "staff-1", email: "owner@example.com" } } as unknown as Awaited<ReturnType<typeof requireStaffCan>>;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffCan).mockResolvedValue(STAFF);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("saveTeamsWebhookAction", () => {
  it("asks for the integrations capability first, then saves the address for that channel and says so", async () => {
    await expect(saveTeamsWebhookAction(form({ teamsDestination: "support", teamsUrl: ADDRESS }))).rejects.toThrow("redirect:/settings?saved=teams-saved#teams");
    expect(requireStaffCan).toHaveBeenCalledWith("integrations");
    expect(saveTeamsUrl).toHaveBeenCalledWith({ destination: "support", url: ADDRESS, staffUserId: "staff-1" }, expect.any(Date));
  });

  it("saves nothing for an address that is not a Teams webhook, and names the problem", async () => {
    await expect(saveTeamsWebhookAction(form({ teamsDestination: "support", teamsUrl: "https://example.com/hook" }))).rejects.toThrow("redirect:/settings?saved=teams-not-a-teams-address#teams");
    await expect(saveTeamsWebhookAction(form({ teamsDestination: "support", teamsUrl: "http://prod-1.logic.azure.com/x" }))).rejects.toThrow("teams-not-secure");
    expect(saveTeamsUrl).not.toHaveBeenCalled();
  });

  it("treats an empty box as nothing pasted rather than as removing the address", async () => {
    await expect(saveTeamsWebhookAction(form({ teamsDestination: "system", teamsUrl: "  " }))).rejects.toThrow("teams-nothing-pasted");
    expect(saveTeamsUrl).not.toHaveBeenCalled();
    expect(removeTeamsUrl).not.toHaveBeenCalled();
  });

  it("refuses a channel that does not exist, whatever the form posted", async () => {
    await expect(saveTeamsWebhookAction(form({ teamsDestination: "billing", teamsUrl: ADDRESS }))).rejects.toThrow("redirect:/settings");
    await expect(saveTeamsWebhookAction(form({ teamsUrl: ADDRESS }))).rejects.toThrow("redirect:/settings");
    expect(saveTeamsUrl).not.toHaveBeenCalled();
  });
});

describe("removeTeamsWebhookAction", () => {
  it("removes the address for that channel only", async () => {
    await expect(removeTeamsWebhookAction(form({ teamsDestination: "enquiries" }))).rejects.toThrow("redirect:/settings?saved=teams-removed#teams");
    expect(requireStaffCan).toHaveBeenCalledWith("integrations");
    expect(removeTeamsUrl).toHaveBeenCalledWith("enquiries");
  });
});

describe("testTeamsWebhookAction", () => {
  it.each(["sent", "failed", "unset", "unreadable"] as const)("sends a test as the staff member and reports %s", async (result) => {
    vi.mocked(testTeamsUrl).mockResolvedValue(result);
    await expect(testTeamsWebhookAction(form({ teamsDestination: "system" }))).rejects.toThrow(`redirect:/settings?saved=teams-test-${result}#teams`);
    expect(testTeamsUrl).toHaveBeenCalledWith("system", { email: "owner@example.com" }, expect.any(Date));
  });
});
