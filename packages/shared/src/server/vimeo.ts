import "server-only";
import { deploymentBrandShortName } from "../lib/deployment-brand";

/*
 * Vimeo's API, for a Premium member's short videos (docs/superpowers/specs/2026-10-07-business-videos-design.md): the
 * videos live in Firstfold's own Vimeo account as unlisted, embeddable and not downloadable, and the business page
 * plays them in Vimeo's player. Only what we use is here: ask for a resumable upload, read a video back, delete one.
 * The browser sends the file to Vimeo itself with the upload address this returns; our servers never carry it. Every video
 * is made inside the account's "Firstfold" folder, never loose in the library.
 *
 * Everything Vimeo answers is checked before it is passed on: the upload address must be Vimeo's, and a video is only
 * "ready" once it has the privacy hash its embed address needs and a poster on Vimeo's image host.
 */

const API = "https://api.vimeo.com";
const ACCEPT = "application/vnd.vimeo.*+json;version=3.4";
const REQUEST_TIMEOUT_MS = 15_000;

/** The Vimeo error codes that mean the account's upload allowance is used up: yearly or lifetime, weekly, daily. */
const QUOTA_ERROR_CODES: ReadonlySet<number> = new Set([4101, 4102, 4104]);

/** `configuration`: something we were told to rely on is not there (the Firstfold folder), so nothing is made. */
export type VimeoFailure = "quota" | "unauthorized" | "configuration" | "other";

/** Vimeo refused or failed a request. `reason` says what to do about it; the message never holds the token. */
export class VimeoError extends Error {
  readonly status: number;
  readonly reason: VimeoFailure;

  constructor(message: string, status: number, reason: VimeoFailure = "other") {
    super(message);
    this.name = "VimeoError";
    this.status = status;
    this.reason = reason;
  }
}

/** What `fetch` is, so a test can stand in for the network. */
export type VimeoFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Where a video is in Vimeo: its file is still arriving, Vimeo is preparing it, it can be shown, or it failed. */
export type VimeoState = "uploading" | "preparing" | "ready" | "failed";

export interface VimeoVideo {
  readonly vimeoId: string;
  readonly state: VimeoState;
  /** Set once Vimeo knows them; the page needs all of these before it shows the video (state `ready`). */
  readonly seconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  /** The privacy hash in the video's embed address (`?h=…`). */
  readonly hash: string | null;
  /** A still on Vimeo's image host, about 640 pixels wide. */
  readonly posterUrl: string | null;
}

export interface VimeoUpload {
  readonly vimeoId: string;
  /** Where the browser sends the file, by the resumable (tus) protocol. */
  readonly uploadLink: string;
}

export interface VimeoClient {
  createUpload(input: { readonly size: number; readonly name: string }): Promise<VimeoUpload>;
  /** The video, or null when Vimeo no longer has it. */
  getVideo(vimeoId: string): Promise<VimeoVideo | null>;
  /** Deletes the video; one that is already gone counts as deleted. */
  deleteVideo(vimeoId: string): Promise<void>;
}

/** The access token from the environment, or null when there is none (videos are then not available). */
export function vimeoTokenFromEnv(env: Readonly<Record<string, string | undefined>>): string | null {
  const token = env.VIMEO_ACCESS_TOKEN?.trim();
  return token === undefined || token === "" ? null : token;
}

/** The folder every member's video goes in, found by name (whatever its capitals) the first time it is needed: the deployment's brand, "Firstfold" or "Fynix". */
export function vimeoFolderName(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return deploymentBrandShortName(env);
}
const FOLDER_URI = /^\/users\/[0-9]{1,20}\/projects\/[0-9]{1,20}$/;
const FOLDER_PAGE_SIZE = 100;
/** More folders than this and the lookup gives up: a Firstfold account has a handful. */
const FOLDER_MAX_PAGES = 5;
const VIDEO_ID = /^[0-9]{1,20}$/;
const HASH = /^[0-9a-f]{6,32}$/;

function assertVideoId(vimeoId: string): void {
  if (!VIDEO_ID.test(vimeoId)) throw new VimeoError("That is not a Vimeo video id.", 400);
}

function isVimeoUploadAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "vimeo.com" || url.hostname.endsWith(".vimeo.com")) && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function isVimeoImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "i.vimeocdn.com" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

