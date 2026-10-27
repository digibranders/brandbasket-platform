import {
  addActivityEvent,
  DeliverableError,
  deleteDeliverable,
  findDeliverableForStaff,
  insertDeliverable,
  moveDeliverable,
  removeMonthlyReport,
  updateDeliverableFields,
  upsertMonthlyReport,
} from "@brandbasket/db";
import { deleteMediaFiles, getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processPostPicture } from "@/lib/server/post-picture";
import { StaffAdPictureError } from "@/lib/server/staff-ad-picture";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import {
  addDeliverableAction,
  deleteDeliverableAction,
  moveDeliverableAction,
  removeReportAction,
  saveDeliverableAction,
  saveReportAction,
} from "./work-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    addActivityEvent: vi.fn(),
    deleteDeliverable: vi.fn(),
    findDeliverableForStaff: vi.fn(),
    insertDeliverable: vi.fn(),
    moveDeliverable: vi.fn(),
    removeMonthlyReport: vi.fn(),
    updateDeliverableFields: vi.fn(),
    upsertMonthlyReport: vi.fn(),
  };
});
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn(), deleteMediaFiles: vi.fn() }));
vi.mock("@/lib/server/post-picture", () => ({ processPostPicture: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const OTHER_BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a8999";
const ITEM = "01a0f71b-8402-7d48-a90a-207e8c8a8aaa";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const DB = { db: true } as never;
const NOW = new Date("2026-10-27T06:30:00Z");
const put = vi.fn();
const get = vi.fn();

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const picture = () => new File([new Uint8Array([1, 2, 3])], "post.webp", { type: "image/webp" });
const PROCESSED = { bytes: new Uint8Array([9, 9]), mimeType: "image/webp" as const, width: 1080, height: 1350, sha256: "abc" };

function row(over: Record<string, unknown> = {}): never {
  return {
    id: ITEM,
    businessId: BUSINESS,
    service: "social",
    kind: "post",
    title: "Diwali offer",
    caption: "Come in",
    dueOn: "2026-11-01",
    status: "planned",
    linkUrl: null,
    imageKey: null,
    ...over,
  } as never;
}

const POST = { businessId: BUSINESS, kind: "post", title: "Diwali offer", caption: "Come in", dueOn: "2026-11-01" };
const AUDIT = (action: string) => ({ staffUserId: "staff-1", action, targetType: "business", targetId: BUSINESS, businessId: BUSINESS });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(listBoughtServices).mockResolvedValue(["social", "search"]);
  vi.mocked(getMediaStorage).mockReturnValue({ put, get } as never);
  vi.mocked(processPostPicture).mockResolvedValue(PROCESSED);
  vi.mocked(insertDeliverable).mockResolvedValue(row());
  vi.mocked(findDeliverableForStaff).mockResolvedValue(row());
  vi.mocked(moveDeliverable).mockResolvedValue(row());
  vi.mocked(updateDeliverableFields).mockResolvedValue({ row: row(), replacedKey: null });
  vi.mocked(deleteDeliverable).mockResolvedValue({ imageKey: null });
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("every action", () => {
  const calls: readonly [string, (businessId: string) => Promise<void>][] = [
    ["add", (businessId) => addDeliverableAction(form({ ...POST, businessId }))],
    ["save", (businessId) => saveDeliverableAction(form({ ...POST, businessId, id: ITEM }))],
    ["move", (businessId) => moveDeliverableAction(form({ businessId, id: ITEM, move: "send" }))],
    ["delete", (businessId) => deleteDeliverableAction(form({ businessId, id: ITEM }))],
    ["report", (businessId) => saveReportAction(form({ businessId, service: "social", month: "2026-10", url: "https://x.example/r" }))],
    ["unreport", (businessId) => removeReportAction(form({ businessId, service: "social", month: "2026-10-01" }))],
  ];

  it.each(calls)("%s is refused for a session that is not staff's, before anything is read", async (_name, call) => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call(BUSINESS)).rejects.toThrow("NEXT_REDIRECT");
    expect(getStaffDb).not.toHaveBeenCalled();
    expect(listBoughtServices).not.toHaveBeenCalled();
  });

  it.each(calls)("%s throws on a business id that is not an id", async (_name, call) => {
    await expect(call("x")).rejects.toThrow("must be a valid id");
    expect(listBoughtServices).not.toHaveBeenCalled();
  });

  it("lets an audit log failure propagate and does not redirect", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log down"));
    await expect(addDeliverableAction(form(POST))).rejects.toThrow("log down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("addDeliverableAction", () => {
  it("stores the picture under deliverables/{id}/display, inserts it, logs and returns to the section", async () => {
    await expect(addDeliverableAction(form({ ...POST, picture: picture() }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?work=added#work`);
    const input = vi.mocked(insertDeliverable).mock.calls[0]?.[1];
    expect(input?.businessId).toBe(BUSINESS);
    expect(input?.kind).toBe("post");
    expect(input?.title).toBe("Diwali offer");
    expect(input?.dueOn).toBe("2026-11-01");
    expect(input?.staffId).toBe("staff-1");
    expect(input?.picture).toEqual({ id: input?.id, key: `deliverables/${input?.id}/display`, mimeType: "image/webp", bytes: 2, width: 1080, height: 1350, sha256: "abc" });
    expect(put).toHaveBeenCalledWith(`deliverables/${input?.id}/display`, PROCESSED.bytes, "image/webp");
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("deliverable.add"));
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("adds a post with no picture and a page without touching storage", async () => {
    await expect(addDeliverableAction(form(POST))).rejects.toThrow("?work=added");
    expect(vi.mocked(insertDeliverable).mock.calls[0]?.[1].picture).toBeNull();
    await expect(addDeliverableAction(form({ businessId: BUSINESS, kind: "page", title: "Home page", dueOn: "", picture: picture() }))).rejects.toThrow("?work=added");
    expect(vi.mocked(insertDeliverable).mock.calls[1]?.[1]).toMatchObject({ kind: "page", dueOn: "2026-10-27", picture: null });
    expect(put).not.toHaveBeenCalled();
  });

  it("deletes the file when the insert throws", async () => {
    vi.mocked(insertDeliverable).mockRejectedValue(new Error("db down"));
    await expect(addDeliverableAction(form({ ...POST, picture: picture() }))).rejects.toThrow("db down");
    const key = put.mock.calls[0]?.[0] as string;
    expect(deleteMediaFiles).toHaveBeenCalledWith({ put, get }, [key]);
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("redirects with bad-picture and inserts nothing when the picture cannot be read", async () => {
    vi.mocked(processPostPicture).mockRejectedValue(new StaffAdPictureError("nope"));
    await expect(addDeliverableAction(form({ ...POST, picture: picture() }))).rejects.toThrow("?work=bad-picture#work");
    expect(insertDeliverable).not.toHaveBeenCalled();
  });

  it("redirects with invalid for a bad form and writes nothing", async () => {
    await expect(addDeliverableAction(form({ ...POST, title: "x" }))).rejects.toThrow("?work=invalid#work");
    expect(insertDeliverable).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("redirects with not-bought when the kind's service is not on the plan", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    await expect(addDeliverableAction(form({ ...POST, picture: picture() }))).rejects.toThrow("?work=not-bought#work");
    expect(listBoughtServices).toHaveBeenCalledWith(DB, BUSINESS);
    expect(put).not.toHaveBeenCalled();
    expect(insertDeliverable).not.toHaveBeenCalled();
  });
});

describe("saveDeliverableAction", () => {
  const SAVE = { ...POST, id: ITEM, title: "New title" };

  it("updates one deliverable of this business and logs", async () => {
    await expect(saveDeliverableAction(form(SAVE))).rejects.toThrow(`redirect:/clients/${BUSINESS}?work=saved#work`);
    expect(findDeliverableForStaff).toHaveBeenCalledWith(DB, ITEM);
    expect(updateDeliverableFields).toHaveBeenCalledWith(DB, { id: ITEM, businessId: BUSINESS, title: "New title", caption: "Come in", dueOn: "2026-11-01", linkUrl: null, picture: undefined, now: NOW });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("deliverable.save"));
  });

  it.each(["approved", "published"])("refuses a %s post with notice locked and changes nothing", async (status) => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status }));
    await expect(saveDeliverableAction(form({ ...SAVE, picture: picture() }))).rejects.toThrow("?work=locked#work");
    expect(put).not.toHaveBeenCalled();
    expect(updateDeliverableFields).not.toHaveBeenCalled();
  });

  it("maps the database's refusal to locked and removes a new file nothing used", async () => {
    vi.mocked(updateDeliverableFields).mockRejectedValue(new DeliverableError("wrong_state", "no"));
    await expect(saveDeliverableAction(form({ ...SAVE, picture: picture() }))).rejects.toThrow("?work=locked#work");
    expect(deleteMediaFiles).toHaveBeenCalledWith({ put, get }, [`deliverables/${ITEM}/display`]);
  });

  it("stores a replacement under the same key and deletes the old file only when the key differs", async () => {
    vi.mocked(updateDeliverableFields).mockResolvedValue({ row: row(), replacedKey: "deliverables/old/display" });
    await expect(saveDeliverableAction(form({ ...SAVE, picture: picture() }))).rejects.toThrow("?work=saved");
    expect(put).toHaveBeenCalledWith(`deliverables/${ITEM}/display`, PROCESSED.bytes, "image/webp");
    expect(vi.mocked(updateDeliverableFields).mock.calls[0]?.[1].picture).toMatchObject({ id: ITEM, key: `deliverables/${ITEM}/display` });
    expect(deleteMediaFiles).toHaveBeenCalledWith({ put, get }, ["deliverables/old/display"]);
  });

  it("puts the old picture back when a replacement cannot be saved", async () => {
    const key = `deliverables/${ITEM}/display`;
    const old = { bytes: new Uint8Array([7, 7, 7]), contentType: "image/webp" };
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ imageKey: key }));
    get.mockResolvedValue(old);
    vi.mocked(updateDeliverableFields).mockRejectedValue(new DeliverableError("wrong_state", "no"));
    await expect(saveDeliverableAction(form({ ...SAVE, picture: picture() }))).rejects.toThrow("?work=locked#work");
    expect(get).toHaveBeenCalledWith(key);
    expect(put).toHaveBeenLastCalledWith(key, old.bytes, old.contentType);
    expect(deleteMediaFiles).not.toHaveBeenCalled();
  });

  it("does not read the old picture when no new one was sent", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ imageKey: `deliverables/${ITEM}/display` }));
    await expect(saveDeliverableAction(form(SAVE))).rejects.toThrow("?work=saved");
    expect(get).not.toHaveBeenCalled();
  });

  it("does not delete anything when the picture was replaced under the same key", async () => {
    await expect(saveDeliverableAction(form({ ...SAVE, picture: picture() }))).rejects.toThrow("?work=saved");
    expect(deleteMediaFiles).not.toHaveBeenCalled();
  });

  it("refuses an item that belongs to another business as invalid", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ businessId: OTHER_BUSINESS }));
    await expect(saveDeliverableAction(form(SAVE))).rejects.toThrow("?work=invalid#work");
    expect(updateDeliverableFields).not.toHaveBeenCalled();
  });

  it("refuses a service not bought", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    await expect(saveDeliverableAction(form(SAVE))).rejects.toThrow("?work=not-bought#work");
    expect(updateDeliverableFields).not.toHaveBeenCalled();
  });
});

