import { takeDownDirectoryVideo } from "@fynix/db";
import { getVimeoClient, type VimeoClient } from "@fynix/shared/server/vimeo";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { takeDownVideoAction } from "./video-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@fynix/db", () => ({ takeDownDirectoryVideo: vi.fn() }));
vi.mock("@fynix/shared/server/vimeo", () => ({ getVimeoClient: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => DB) }));

const DB = { name: "staff-db" };
const VIDEO = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" } } as unknown as GrantedStaff;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const deleteVideo = vi.fn<(vimeoId: string) => Promise<void>>();
const CLIENT = { deleteVideo };

const POSTED = { id: VIDEO, show: "videos", page: "2" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getVimeoClient).mockReturnValue(CLIENT as unknown as VimeoClient);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("takeDownVideoAction", () => {
  it("is refused for a session that is not staff's, before anything is read or written", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(takeDownVideoAction(form(POSTED))).rejects.toThrow("NEXT_REDIRECT");
    expect(takeDownDirectoryVideo).not.toHaveBeenCalled();
    expect(deleteVideo).not.toHaveBeenCalled();
  });

  it("throws on a form that does not name a valid video", async () => {
    await expect(takeDownVideoAction(form({ ...POSTED, id: "nope" }))).rejects.toThrow("valid id");
    expect(takeDownDirectoryVideo).not.toHaveBeenCalled();
    expect(deleteVideo).not.toHaveBeenCalled();
  });

  it("takes the video down, deletes every Vimeo video only after that, then refreshes the same page of the list", async () => {
    const order: string[] = [];
    vi.mocked(takeDownDirectoryVideo).mockImplementation(async () => {
      order.push("taken down");
      return ["111", "222"];
    });
    deleteVideo.mockImplementation(async (vimeoId) => {
      order.push(`deleted ${vimeoId}`);
    });
    vi.mocked(revalidatePath).mockImplementation(() => {
      order.push("revalidated");
    });

    await takeDownVideoAction(form(POSTED));

    expect(takeDownDirectoryVideo).toHaveBeenCalledWith(DB, VIDEO, expect.any(Date));
    expect(deleteVideo).toHaveBeenCalledTimes(2);
    expect(order).toEqual(["taken down", "deleted 111", "deleted 222", "revalidated"]);
    expect(redirect).toHaveBeenCalledWith("/ads?show=videos&page=2&done=video_removed");
  });

  it("logs a Vimeo failure instead of throwing, still deletes the other videos, and still finishes", async () => {
    vi.mocked(takeDownDirectoryVideo).mockResolvedValue(["111", "222"]);
    deleteVideo.mockRejectedValueOnce(new Error("Vimeo is down")).mockResolvedValueOnce(undefined);

    await takeDownVideoAction(form(POSTED));

    expect(deleteVideo).toHaveBeenCalledWith("111");
    expect(deleteVideo).toHaveBeenCalledWith("222");
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Vimeo"), expect.objectContaining({ vimeoId: "111" }));
    expect(redirect).toHaveBeenCalledWith("/ads?show=videos&page=2&done=video_removed");
  });

  it("warns, and still finishes, when no Vimeo client is configured", async () => {
    vi.mocked(takeDownDirectoryVideo).mockResolvedValue(["111"]);
    vi.mocked(getVimeoClient).mockReturnValue(null);

    await takeDownVideoAction(form(POSTED));

    expect(deleteVideo).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("VIMEO_ACCESS_TOKEN"), expect.anything());
    expect(redirect).toHaveBeenCalledWith("/ads?show=videos&page=2&done=video_removed");
  });

  it("says nothing changed, and calls Vimeo not at all, for a video that is already gone", async () => {
    vi.mocked(takeDownDirectoryVideo).mockResolvedValue([]);
    await takeDownVideoAction(form({ ...POSTED, page: "1" }));
    expect(getVimeoClient).not.toHaveBeenCalled();
    expect(deleteVideo).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/ads?show=videos&done=unchanged");
  });
});
