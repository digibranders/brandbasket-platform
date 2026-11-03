import { approveDeliverables, DeliverableError, listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBillingAccess } from "@/lib/server/billing";
import { connectLink, createPost, deletePost, ensureWorkspace, loadChannels, sendPostNow, SocialAutoError, socialAutoSettings, updatePost } from "@/lib/server/social-auto";
import { approvePostsAction, connectChannelAction, createPostAction, deletePostAction, sendPostNowAction, updatePostAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/billing", () => ({ requireBillingAccess: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), approveDeliverables: vi.fn(), listBoughtSetupServices: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("@/lib/server/social-auto", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/social-auto")>()), socialAutoSettings: vi.fn(), ensureWorkspace: vi.fn(), connectLink: vi.fn(), loadChannels: vi.fn(), createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn(), sendPostNow: vi.fn() }));

const A = "0192f3c4-0000-7000-8000-00000000000a";
const B = "0192f3c4-0000-7000-8000-00000000000b";
const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: null };
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" };

function form(ids: readonly string[], extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const id of ids) data.append("ids", id);
  for (const [name, value] of Object.entries(extra)) data.set(name, value);
  return data;
}

const manyIds = (count: number): string[] => Array.from({ length: count }, (_, index) => `0192f3c4-0000-7000-8000-${String(index).padStart(12, "0")}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ kind: "tx" } as never));
  vi.mocked(approveDeliverables).mockResolvedValue(2);
  vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"] as never);
  vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
  vi.mocked(ensureWorkspace).mockResolvedValue([]);
  vi.mocked(connectLink).mockResolvedValue("https://dash.example/api/instagram-start?invite=abc");
  vi.mocked(loadChannels).mockResolvedValue([{ id: "instagram:1", platform: "instagram", account: "acme", connectedAt: "2026-10-30T09:00:00Z" }, { id: "linkedin:3", platform: "linkedin", account: "Meera", connectedAt: "2026-10-30T09:00:00Z" }]);
  vi.mocked(createPost).mockResolvedValue({} as never);
});

describe("approvePostsAction", () => {
  it("is refused for a visitor who is signed out or has no active plan, and approves nothing", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(approvePostsAction(form([A, B]))).rejects.toThrow("redirect:/login");
    expect(approveDeliverables).not.toHaveBeenCalled();
  });

  it.each([
    ["no ids", []],
    ["an id that is not an id", [A, "nope"]],
    ["51 ids", manyIds(51)],
  ])("sends %s back as failed and approves nothing", async (_name, ids) => {
    await expect(approvePostsAction(form(ids))).rejects.toThrow("redirect:/social?notice=failed");
    expect(approveDeliverables).not.toHaveBeenCalled();
  });

  it("accepts 50 ids, and counts a repeated id once", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(50);
    await expect(approvePostsAction(form(manyIds(50)))).rejects.toThrow("redirect:/social?notice=approved");
    vi.mocked(approveDeliverables).mockResolvedValue(2);
    await expect(approvePostsAction(form([A, B, A]))).rejects.toThrow("redirect:/social?notice=approved");
    expect(approveDeliverables).toHaveBeenLastCalledWith({ kind: "tx" }, [A, B]);
  });

  it("says approved when every post was approved, and refreshes both pages", async () => {
    await expect(approvePostsAction(form([A, B]))).rejects.toThrow("redirect:/social?notice=approved");
    expect(approveDeliverables).toHaveBeenCalledWith({ kind: "tx" }, [A, B]);
    expect(revalidatePath).toHaveBeenCalledWith("/social");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("says changed when fewer were approved than were shown", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(1);
    await expect(approvePostsAction(form([A, B]))).rejects.toThrow("redirect:/social?notice=changed");
    expect(revalidatePath).toHaveBeenCalledWith("/social");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("is a not-found for posts the business does not have", async () => {
    vi.mocked(approveDeliverables).mockRejectedValue(new DeliverableError("not_found", "x"));
    await expect(approvePostsAction(form([A]))).rejects.toThrow("notFound");
  });

  it("logs and says failed for a fault it did not expect", async () => {
    vi.mocked(approveDeliverables).mockRejectedValue(new Error("db down"));
    await expect(approvePostsAction(form([A]))).rejects.toThrow("redirect:/social?notice=failed");
    expect(console.error).toHaveBeenCalledWith("[social] could not approve posts", expect.anything());
  });

  it("takes the business from the session, whatever the form says", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(1);
    await expect(approvePostsAction(form([A], { businessId: "business-2" }))).rejects.toThrow("redirect:/social?notice=approved");
    expect(withTenantScope).toHaveBeenCalledWith({ kind: "app-db" }, tenant, expect.any(Function));
  });
});

describe("connectChannelAction", () => {
  const channel = (name: string): FormData => form([], { channel: name });

  it("is refused for a visitor who is signed out or has no active plan", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(connectChannelAction(channel("instagram"))).rejects.toThrow("redirect:/login");
    expect(connectLink).not.toHaveBeenCalled();
  });

  it.each([["nothing", ""], ["a network we do not offer", "myspace"]])("sends %s back as failed and asks social-auto for nothing", async (_name, value) => {
    await expect(connectChannelAction(channel(value))).rejects.toThrow("redirect:/social?social=failed");
    expect(ensureWorkspace).not.toHaveBeenCalled();
  });

  it("is a not-found for a business that did not buy Social media", async () => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"] as never);
    await expect(connectChannelAction(channel("instagram"))).rejects.toThrow("notFound");
    expect(connectLink).not.toHaveBeenCalled();
  });

  it("makes the workspace for the session's business, asks for the link and sends the customer there", async () => {
    await expect(connectChannelAction(form([], { channel: "instagram", businessId: "business-2" }))).rejects.toThrow("redirect:https://dash.example/api/instagram-start?invite=abc");
    expect(ensureWorkspace).toHaveBeenCalledWith(expect.anything(), { id: "business-1", name: "Sai Dental Care" });
    expect(connectLink).toHaveBeenCalledWith(expect.anything(), "business-1", "instagram");
  });

  it("says connecting is not available when social-auto is not set up here", async () => {
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    await expect(connectChannelAction(channel("facebook"))).rejects.toThrow("redirect:/social?social=unavailable");
    expect(ensureWorkspace).not.toHaveBeenCalled();
  });

  it("logs and says failed, naming the network, when social-auto refuses", async () => {
    vi.mocked(connectLink).mockRejectedValue(new Error("social-auto refused the connect link (400)"));
    await expect(connectChannelAction(channel("linkedin"))).rejects.toThrow("redirect:/social?social=failed&channel=linkedin");
    expect(console.error).toHaveBeenCalledWith("[social] could not start a connection", expect.anything());
  });
});

describe("createPostAction", () => {
  const PICTURE = "a".repeat(32);
  const farDay = (): string => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const post = (extra: Record<string, string | string[]> = {}): FormData => {
    const data = new FormData();
    const values: Record<string, string | string[]> = { day: farDay(), caption: "Fresh sourdough.", pictureId: PICTURE, channel: ["instagram:1"], ...extra };
    for (const [name, value] of Object.entries(values)) for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
    return data;
  };

  it("is refused for a visitor who is signed out or has no active plan, and for a business that did not buy the service", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(createPostAction(post())).rejects.toThrow("redirect:/login");
    vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"] as never);
    await expect(createPostAction(post())).rejects.toThrow("notFound");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("makes the post for the session's business, to the accounts that are connected, and refreshes the page", async () => {
    const result = await createPostAction(post({ channel: ["instagram:1", "linkedin:3"], businessId: "business-2" }));
    expect(result).toEqual({ status: "saved" });
    expect(createPost).toHaveBeenCalledWith(expect.anything(), "business-1", expect.objectContaining({ caption: "Fresh sourdough.", pictureId: PICTURE, channels: ["instagram:1", "linkedin:3"] }));
    expect(revalidatePath).toHaveBeenCalledWith("/social");
  });

  it("refuses an account that is not connected for this business, even if the form names it", async () => {
    const result = await createPostAction(post({ channel: ["instagram:1", "facebook:999"] }));
    expect(result).toEqual({ status: "error", message: expect.stringContaining("not connected") });
    expect(createPost).not.toHaveBeenCalled();
  });

  it.each([
    ["no words", { caption: "  " }, "Write what the post should say."],
    ["no picture", { pictureId: "nope" }, "Add a picture first."],
    ["no account", { channel: [] }, "Choose at least one account."],
    ["a day that has gone", { day: "2020-01-01" }, "Posts go out at 10:00 AM."],
  ])("says what is wrong with %s and sends nothing", async (_name, change, message) => {
    const result = await createPostAction(post(change));
    expect(result).toEqual({ status: "error", message: expect.stringContaining(message) });
    expect(createPost).not.toHaveBeenCalled();
  });

  it("passes on what social-auto refused in its own words, and says only that it could not save for any other fault", async () => {
    vi.mocked(createPost).mockRejectedValue(new SocialAutoError("refused", 400, "caption is 2300 characters; Instagram allows 2200"));
    expect(await createPostAction(post())).toEqual({ status: "error", message: "caption is 2300 characters; Instagram allows 2200" });
    vi.mocked(createPost).mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1"));
    const result = await createPostAction(post());
    expect(result).toEqual({ status: "error", message: "The post could not be saved. Try again." });
    expect(console.error).toHaveBeenCalledWith("[social] could not schedule a post", expect.anything());
  });

  it("says posting is not available when social-auto is not set up here", async () => {
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    expect(await createPostAction(post())).toEqual({ status: "error", message: "Posting is not available just now. Try again later." });
    expect(createPost).not.toHaveBeenCalled();
  });
});

describe("updatePostAction and deletePostAction", () => {
  const POST_ID = "manual-0123456789ab";
  const farDay = (): string => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const change = (extra: Record<string, string | string[]> = {}): FormData => {
    const data = new FormData();
    const values: Record<string, string | string[]> = { postId: POST_ID, ownDay: farDay(), day: farDay(), caption: "New words.", channel: ["instagram:1"], ...extra };
    for (const [name, value] of Object.entries(values)) for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
    return data;
  };
  const remove = (postId: string = POST_ID): FormData => {
    const data = new FormData();
    data.set("postId", postId);
    return data;
  };

  it("is refused for a visitor who is signed out, and for a business that did not buy the service", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(updatePostAction(change())).rejects.toThrow("redirect:/login");
    await expect(deletePostAction(remove())).rejects.toThrow("redirect:/login");
    vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"] as never);
    await expect(updatePostAction(change())).rejects.toThrow("notFound");
    await expect(deletePostAction(remove())).rejects.toThrow("notFound");
    expect(updatePost).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("saves the changes for the session's business, with no new picture unless one was stored, and refreshes the page", async () => {
    expect(await updatePostAction(change({ businessId: "business-2" }))).toEqual({ status: "saved" });
    expect(updatePost).toHaveBeenCalledWith(expect.anything(), "business-1", POST_ID, { day: farDay(), caption: "New words.", channels: ["instagram:1"] });
    await updatePostAction(change({ pictureId: "b".repeat(32) }));
    expect(updatePost).toHaveBeenLastCalledWith(expect.anything(), "business-1", POST_ID, expect.objectContaining({ pictureId: "b".repeat(32) }));
    expect(revalidatePath).toHaveBeenCalledWith("/social");
  });

  it("refuses a post id that is not one the business made, and an account that is not connected", async () => {
    expect(await updatePostAction(change({ postId: "2026-11-04-abc" }))).toMatchObject({ status: "error" });
    expect(await updatePostAction(change({ channel: ["facebook:999"] }))).toEqual({ status: "error", message: expect.stringContaining("not connected") });
    expect(await deletePostAction(remove("../x"))).toMatchObject({ status: "error" });
    expect(updatePost).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("passes on social-auto's words, and says only that it could not for any other fault", async () => {
    vi.mocked(updatePost).mockRejectedValue(new SocialAutoError("refused", 409, "this post is already due or sent, so it can no longer be changed"));
    expect(await updatePostAction(change())).toEqual({ status: "error", message: "this post is already due or sent, so it can no longer be changed" });
    vi.mocked(updatePost).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await updatePostAction(change())).toEqual({ status: "error", message: "The changes could not be saved. Try again." });
    vi.mocked(deletePost).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await deletePostAction(remove())).toEqual({ status: "error", message: "The post could not be removed. Try again." });
  });

  it("removes the post for the session's business and refreshes the page", async () => {
    vi.mocked(deletePost).mockResolvedValue(undefined);
    expect(await deletePostAction(remove())).toEqual({ status: "saved" });
    expect(deletePost).toHaveBeenCalledWith(expect.anything(), "business-1", POST_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/social");
  });
});

describe("sendPostNowAction", () => {
  const POST_ID = "manual-0123456789ab";
  const only = (postId: string = POST_ID): FormData => {
    const data = new FormData();
    data.set("postId", postId);
    return data;
  };

  it("is refused for a visitor who is signed out, and for a business that did not buy the service", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(sendPostNowAction(only())).rejects.toThrow("redirect:/login");
    vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"] as never);
    await expect(sendPostNowAction(only())).rejects.toThrow("notFound");
    expect(sendPostNow).not.toHaveBeenCalled();
  });

  it("sends the session's business's post, refreshes the page, and refuses an id that is not a customer's post", async () => {
    vi.mocked(sendPostNow).mockResolvedValue({ failed: false, accounts: [] });
    expect(await sendPostNowAction(only())).toEqual({ status: "saved" });
    expect(sendPostNow).toHaveBeenCalledWith(expect.anything(), "business-1", POST_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/social");
    vi.mocked(sendPostNow).mockClear();
    expect(await sendPostNowAction(only("2026-11-04-abc"))).toMatchObject({ status: "error" });
    expect(sendPostNow).not.toHaveBeenCalled();
  });

  it("says which accounts refused it, and that the next run tries again", async () => {
    vi.mocked(sendPostNow).mockResolvedValue({ failed: true, accounts: ["Test Member"] });
    expect(await sendPostNowAction(only())).toEqual({ status: "partial", message: "The post could not be sent to Test Member. We will try again at the next 10:00 run." });
  });

  it("passes on social-auto's words, and says only that it could not for any other fault", async () => {
    vi.mocked(sendPostNow).mockRejectedValue(new SocialAutoError("refused", 409, "this post has already gone out"));
    expect(await sendPostNowAction(only())).toEqual({ status: "error", message: "this post has already gone out" });
    vi.mocked(sendPostNow).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await sendPostNowAction(only())).toEqual({ status: "error", message: "The post could not be sent. Try again." });
  });
});
