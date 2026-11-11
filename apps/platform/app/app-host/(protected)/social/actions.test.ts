import { approveDeliverables, DeliverableError, listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBillingAccess } from "@/lib/server/billing";
import { connectLink, createPost, deletePost, ensureWorkspace, loadChannels, movePost, sendPostNow, SocialAutoError, socialAutoSettings, startSiteJob, updatePost } from "@/lib/server/social-auto";
import { approvePostsAction, changeWrittenPostTimeAction, connectChannelAction, createPostAction, deletePostAction, movePostAction, sendPostNowAction, startSiteJobAction, updatePostAction } from "./actions";

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
vi.mock("@/lib/server/social-auto", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/social-auto")>()), socialAutoSettings: vi.fn(), ensureWorkspace: vi.fn(), connectLink: vi.fn(), loadChannels: vi.fn(), createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn(), sendPostNow: vi.fn(), movePost: vi.fn(), startSiteJob: vi.fn() }));
vi.mock("@/lib/server/social-brand", () => ({ socialBrand: async (tenant: { businessId: string; businessName: string }) => ({ externalId: tenant.businessId, name: tenant.businessName, view: null }) }));

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
  vi.mocked(startSiteJob).mockResolvedValue({ job: { id: "job_1", kind: "write", state: "queued", createdAt: "2026-11-11T10:00:00Z" }, created: true });
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
    const values: Record<string, string | string[]> = { day: farDay(), time: "14:30", caption: "Fresh sourdough.", pictureId: PICTURE, channel: ["instagram:1"], ...extra };
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
    ["a day that has gone", { day: "2020-01-01" }, "Choose a day from"],
    ["a time that is not a time", { time: "soon" }, "Choose a time, like 14:30."],
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
    const values: Record<string, string | string[]> = { postId: POST_ID, ownDay: farDay(), ownTime: "10:00", day: farDay(), time: "14:30", caption: "New words.", channel: ["instagram:1"], ...extra };
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
    expect(updatePost).toHaveBeenCalledWith(expect.anything(), "business-1", POST_ID, { day: farDay(), time: "14:30", caption: "New words.", channels: ["instagram:1"], variants: { instagram: null, facebook: null, linkedin: null, google: null } });
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
    expect(await sendPostNowAction(only())).toEqual({ status: "partial", message: "The post could not be sent to Test Member. We will try again at the next run." });
  });

  it("passes on social-auto's words, and says only that it could not for any other fault", async () => {
    vi.mocked(sendPostNow).mockRejectedValue(new SocialAutoError("refused", 409, "this post has already gone out"));
    expect(await sendPostNowAction(only())).toEqual({ status: "error", message: "this post has already gone out" });
    vi.mocked(sendPostNow).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await sendPostNowAction(only())).toEqual({ status: "error", message: "The post could not be sent. Try again." });
  });
});

describe("movePostAction", () => {
  const POST_ID = "manual-0123456789ab";
  const farDay = (): string => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const drop = (extra: Record<string, string> = {}): FormData => {
    const data = new FormData();
    for (const [name, value] of Object.entries({ postId: POST_ID, day: farDay(), time: "11:15", ...extra })) data.set(name, value);
    return data;
  };

  it("is refused for a visitor who is signed out, and for a business that did not buy the service", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(movePostAction(drop())).rejects.toThrow("redirect:/login");
    vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["search"] as never);
    await expect(movePostAction(drop())).rejects.toThrow("notFound");
    expect(movePost).not.toHaveBeenCalled();
  });

  it("moves the session's business's post to the new day and time, and refreshes the page", async () => {
    vi.mocked(movePost).mockResolvedValue({} as never);
    expect(await movePostAction(drop())).toEqual({ status: "saved" });
    expect(movePost).toHaveBeenCalledWith(expect.anything(), "business-1", POST_ID, { day: farDay(), time: "11:15" });
    expect(revalidatePath).toHaveBeenCalledWith("/social");
  });

  it.each([
    ["a post id that is not a customer's", { postId: "2026-11-04-abc" }, "could not be found"],
    ["a day that has gone", { day: "2020-01-01" }, "Choose a day"],
    ["a time that is not a time", { time: "soon" }, "already passed"],
  ])("refuses %s and moves nothing", async (_name, change, message) => {
    const result = await movePostAction(drop(change));
    expect(result).toEqual({ status: "error", message: expect.stringContaining(message) });
    expect(movePost).not.toHaveBeenCalled();
  });

  it("moves a post we wrote from its details window, and refuses an id that could be a path", async () => {
    vi.mocked(movePost).mockResolvedValue({} as never);
    expect(await changeWrittenPostTimeAction(drop({ postId: "w01-d1" }))).toEqual({ status: "saved" });
    expect(movePost).toHaveBeenCalledWith(expect.anything(), "business-1", "w01-d1", { day: farDay(), time: "11:15" });
    vi.mocked(movePost).mockClear();
    expect(await changeWrittenPostTimeAction(drop({ postId: "../x" }))).toEqual({ status: "error", message: expect.stringContaining("could not be found") });
    expect(movePost).not.toHaveBeenCalled();
  });

  it("uses its own sentence for a code it knows, and the service's sentence for one it does not", async () => {
    vi.mocked(movePost).mockRejectedValue(new SocialAutoError("refused", 400, "that time has already passed. Choose a later time.", "TIME_PASSED"));
    expect(await movePostAction(drop())).toEqual({ status: "error", message: "That time has already passed. Choose a later time." });
    vi.mocked(movePost).mockRejectedValue(new SocialAutoError("refused", 409, "another post is already planned for that day", "CONFLICT"));
    expect(await movePostAction(drop())).toEqual({ status: "error", message: "another post is already planned for that day" });
    vi.mocked(movePost).mockRejectedValue(new SocialAutoError("refused", 409, "x", "POST_NOT_EDITABLE"));
    expect(await movePostAction(drop())).toEqual({ status: "error", message: expect.stringContaining("already going out") });
  });

  it("passes on social-auto's words, and says only that it could not for any other fault", async () => {
    vi.mocked(movePost).mockRejectedValue(new SocialAutoError("refused", 409, "this post is already due or sent, so it can no longer be changed"));
    expect(await movePostAction(drop())).toEqual({ status: "error", message: "this post is already due or sent, so it can no longer be changed" });
    vi.mocked(movePost).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await movePostAction(drop())).toEqual({ status: "error", message: "The post could not be moved. Try again." });
  });
});

