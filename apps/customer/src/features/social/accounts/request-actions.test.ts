import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteChannelLinkRequest, upsertChannelLinkRequest } from "@brandbasket/db";
import { requireService } from "@/lib/guards";
import { cancelChannelRequestAction, requestChannelAction } from "./actions";
import { tellRequesterAboutLink, tellTeamAboutLink } from "./request-alert";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireService: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({}), getStaffDb: () => ({}) }));
vi.mock("@brandbasket/db", () => ({ withTenantScope: (_db: unknown, _scope: unknown, work: (tx: unknown) => unknown) => work({}), upsertChannelLinkRequest: vi.fn(), deleteChannelLinkRequest: vi.fn() }));
vi.mock("../brand", () => ({ brandOf: async () => ({ externalId: "b1", name: "Om Sweets" }) }));
vi.mock("./client", () => ({ ensureWorkspace: vi.fn(), fetchConnectLink: vi.fn(), returnUrl: () => "https://app.example.com/social" }));
vi.mock("./request-alert", () => ({ tellTeamAboutLink: vi.fn(), tellRequesterAboutLink: vi.fn() }));

const owner = { role: "owner", businessId: "b1", businessName: "Om Sweets", tenant: { businessId: "b1", userId: "u1" }, user: { id: "u1", name: "Asha", email: "asha@om.test" } };

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MANUAL_CONNECT", "instagram,facebook");
  vi.mocked(requireService).mockResolvedValue(owner as never);
});

describe("requestChannelAction", () => {
  it("saves the cleaned link for the brand and tells the team", async () => {
    vi.mocked(upsertChannelLinkRequest).mockResolvedValue({ id: "r1" } as never);
    expect(await requestChannelAction("instagram", "https://www.instagram.com/acme_foods/?utm_source=x")).toEqual({ ok: true, data: { handle: "acme_foods" } });
    expect(upsertChannelLinkRequest).toHaveBeenCalledWith({}, { businessId: "b1", brandId: "b1", network: "instagram", url: "https://www.instagram.com/acme_foods", handle: "acme_foods", adminProfileUrl: null, userId: "u1" });
    expect(tellTeamAboutLink).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", network: "instagram", handle: "acme_foods", businessName: "Om Sweets" }));
    expect(tellRequesterAboutLink).toHaveBeenCalledWith("r1", "received");
  });

  it("asks for the person's own profile on the networks that need it, and saves it", async () => {
    vi.stubEnv("PERSON_PROFILE_NETWORKS", "facebook");
    vi.mocked(upsertChannelLinkRequest).mockResolvedValue({ id: "r2" } as never);
    expect(await requestChannelAction("facebook", "facebook.com/acmefoods")).toMatchObject({ ok: false, message: expect.stringContaining("your own Facebook profile") });
    expect(upsertChannelLinkRequest).not.toHaveBeenCalled();
    expect(await requestChannelAction("facebook", "facebook.com/acmefoods", "https://www.facebook.com/asha.mehta?x=1")).toEqual({ ok: true, data: { handle: "acmefoods" } });
    expect(upsertChannelLinkRequest).toHaveBeenCalledWith({}, expect.objectContaining({ network: "facebook", adminProfileUrl: "https://www.facebook.com/asha.mehta" }));
  });

  it("does not ask Instagram for the person's profile until the setting says so, then requires it", async () => {
    vi.mocked(upsertChannelLinkRequest).mockResolvedValue({ id: "r3" } as never);
    vi.stubEnv("PERSON_PROFILE_NETWORKS", "facebook");
    expect(await requestChannelAction("instagram", "instagram.com/acme_foods")).toMatchObject({ ok: true });
    vi.stubEnv("PERSON_PROFILE_NETWORKS", "instagram,facebook");
    expect(await requestChannelAction("instagram", "instagram.com/acme_foods")).toMatchObject({ ok: false });
    expect(await requestChannelAction("instagram", "instagram.com/acme_foods", "facebook.com/asha.mehta")).toMatchObject({ ok: true });
  });

  it("refuses a link for a business that keeps the direct Connect buttons", async () => {
    vi.stubEnv("DIRECT_CONNECT_BUSINESSES", "x1, B1 ");
    expect(await requestChannelAction("instagram", "instagram.com/acme_foods")).toMatchObject({ ok: false });
    expect(upsertChannelLinkRequest).not.toHaveBeenCalled();
  });

  it("says what is wrong with a link that is not a profile, and saves nothing", async () => {
    const result = await requestChannelAction("instagram", "https://www.instagram.com/p/Cxyz123/");
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("not a profile") });
    expect(upsertChannelLinkRequest).not.toHaveBeenCalled();
  });

  it("refuses a network that still uses its Allow button", async () => {
    vi.stubEnv("MANUAL_CONNECT", "instagram");
    expect(await requestChannelAction("facebook", "facebook.com/acmefoods")).toMatchObject({ ok: false });
    expect(upsertChannelLinkRequest).not.toHaveBeenCalled();
  });

  it("tells her it is already with the team when the team has answered", async () => {
    vi.mocked(upsertChannelLinkRequest).mockResolvedValue(null);
    expect(await requestChannelAction("facebook", "facebook.com/acmefoods")).toMatchObject({ ok: false, message: expect.stringContaining("already with our team") });
    expect(tellTeamAboutLink).not.toHaveBeenCalled();
  });

  it("does nothing for a viewer", async () => {
    vi.mocked(requireService).mockResolvedValue({ ...owner, role: "viewer" } as never);
    expect(await requestChannelAction("instagram", "instagram.com/acme_foods")).toMatchObject({ ok: false });
    expect(upsertChannelLinkRequest).not.toHaveBeenCalled();
  });
});

describe("cancelChannelRequestAction", () => {
  it("takes back the brand's request for the network", async () => {
    vi.mocked(deleteChannelLinkRequest).mockResolvedValue(true);
    expect(await cancelChannelRequestAction("facebook")).toEqual({ ok: true });
    expect(deleteChannelLinkRequest).toHaveBeenCalledWith({}, "b1", "b1", "facebook");
  });
});