describe("moveDeliverableAction", () => {
  const move = (move: string, extra: Record<string, string> = {}) => moveDeliverableAction(form({ businessId: BUSINESS, id: ITEM, move, ...extra }));

  it("sends a ready planned post for approval", async () => {
    await expect(move("send")).rejects.toThrow(`redirect:/clients/${BUSINESS}?work=moved#work`);
    expect(moveDeliverable).toHaveBeenCalledWith(DB, { id: ITEM, businessId: BUSINESS, to: "awaiting_approval", now: NOW });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("deliverable.send"));
    expect(addActivityEvent).not.toHaveBeenCalled();
  });

  it("will not send a post with no caption and no picture, or a past date", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ caption: null }));
    await expect(move("send")).rejects.toThrow("?work=not-ready#work");
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ dueOn: "2026-10-01" }));
    await expect(move("send")).rejects.toThrow("?work=not-ready#work");
    expect(moveDeliverable).not.toHaveBeenCalled();
  });

  it("will not send a post that is not planned, or a page", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "approved" }));
    await expect(move("send")).rejects.toThrow("?work=wrong-state#work");
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ kind: "page", service: "search" }));
    await expect(move("send")).rejects.toThrow("?work=wrong-state#work");
    expect(moveDeliverable).not.toHaveBeenCalled();
  });

  it("takes an awaiting post back to planned and an approved one back to awaiting", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "awaiting_approval" }));
    await expect(move("pull")).rejects.toThrow("?work=moved");
    expect(vi.mocked(moveDeliverable).mock.calls[0]?.[1].to).toBe("planned");
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "approved" }));
    await expect(move("pull")).rejects.toThrow("?work=moved");
    expect(vi.mocked(moveDeliverable).mock.calls[1]?.[1].to).toBe("awaiting_approval");
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("deliverable.pull"));
  });

  it("will not take back a planned or published post", async () => {
    await expect(move("pull")).rejects.toThrow("?work=wrong-state");
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "published" }));
    await expect(move("pull")).rejects.toThrow("?work=wrong-state");
    expect(moveDeliverable).not.toHaveBeenCalled();
  });

  it("publishes an approved post with an optional link and writes the What we did line", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "approved" }));
    await expect(move("publish", { linkUrl: "https://instagram.com/p/1" })).rejects.toThrow("?work=moved");
    expect(moveDeliverable).toHaveBeenCalledWith(DB, { id: ITEM, businessId: BUSINESS, to: "published", linkUrl: "https://instagram.com/p/1", now: NOW });
    expect(addActivityEvent).toHaveBeenCalledWith(DB, { businessId: BUSINESS, service: "social", title: "Published your post: Diwali offer", occurredAt: NOW, staffId: "staff-1" });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("deliverable.publish"));
  });

  it("keeps the link already on the row when the box is empty", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "approved" }));
    await expect(move("publish")).rejects.toThrow("?work=moved");
    expect(vi.mocked(moveDeliverable).mock.calls[0]?.[1]).not.toHaveProperty("linkUrl");
  });

  it("will not publish a post the customer has not approved", async () => {
    await expect(move("publish")).rejects.toThrow("?work=wrong-state");
    expect(moveDeliverable).not.toHaveBeenCalled();
    expect(addActivityEvent).not.toHaveBeenCalled();
  });

  it("marks a page done only with a link, and a listing without one", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ kind: "page", service: "search", title: "Home", caption: null }));
    await expect(move("publish")).rejects.toThrow("?work=invalid");
    await expect(move("publish", { linkUrl: "http://nope" })).rejects.toThrow("?work=invalid");
    expect(moveDeliverable).not.toHaveBeenCalled();
    await expect(move("publish", { linkUrl: "https://shop.example/home" })).rejects.toThrow("?work=moved");
    expect(addActivityEvent).toHaveBeenLastCalledWith(DB, expect.objectContaining({ service: "search", title: "Improved your page: Home" }));
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ kind: "listing", service: "search", title: "Maps", caption: null }));
    await expect(move("publish")).rejects.toThrow("?work=moved");
    expect(addActivityEvent).toHaveBeenLastCalledWith(DB, expect.objectContaining({ service: "search", title: "Fixed your listing: Maps" }));
  });

  it("truncates a long line to 140 characters", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "approved", title: "x".repeat(140) }));
    await expect(move("publish")).rejects.toThrow("?work=moved");
    const title = vi.mocked(addActivityEvent).mock.calls[0]?.[1].title ?? "";
    expect(title).toHaveLength(140);
    expect(title.startsWith("Published your post: xxx")).toBe(true);
  });

  it("maps the database's refusal to wrong-state and writes no line", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(row({ status: "approved" }));
    vi.mocked(moveDeliverable).mockRejectedValue(new DeliverableError("wrong_state", "no"));
    await expect(move("publish")).rejects.toThrow("?work=wrong-state");
    expect(addActivityEvent).not.toHaveBeenCalled();
  });

  it("refuses an unknown move and a service not bought", async () => {
    await expect(move("approve")).rejects.toThrow("?work=invalid");
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    await expect(move("send")).rejects.toThrow("?work=not-bought");
    expect(moveDeliverable).not.toHaveBeenCalled();
  });
});