async function jsonOf(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await response.json();
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function failure(response: Response): Promise<VimeoError> {
  const body = await jsonOf(response);
  const code = typeof body?.error_code === "number" ? body.error_code : null;
  if (response.status === 401) return new VimeoError("Vimeo did not accept the access token.", 401, "unauthorized");
  if (code !== null && QUOTA_ERROR_CODES.has(code)) return new VimeoError(`Vimeo's upload allowance is used up (error ${String(code)}).`, response.status, "quota");
  return new VimeoError(`Vimeo answered ${String(response.status)}${code === null ? "" : ` (error ${String(code)})`}.`, response.status);
}

const VIDEO_FIELDS = "status,upload.status,transcode.status,duration,width,height,player_embed_url,pictures.sizes";

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function hashOf(embedUrl: unknown): string | null {
  if (typeof embedUrl !== "string") return null;
  try {
    const hash = new URL(embedUrl).searchParams.get("h");
    return hash !== null && HASH.test(hash) ? hash : null;
  } catch {
    return null;
  }
}

/** The smallest picture at least 640 pixels wide, else the widest there is, on Vimeo's image host. */
function posterOf(pictures: unknown): string | null {
  const sizes = (pictures as { sizes?: unknown } | null | undefined)?.sizes;
  if (!Array.isArray(sizes)) return null;
  const usable = sizes
    .map((size: unknown) => size as { width?: unknown; link?: unknown })
    .filter((size): size is { width: number; link: string } => typeof size.width === "number" && isVimeoImage(size.link))
    .sort((a, b) => a.width - b.width);
  return (usable.find((size) => size.width >= 640) ?? usable.at(-1))?.link ?? null;
}

function stateOf(body: Record<string, unknown>, complete: boolean): VimeoState {
  const status = typeof body.status === "string" ? body.status : "";
  if (status === "available") return complete ? "ready" : "preparing";
  if (status.endsWith("_error") || status === "quota_exceeded" || status === "total_cap_exceeded") return "failed";
  const uploadStatus = (body.upload as { status?: unknown } | null | undefined)?.status;
  return status === "uploading" || uploadStatus === "in_progress" ? "uploading" : "preparing";
}

/** A client for Vimeo's API with `token`, using `fetchImpl` (the platform's `fetch` unless a test says otherwise). */
export function createVimeoClient(
  token: string,
  fetchImpl: VimeoFetch = (input, init) => fetch(input, init),
  folderName: string = vimeoFolderName(),
): VimeoClient {
  async function call(method: string, route: string, body?: unknown): Promise<Response> {
    return fetchImpl(`${API}${route}`, {
      method,
      headers: {
        Authorization: `bearer ${token}`,
        Accept: ACCEPT,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** The address of the folder, from Vimeo, once; a failed lookup is tried again next time. */
  let folder: Promise<string> | undefined;

  async function lookUpFolder(): Promise<string> {
    let route: string | null = `/me/projects?fields=${encodeURIComponent("uri,name")}&per_page=${String(FOLDER_PAGE_SIZE)}`;
    for (let page = 0; route !== null && page < FOLDER_MAX_PAGES; page += 1) {
      const response = await call("GET", route);
      if (!response.ok) throw await failure(response);
      const body = await jsonOf(response);
      const found = (Array.isArray(body?.data) ? (body.data as { name?: unknown; uri?: unknown }[]) : []).find(
        (entry) => typeof entry.name === "string" && entry.name.toLowerCase() === folderName.toLowerCase(),
      );
      if (found !== undefined) {
        if (typeof found.uri !== "string" || !FOLDER_URI.test(found.uri)) {
          throw new VimeoError(`Vimeo gave an unusable address for the "${folderName}" folder.`, response.status, "configuration");
        }
        return found.uri;
      }
      const next = (body?.paging as { next?: unknown } | null | undefined)?.next;
      route = typeof next === "string" && next.startsWith("/me/projects") ? next : null;
    }
    throw new VimeoError(`The Vimeo account has no "${folderName}" folder. Make one, then videos can be added.`, 404, "configuration");
  }

  function folderUri(): Promise<string> {
    folder ??= lookUpFolder().catch((error: unknown) => {
      folder = undefined;
      throw error;
    });
    return folder;
  }

  return {
    async createUpload({ size, name }) {
      const folderUriForVideo = await folderUri();
      const response = await call("POST", "/me/videos", {
        upload: { approach: "tus", size },
        name,
        // Unlisted: not in Vimeo's search or on our profile, playable only from its own address. Embeddable so our page
        // can show it, and not downloadable.
        privacy: { view: "unlisted", embed: "public", download: false },
        folder_uri: folderUriForVideo,
      });
      if (!response.ok) throw await failure(response);
      const body = await jsonOf(response);
      const upload = body?.upload as { approach?: unknown; upload_link?: unknown } | null | undefined;
      if (upload?.approach !== "tus") throw new VimeoError("Vimeo did not give a resumable upload.", response.status);
      if (!isVimeoUploadAddress(upload.upload_link)) throw new VimeoError("Vimeo gave an upload address that is not its own.", response.status);
      const vimeoId = typeof body?.uri === "string" ? (body.uri.split("/").at(-1) ?? "") : "";
      if (!VIDEO_ID.test(vimeoId)) throw new VimeoError("Vimeo gave no usable video id.", response.status);
      return { vimeoId, uploadLink: upload.upload_link };
    },

    async getVideo(vimeoId) {
      assertVideoId(vimeoId);
      const response = await call("GET", `/videos/${vimeoId}?fields=${encodeURIComponent(VIDEO_FIELDS)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw await failure(response);
      const body = (await jsonOf(response)) ?? {};
      const seconds = numberOrNull(body.duration);
      const width = numberOrNull(body.width);
      const height = numberOrNull(body.height);
      const hash = hashOf(body.player_embed_url);
      const posterUrl = posterOf(body.pictures);
      // Vimeo calls a video "available" while it is still making its smaller versions, and until it is done the
      // width and height are those of the first small one (426x240 for a 1920x1080 clip), so wait for the transcode.
      const transcoded = (body.transcode as { status?: unknown } | null | undefined)?.status === "complete";
      const complete = transcoded && seconds !== null && width !== null && height !== null && hash !== null && posterUrl !== null;
      return { vimeoId, state: stateOf(body, complete), seconds, width, height, hash, posterUrl };
    },

    async deleteVideo(vimeoId) {
      assertVideoId(vimeoId);
      const response = await call("DELETE", `/videos/${vimeoId}`);
      if (response.status === 404 || response.ok) return;
      throw await failure(response);
    },
  };
}

let shared: VimeoClient | undefined;

/** The Vimeo client for this process, or null when no VIMEO_ACCESS_TOKEN is set. */
export function getVimeoClient(): VimeoClient | null {
  if (shared === undefined) {
    const token = vimeoTokenFromEnv(process.env);
    if (token === null) return null;
    shared = createVimeoClient(token);
  }
  return shared;
}
