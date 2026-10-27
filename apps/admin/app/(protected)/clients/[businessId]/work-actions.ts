"use server";

import { randomUUID } from "node:crypto";
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
  type Deliverable,
  type DeliverableStatus,
  type StoredPicture,
} from "@brandbasket/db";
import { canMoveDeliverable } from "@brandbasket/db/deliverable-states";
import { deliverablePictureKey } from "@brandbasket/shared/server/media-keys";
import { deleteMediaFiles, getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canSendForApproval, isHttpsAddress, parseDeliverableForm } from "@/lib/deliverable-form";
import { parseReportForm } from "@/lib/report-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { processPostPicture } from "@/lib/server/post-picture";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { StaffAdPictureError } from "@/lib/server/staff-ad-picture";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import type { WorkNotice } from "@/lib/work-notices";

const idSchema = z.uuid();
const MOVES = ["send", "pull", "publish"] as const;
const ACTIVITY_TITLE_MAX = 140;

const PUBLISHED_LINE = { post: "Published your post", page: "Improved your page", listing: "Fixed your listing" } as const;

function readId(formData: FormData, name: "id" | "businessId"): string {
  const parsed = idSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error(`The work's ${name === "id" ? "item" : "business"} must be a valid id.`);
  return parsed.data;
}

function readFields(formData: FormData): Record<string, string> {
  const text: Record<string, string> = {};
  for (const [name, value] of formData.entries()) if (typeof value === "string") text[name] = value;
  return text;
}

function finish(businessId: string, notice: WorkNotice): never {
  revalidatePath(`/clients/${businessId}`);
  redirect(`/clients/${businessId}?work=${notice}#work`);
}

/** Records the action, then returns to the section: a failed audit write surfaces instead of the redirect. */
async function logAndFinish(staffUserId: string, businessId: string, action: string, notice: WorkNotice): Promise<never> {
  await logStaffAccessOrThrow({ staffUserId, action, targetType: "business", targetId: businessId, businessId });
  return finish(businessId, notice);
}

/** The picture staff chose, made ready and stored under the deliverable's own key; null when none was sent. */
async function storePicture(formData: FormData, id: string): Promise<StoredPicture | null> {
  const file = formData.get("picture");
  if (!(file instanceof File) || file.size === 0) return null;
  const processed = await processPostPicture(new Uint8Array(await file.arrayBuffer()));
  const key = deliverablePictureKey(id);
  await getMediaStorage().put(key, processed.bytes, processed.mimeType);
  return { id, key, mimeType: processed.mimeType, bytes: processed.bytes.byteLength, width: processed.width, height: processed.height, sha256: processed.sha256 };
}

/** The item, only when it belongs to this business: the staff connection has no row-level security. */
async function loadOwned(businessId: string, id: string): Promise<Deliverable | null> {
  const row = await findDeliverableForStaff(getStaffDb(), id);
  return row !== null && row.businessId === businessId ? row : null;
}

/** Staff add a post, a page or a listing; a post may come with its picture. */
export async function addDeliverableAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const parsed = parseDeliverableForm(readFields(formData), new Date());
  if (!parsed.success) finish(businessId, "invalid");
  const { kind, service, title, caption, dueOn } = parsed.data;
  const db = getStaffDb();
  if (!(await listBoughtServices(db, businessId)).includes(service)) finish(businessId, "not-bought");

  const id = randomUUID();
  let picture: StoredPicture | null = null;
  if (kind === "post") {
    try {
      picture = await storePicture(formData, id);
    } catch (error) {
      if (!(error instanceof StaffAdPictureError)) throw error;
      finish(businessId, "bad-picture");
    }
  }
  try {
    await insertDeliverable(db, { id, businessId, kind, title, caption, dueOn, staffId: user.id, picture });
  } catch (error) {
    if (picture !== null) await deleteMediaFiles(getMediaStorage(), [picture.key]);
    throw error;
  }
  return logAndFinish(user.id, businessId, "deliverable.add", "added");
}

/** Staff change the words, the day and the picture of an item that is not yet approved. */
export async function saveDeliverableAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const id = readId(formData, "id");
  const row = await loadOwned(businessId, id);
  if (row === null) finish(businessId, "invalid");
  if (!(await listBoughtServices(getStaffDb(), businessId)).includes(row.service)) finish(businessId, "not-bought");
  if (row.status === "approved" || row.status === "published") finish(businessId, "locked");
  // The kind is the stored one: a form cannot turn a post into a page.
  const parsed = parseDeliverableForm({ ...readFields(formData), kind: row.kind }, new Date());
  if (!parsed.success) finish(businessId, "invalid");

  let picture: StoredPicture | null = null;
  if (row.kind === "post") {
    try {
      picture = await storePicture(formData, id);
    } catch (error) {
      if (!(error instanceof StaffAdPictureError)) throw error;
      finish(businessId, "bad-picture");
    }
  }
  // A first picture has no old file to fall back on, so it is removed again if the row is not saved.
  const dropNew = async (): Promise<void> => {
    if (picture !== null && row.imageKey === null) await deleteMediaFiles(getMediaStorage(), [picture.key]);
  };

  let saved: Awaited<ReturnType<typeof updateDeliverableFields>>;
  try {
    saved = await updateDeliverableFields(getStaffDb(), {
      id,
      businessId,
      title: parsed.data.title,
      caption: parsed.data.caption,
      dueOn: parsed.data.dueOn,
      linkUrl: formData.has("linkUrl") ? parsed.data.linkUrl : row.linkUrl,
      picture: picture ?? undefined,
      now: new Date(),
    });
  } catch (error) {
    await dropNew();
    if (error instanceof DeliverableError && error.code === "wrong_state") finish(businessId, "locked");
    throw error;
  }
  if (saved === null) {
    await dropNew();
    finish(businessId, "invalid");
  }
  if (saved.replacedKey !== null) await deleteMediaFiles(getMediaStorage(), [saved.replacedKey]);
  return logAndFinish(user.id, businessId, "deliverable.save", "saved");
}

