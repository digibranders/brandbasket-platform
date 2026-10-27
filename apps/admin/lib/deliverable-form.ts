import { z } from "zod";
import { DELIVERABLE_KINDS, serviceOfKind, type DeliverableKind, type DeliverableService } from "@brandbasket/db/deliverable-states";

/** The shape a post picture is stored at, and the most the browser posts (a server action's body is limited to 1 MB). */
export const POST_PICTURE_WIDTH = 1080;
export const POST_PICTURE_HEIGHT = 1350;
export const POST_PICTURE_MAX_BYTES = 900_000;

export type DeliverableParse =
  | {
      readonly success: true;
      readonly data: {
        readonly kind: DeliverableKind;
        readonly service: DeliverableService;
        readonly title: string;
        readonly caption: string | null;
        readonly dueOn: string;
        readonly linkUrl: string | null;
      };
    }
  | { readonly success: false; readonly message: string };

const TODAY_INDIA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** Today in India as `YYYY-MM-DD`. */
export function todayInIndia(now: Date): string {
  return TODAY_INDIA.format(now);
}

/** Whether `text` is a calendar date written `YYYY-MM-DD` (so 2026-02-30 is not). */
export function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

/** An `https://` address with no spaces, up to 500 characters: the same rule as the table's check. */
export const HTTPS_ADDRESS_MAX = 500;
export function isHttpsAddress(text: string): boolean {
  return text.length <= HTTPS_ADDRESS_MAX && /^https:\/\/\S+$/.test(text) && URL.canParse(text);
}

const TITLE_MESSAGE = "Give the title 3 to 140 characters.";
const CAPTION_MESSAGE = "Keep the caption to 600 characters or fewer.";
const LINK_MESSAGE = "The link must start with https:// and be 500 characters or fewer.";

const schema = z.object({
  kind: z.enum(DELIVERABLE_KINDS, "Choose a post, a page or a listing."),
  title: z.string().trim().min(3, TITLE_MESSAGE).max(140, TITLE_MESSAGE),
  caption: z.string().trim().max(600, CAPTION_MESSAGE),
  dueOn: z.string().trim(),
  linkUrl: z.string().trim().refine((value) => value === "" || isHttpsAddress(value), LINK_MESSAGE),
});

/**
 * Checks the form that adds a post, page or listing. The caption counts for posts only; a page or listing may leave the
 * date empty, which means today in India. The business is never here: it comes from the page's own validated id.
 */
export function parseDeliverableForm(fields: Readonly<Record<string, string>>, now: Date): DeliverableParse {
  const parsed = schema.safeParse({
    kind: fields["kind"],
    title: fields["title"] ?? "",
    caption: fields["caption"] ?? "",
    dueOn: fields["dueOn"] ?? "",
    linkUrl: fields["linkUrl"] ?? "",
  });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { kind, title, caption, dueOn, linkUrl } = parsed.data;
  const isPost = kind === "post";
  if (dueOn === "" && isPost) return { success: false, message: "Choose the date the post goes out." };
  if (dueOn !== "" && !isRealDate(dueOn)) return { success: false, message: "Choose a real date." };
  return {
    success: true,
    data: {
      kind,
      service: serviceOfKind(kind),
      title,
      caption: isPost && caption !== "" ? caption : null,
      dueOn: dueOn === "" ? todayInIndia(now) : dueOn,
      linkUrl: linkUrl === "" ? null : linkUrl,
    },
  };
}

/** The parts of a post that decide whether it can go to the customer. */
export interface SendablePost {
  readonly caption: string | null;
  readonly hasPicture: boolean;
  readonly dueOn: string | null;
}

/** Why a post cannot be sent for approval yet, in words staff can act on, or null when it can. */
export function canSendForApproval(post: SendablePost, now: Date): string | null {
  if ((post.caption ?? "").trim() === "" && !post.hasPicture) return "Add a caption or a picture before sending it for approval.";
  if (post.dueOn === null || !isRealDate(post.dueOn)) return "Set a due date before sending it for approval.";
  if (post.dueOn < todayInIndia(now)) return "The due date has passed. Choose today or a later date.";
  return null;
}
