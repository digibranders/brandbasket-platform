import {
  isVideoLengthAllowed,
  VIDEO_MAX_UPLOAD_BYTES,
  VIDEO_TOO_LARGE_MESSAGE,
  videoTooLongMessage,
  type VideoSlot,
} from "@brandbasket/shared/lib/directory/videos";

/*
 * The browser's side of a Premium member's video upload (docs/superpowers/specs/2026-10-07-business-videos-design.md).
 * Three steps, none of which sends the file through our server:
 *
 * 1. requestVideoUpload: tell our server the slot and the size; it makes an empty video on Vimeo and answers with the
 *    address to send the file to.
 * 2. sendFileToVimeo: send the file straight to that address, by Vimeo's resumable (tus) protocol, with progress.
 * 3. waitForVideo: ask our server every few seconds until Vimeo has prepared it and it is live, or it was given up.
 *
 * Browser only. The server checks everything again, because nothing here can be trusted.
 */

/** Under /api/ so the proxy never buffers a body; the routes themselves only answer on the app host. */
export const LISTING_VIDEO_ROUTE = "/api/listing-videos";

export type VideoUploadResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** `sending` while the file travels to Vimeo, `preparing` once it has arrived and Vimeo is getting it ready. */
export interface VideoUploadProgress {
  readonly phase: "sending" | "preparing";
  /** 0 to 1 of the file sent; 1 while preparing. */
  readonly fraction: number;
}

export type WaitState = "uploading" | "preparing";

const UNREACHABLE_MESSAGE = "We couldn't upload that video. Check your connection and try again.";
const UNEXPECTED_MESSAGE = "Something went wrong with that upload. Reload the page and try again.";
const NOT_A_VIDEO_MESSAGE = "That isn't a video. Please upload an MP4, MOV or WebM video.";
const EMPTY_MESSAGE = "That file is empty. Please choose a video.";
const TOO_SLOW_MESSAGE = "This is taking longer than usual. Reload the page in a few minutes: it will show once it's ready.";
/** Sending 50 MB over a slow phone connection can take minutes. */
const SEND_TIMEOUT_MS = 10 * 60 * 1000;
/** Vimeo prepares a 16-second clip in seconds to a minute or two. */
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
/** Reading a chosen file's length should be instant; if the browser cannot, the server decides. */
const METADATA_TIMEOUT_MS = 6000;

/** What is wrong with the chosen file, judged by what the browser knows without reading it; null when nothing is. */
export function videoFileProblem(file: { readonly size: number; readonly type: string }): string | null {
  if (file.size === 0) return EMPTY_MESSAGE;
  if (file.size > VIDEO_MAX_UPLOAD_BYTES) return VIDEO_TOO_LARGE_MESSAGE;
  // An empty type is allowed: some browsers do not report one, and Vimeo reads the file itself.
  if (file.type !== "" && !file.type.startsWith("video/")) return NOT_A_VIDEO_MESSAGE;
  return null;
}

/** What is wrong with the video's length; null when it is within the limit or the browser could not tell. */
export function videoLengthProblem(seconds: number | null): string | null {
  if (seconds === null || isVideoLengthAllowed(seconds)) return null;
  return seconds > 0 ? videoTooLongMessage(seconds) : null;
}

function errorMessageOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  return typeof body.error === "string" && body.error !== "" ? body.error : null;
}

/** The words to show for the server's answer to a refused request: its own, else one picked from the status. */
export function messageForVideoResponse(status: number, body: unknown): string {
  return errorMessageOf(body) ?? (status === 413 ? VIDEO_TOO_LARGE_MESSAGE : UNEXPECTED_MESSAGE);
}

async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // A proxy or crash page instead of our JSON; the fallbacks cover it.
    return null;
  }
}

/** Whether `value` is an https address on one of Vimeo's upload servers: the only place a file is ever sent. */
function isVimeoUploadAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "vimeo.com" || url.hostname.endsWith(".vimeo.com")) && url.username === "";
  } catch {
    return false;
  }
}

export interface RequestedVideo {
  readonly id: string;
  readonly slot: VideoSlot;
  readonly status: string;
}

export type VideoUploadRequestResult =
  | { readonly ok: true; readonly video: RequestedVideo; readonly uploadLink: string }
  | { readonly ok: false; readonly message: string };

/** Step 1. Asks our server for an upload address for this slot and size. */
export async function requestVideoUpload(
  slot: VideoSlot,
  size: number,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<VideoUploadRequestResult> {
  let response: Response;
  try {
    response = await fetchImpl(LISTING_VIDEO_ROUTE, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, size }),
    });
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }
  const body = await jsonOf(response);
  if (!response.ok) return { ok: false, message: messageForVideoResponse(response.status, body) };
  const answer = body as { video?: RequestedVideo; uploadLink?: unknown } | null;
  if (answer?.video === undefined || !isVimeoUploadAddress(answer.uploadLink)) return { ok: false, message: UNEXPECTED_MESSAGE };
  return { ok: true, video: answer.video, uploadLink: answer.uploadLink };
}

