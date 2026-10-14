import "server-only";
import type { SupportStorage } from "./support-storage";
export interface ServableSupportAttachment {
  readonly storageKey: string;
  readonly mimeType: string;
}
export const SUPPORT_ATTACHMENT_HEADERS = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;
export function supportAttachmentUnavailable(status = 404): Response {
  return new Response(null, { status, headers: SUPPORT_ATTACHMENT_HEADERS });
}
/** find must enforce attached state, ticket ownership and public message visibility, or authenticated staff access. */
export async function serveSupportAttachment(
  deps: {
    readonly find: (id: string) => Promise<ServableSupportAttachment | null>;
    readonly storage: SupportStorage;
  },
  attachmentId: string,
): Promise<Response> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      attachmentId,
    )
  )
    return supportAttachmentUnavailable();
  const row = await deps.find(attachmentId);
  if (row === null || row.mimeType !== "image/webp")
    return supportAttachmentUnavailable();
  const bytes = await deps.storage.get(row.storageKey);
  if (bytes === null) return supportAttachmentUnavailable();
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...SUPPORT_ATTACHMENT_HEADERS,
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
    },
  });
}
