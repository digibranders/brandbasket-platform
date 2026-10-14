import { getOwnedDirectoryBusiness } from "@/lib/server/owner-business";
import { handleOwnerReplyRequest } from "@/lib/server/owner-reply-request";
import { changeReply, postReply, takeDownReply } from "@/lib/server/owner-replies";
import { websiteOrigin } from "@/lib/server/website-origin";

/**
 * `POST` / `PATCH` / `DELETE /api/directory-owner/replies` — a business's verified owner answers a review from its page on
 * the website, changes their answer, or takes it down. Called by the owner's own browser from the website, with the
 * dashboard's session cookie: only the website's origin is let in (see lib/server/owner-reply-request.ts).
 */
function handle(request: Request): Promise<Response> {
  return handleOwnerReplyRequest(request, {
    websiteOrigin: websiteOrigin(),
    getOwner: getOwnedDirectoryBusiness,
    post: postReply,
    change: changeReply,
    takeDown: takeDownReply,
    now: () => new Date(),
  });
}

export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