/** The parts of XMLHttpRequest the upload uses, so a test can drive them. */
export interface VideoRequest {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(body: Blob): void;
  withCredentials: boolean;
  timeout: number;
  status: number;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
}

/**
 * Step 2. Sends the whole file in one tus request to the address from step 1, reporting how much has gone (0 to 1). It
 * is sent without cookies: Vimeo's server wants none, and ours must not be offered any. Done when Vimeo says it holds
 * every byte (its `Upload-Offset` is the file's size). XMLHttpRequest, because `fetch` cannot report upload progress.
 */
export function sendFileToVimeo(
  uploadLink: string,
  file: File,
  onProgress: (fraction: number) => void,
  makeRequest: () => VideoRequest = () => new XMLHttpRequest() as unknown as VideoRequest,
): Promise<VideoUploadResult> {
  return new Promise((resolve) => {
    const request = makeRequest();
    request.open("PATCH", uploadLink);
    request.withCredentials = false;
    request.timeout = SEND_TIMEOUT_MS;
    request.setRequestHeader("Tus-Resumable", "1.0.0");
    request.setRequestHeader("Upload-Offset", "0");
    request.setRequestHeader("Content-Type", "application/offset+octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(1, event.loaded / event.total));
    };
    request.onload = () => {
      const held = Number(request.getResponseHeader("Upload-Offset"));
      resolve(request.status >= 200 && request.status < 300 && held === file.size ? { ok: true } : { ok: false, message: UNREACHABLE_MESSAGE });
    };
    request.onerror = () => resolve({ ok: false, message: UNREACHABLE_MESSAGE });
    request.ontimeout = () => resolve({ ok: false, message: UNREACHABLE_MESSAGE });
    request.onabort = () => resolve({ ok: false, message: UNREACHABLE_MESSAGE });
    request.send(file);
  });
}

export interface WaitOptions {
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
}

/**
 * Step 3. Asks our server where the video stands every few seconds, telling `onState` while it is on its way. Done when
 * the video is live, or when it is no longer waiting (it went live in another tab); failed with the owner's words when it
 * was given up. A hiccup (the server or Vimeo not answering) is just asked again.
 */
export async function waitForVideo(videoId: string, onState: (state: WaitState) => void, options: WaitOptions = {}): Promise<VideoUploadResult> {
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const interval = options.intervalMs ?? POLL_INTERVAL_MS;
  const deadline = now() + (options.timeoutMs ?? POLL_TIMEOUT_MS);

  while (now() < deadline) {
    try {
      const response = await fetchImpl(`${LISTING_VIDEO_ROUTE}/${videoId}/finish`, { method: "POST", credentials: "same-origin" });
      const body = await jsonOf(response);
      if (response.status === 404) return { ok: true };
      if (response.status === 422) return { ok: false, message: messageForVideoResponse(response.status, body) };
      if (response.ok) {
        const state = (body as { state?: unknown } | null)?.state;
        if (state === "live") return { ok: true };
        if (state === "uploading" || state === "preparing") onState(state);
      }
      // Anything else (a 502 while Vimeo is busy, a 401 for a moment) is asked again.
    } catch {
      // The connection dropped for a moment: ask again.
    }
    await sleep(interval);
  }
  return { ok: false, message: TOO_SLOW_MESSAGE };
}

/**
 * How long the chosen video is, in seconds, read from its header by the browser; null when the browser cannot tell
 * (a format it does not play, a recording with no length in its header), which is not a reason to refuse it: the server
 * measures it properly once Vimeo has it.
 */
export function readVideoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement("video");
    let settled = false;
    const finish = (seconds: number | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = window.setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? element.duration : null);
    element.onerror = () => finish(null);
    element.src = url;
  });
}

/** All three steps, for one chosen file: the result carries a message ready to show. */
export async function uploadListingVideo(file: File, slot: VideoSlot, onProgress: (progress: VideoUploadProgress) => void): Promise<VideoUploadResult> {
  const requested = await requestVideoUpload(slot, file.size);
  if (!requested.ok) return requested;
  onProgress({ phase: "sending", fraction: 0 });
  const sent = await sendFileToVimeo(requested.uploadLink, file, (fraction) => onProgress({ phase: "sending", fraction }));
  if (!sent.ok) return sent;
  onProgress({ phase: "preparing", fraction: 1 });
  return waitForVideo(requested.video.id, () => onProgress({ phase: "preparing", fraction: 1 }));
}