describe("startSiteJobAction", () => {
  function site(fields: Record<string, string | readonly string[]>): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) for (const one of typeof value === "string" ? [value] : value) data.append(name, one);
    return data;
  }

  it("starts a job for the session's business and person, with only the networks that were ticked", async () => {
    expect(await startSiteJobAction(site({ site: " omsweets.in ", mode: "site", network: ["instagram", "linkedin"] }))).toEqual({ status: "saved" });
    expect(ensureWorkspace).toHaveBeenCalledWith(expect.anything(), { id: "business-1", name: "Sai Dental Care" });
    expect(startSiteJob).toHaveBeenCalledWith(expect.anything(), "business-1", { site: "omsweets.in", page: false, networks: ["instagram", "linkedin"] }, "brandbasket:user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/social");
    await startSiteJobAction(site({ site: "omsweets.in/diwali", mode: "page", network: "facebook" }));
    expect(startSiteJob).toHaveBeenLastCalledWith(expect.anything(), "business-1", { site: "omsweets.in/diwali", page: true, networks: ["facebook"] }, "brandbasket:user-1");
  });

  it("is not found for a business that has not bought Social media", async () => {
    vi.mocked(listBoughtSetupServices).mockResolvedValue([] as never);
    await expect(startSiteJobAction(site({ site: "omsweets.in", network: "instagram" }))).rejects.toThrow("notFound");
    expect(startSiteJob).not.toHaveBeenCalled();
  });

  it("asks for an address and a network before it calls social-auto, and ignores a network it does not know", async () => {
    expect(await startSiteJobAction(site({ site: "   ", network: "instagram" }))).toMatchObject({ status: "error", message: "Write your website address." });
    expect(await startSiteJobAction(site({ site: "omsweets.in" }))).toMatchObject({ status: "error", message: "Choose at least one network to write for." });
    expect(await startSiteJobAction(site({ site: "omsweets.in", network: "myspace" }))).toMatchObject({ status: "error" });
    expect(startSiteJob).not.toHaveBeenCalled();
  });

  it("says in the customer's own words why social-auto refused, and keeps the code out of the page", async () => {
    vi.mocked(startSiteJob).mockRejectedValue(new SocialAutoError("refused", 400, "different website", "SITE_MISMATCH"));
    const mismatch = await startSiteJobAction(site({ site: "other.in", network: "instagram" }));
    expect(mismatch).toMatchObject({ status: "error", message: expect.stringMatching(/website you gave us first/) });
    expect(JSON.stringify(mismatch)).not.toContain("SITE_MISMATCH");
    vi.mocked(startSiteJob).mockRejectedValue(new SocialAutoError("refused", 429, "limit", "JOB_LIMIT_REACHED"));
    expect(await startSiteJobAction(site({ site: "omsweets.in", network: "instagram" }))).toMatchObject({ message: expect.stringMatching(/tomorrow/) });
    vi.mocked(startSiteJob).mockRejectedValue(new Error("boom"));
    expect(await startSiteJobAction(site({ site: "omsweets.in", network: "instagram" }))).toMatchObject({ status: "error", message: "That did not work. Try again in a few minutes." });
  });
});
