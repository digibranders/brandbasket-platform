import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "./limits";

export type UploadResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Also what Vercel answers, as plain text, for a body over its own limit before our route runs. */
const PAYLOAD_TOO_LARGE = 413;
const UNREACHABLE_MESSAGE = "We couldn't upload that file. Check your connection and try again.";
const UNEXPECTED_MESSAGE = "Something went wrong with that upload. Reload the page and try again.";

function errorMessageOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  return typeof body.error === "string" && body.error !== "" ? body.error : null;
}

/** Sends one image as the raw request body and turns the answer into a message ready to show. */
export async function sendImage(url: string, body: Blob, headers: Record<string, string>): Promise<UploadResult> {
  if (body.size > MAX_UPLOAD_BYTES) return { ok: false, message: TOO_LARGE_MESSAGE };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "Content-Type": body.type === "" ? "application/octet-stream" : body.type, ...headers },
    });
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }

  if (response.ok) return { ok: true };
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // A platform, proxy or crash page instead of our JSON; the fallbacks below cover it.
  }
  const fallback = response.status === PAYLOAD_TOO_LARGE ? TOO_LARGE_MESSAGE : UNEXPECTED_MESSAGE;
  return { ok: false, message: errorMessageOf(parsed) ?? fallback };
}