/** Where `move` takes a row, or null when this kind of item in this state cannot make that move. */
function targetOf(move: (typeof MOVES)[number], row: Deliverable): DeliverableStatus | null {
  if (move === "publish") return row.status !== "published" && canMoveDeliverable(row.kind, row.status, "published") ? "published" : null;
  if (row.kind !== "post") return null;
  if (move === "send") return row.status === "planned" ? "awaiting_approval" : null;
  if (row.status === "awaiting_approval") return "planned";
  return row.status === "approved" ? "awaiting_approval" : null;
}

/** The "What we did" line a publish writes for the customer's Overview, within the line's 140 characters. */
function publishedLine(row: Deliverable): string {
  const line = `${PUBLISHED_LINE[row.kind]}: ${row.title}`;
  return line.length <= ACTIVITY_TITLE_MAX ? line : `${line.slice(0, ACTIVITY_TITLE_MAX - 1)}…`;
}

/** Staff send a post for approval, take it back, or mark an item published (and so write its line under What we did). */
export async function moveDeliverableAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const id = readId(formData, "id");
  const move = MOVES.find((candidate) => candidate === formData.get("move"));
  if (move === undefined) finish(businessId, "invalid");
  const db = getStaffDb();
  const row = await loadOwned(businessId, id);
  if (row === null) finish(businessId, "invalid");
  if (!(await listBoughtServices(db, businessId)).includes(row.service)) finish(businessId, "not-bought");

  const to = targetOf(move, row);
  if (to === null) finish(businessId, "wrong-state");
  const now = new Date();
  let linkUrl: string | undefined;
  if (move === "send" && canSendForApproval({ caption: row.caption, hasPicture: row.imageKey !== null, dueOn: row.dueOn }, now) !== null) {
    finish(businessId, "not-ready");
  }
  if (move === "publish") {
    const typed = String(formData.get("linkUrl") ?? "").trim();
    if (typed !== "" && !isHttpsAddress(typed)) finish(businessId, "invalid");
    if (typed === "" && row.kind === "page" && row.linkUrl === null) finish(businessId, "invalid");
    if (typed !== "") linkUrl = typed;
  }

  try {
    await moveDeliverable(db, { id, businessId, to, now, ...(linkUrl === undefined ? {} : { linkUrl }) });
  } catch (error) {
    if (error instanceof DeliverableError) finish(businessId, "wrong-state");
    throw error;
  }
  if (move === "publish") await addActivityEvent(db, { businessId, service: row.service, title: publishedLine(row), occurredAt: now, staffId: user.id });
  return logAndFinish(user.id, businessId, `deliverable.${move}`, "moved");
}

/** Staff delete an item that is still planned, and its picture file. */
export async function deleteDeliverableAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const id = readId(formData, "id");
  const row = await loadOwned(businessId, id);
  if (row === null) finish(businessId, "invalid");
  if (!(await listBoughtServices(getStaffDb(), businessId)).includes(row.service)) finish(businessId, "not-bought");
  const deleted = await deleteDeliverable(getStaffDb(), { id, businessId });
  if (deleted === null) finish(businessId, "wrong-state");
  if (deleted.imageKey !== null) await deleteMediaFiles(getMediaStorage(), [deleted.imageKey]);
  return logAndFinish(user.id, businessId, "deliverable.delete", "deleted");
}

/** Staff save the report link for a bought service and month; a second save for the same month replaces it. */
export async function saveReportAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const parsed = parseReportForm(readFields(formData), new Date());
  if (!parsed.success) finish(businessId, "invalid");
  const db = getStaffDb();
  if (!(await listBoughtServices(db, businessId)).includes(parsed.data.service)) finish(businessId, "not-bought");
  await upsertMonthlyReport(db, { businessId, ...parsed.data, staffId: user.id, now: new Date() });
  return logAndFinish(user.id, businessId, "report.save", "report-saved");
}

const removeReportSchema = z.object({ service: z.enum(["social", "search"]), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/) });

/** Staff remove one saved report link. */
export async function removeReportAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const parsed = removeReportSchema.safeParse(readFields(formData));
  if (!parsed.success) finish(businessId, "invalid");
  const db = getStaffDb();
  if (!(await listBoughtServices(db, businessId)).includes(parsed.data.service)) finish(businessId, "not-bought");
  const removed = await removeMonthlyReport(db, { businessId, ...parsed.data });
  if (!removed) finish(businessId, "report-removed");
  return logAndFinish(user.id, businessId, "report.remove", "report-removed");
}