describe("deleteDeliverableAction", () => {
  const del = () => deleteDeliverableAction(form({ businessId: BUSINESS, id: ITEM }));

  it("deletes a planned item and its file, then logs", async () => {
    vi.mocked(deleteDeliverable).mockResolvedValue({ imageKey: `deliverables/${ITEM}/display` });
    await expect(del()).rejects.toThrow(`redirect:/clients/${BUSINESS}?work=deleted#work`);
    expect(deleteDeliverable).toHaveBeenCalledWith(DB, { id: ITEM, businessId: BUSINESS });
    expect(deleteMediaFiles).toHaveBeenCalledWith({ put, get }, [`deliverables/${ITEM}/display`]);
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("deliverable.delete"));
  });

  it("refuses an item that is not planned", async () => {
    vi.mocked(deleteDeliverable).mockResolvedValue(null);
    await expect(del()).rejects.toThrow("?work=wrong-state#work");
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a service not bought and deletes nothing", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    await expect(del()).rejects.toThrow("?work=not-bought");
    expect(deleteDeliverable).not.toHaveBeenCalled();
  });
});

describe("reports", () => {
  const REPORT = { businessId: BUSINESS, service: "search", month: "2026-10", url: "https://reports.example/oct" };

  it("saves one report link for a bought service and month", async () => {
    await expect(saveReportAction(form(REPORT))).rejects.toThrow(`redirect:/clients/${BUSINESS}?work=report-saved#work`);
    expect(upsertMonthlyReport).toHaveBeenCalledWith(DB, { businessId: BUSINESS, service: "search", month: "2026-10-01", url: "https://reports.example/oct", staffId: "staff-1", now: NOW });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("report.save"));
  });

  it("refuses a bad link and a service not bought", async () => {
    await expect(saveReportAction(form({ ...REPORT, url: "ftp://x" }))).rejects.toThrow("?work=invalid");
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    await expect(saveReportAction(form(REPORT))).rejects.toThrow("?work=not-bought");
    expect(upsertMonthlyReport).not.toHaveBeenCalled();
  });

  it("removes a report link and logs it", async () => {
    vi.mocked(removeMonthlyReport).mockResolvedValue(true);
    await expect(removeReportAction(form({ businessId: BUSINESS, service: "search", month: "2026-10-01" }))).rejects.toThrow("?work=report-removed#work");
    expect(removeMonthlyReport).toHaveBeenCalledWith(DB, { businessId: BUSINESS, service: "search", month: "2026-10-01" });
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith(AUDIT("report.remove"));
  });

  it("does not log a removal that removed nothing", async () => {
    vi.mocked(removeMonthlyReport).mockResolvedValue(false);
    await expect(removeReportAction(form({ businessId: BUSINESS, service: "search", month: "2026-10-01" }))).rejects.toThrow("?work=report-removed");
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a malformed month on removal", async () => {
    await expect(removeReportAction(form({ businessId: BUSINESS, service: "search", month: "nope" }))).rejects.toThrow("?work=invalid");
    expect(removeMonthlyReport).not.toHaveBeenCalled();
  });
});
