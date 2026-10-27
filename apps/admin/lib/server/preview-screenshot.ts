import "server-only";
import sharp from "sharp";

/** A picture that could not be taken. The message is for the log; the preview is sent without a picture all the same. */
export class PreviewScreenshotError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "PreviewScreenshotError";
  }
}

export interface Screenshot {
  /** Always webp, re-encoded here: the provider's bytes are never kept. */
  readonly image: Buffer;
  readonly width: number;
  readonly height: number;
}

export interface CaptureOptions {
  /** For tests. */
  readonly fetch?: typeof fetch;
  /** A provider address with `{url}` where the preview address goes. Defaults to PREVIEW_SCREENSHOT_URL, then Microlink. */
  readonly template?: string;
}

const DEFAULT_TEMPLATE =
  "https://api.microlink.io/?url={url}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800";
const TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const MAX_ANSWER_BYTES = 6 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const OUTPUT_WIDTH = 1280;
/** The database refuses a picture over 1 MB; stay under it. */
const MAX_OUTPUT_BYTES = 900 * 1024;
const QUALITIES = [80, 70, 60, 50, 40] as const;
/** Never SVG: it can carry script. */
const IMAGE_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The provider's address for this preview. The preview address is only ever an encoded query value, never part of the host. */
function providerAddress(template: string, previewUrl: string): string {
  if (!template.includes("{url}")) throw new PreviewScreenshotError("PREVIEW_SCREENSHOT_URL has no {url} in it.");
  try {
    const address = template.replace("{url}", encodeURIComponent(previewUrl));
    if (new URL(address).host !== new URL(template.replace("{url}", "x")).host) throw new Error("host differs");
    return address;
  } catch (error) {
    throw new PreviewScreenshotError("PREVIEW_SCREENSHOT_URL must be an absolute address with {url} outside the host.", { cause: error });
  }
}

/** True for an IPv4 address in a loopback, unspecified, link-local or private range. */
function isPrivateIPv4(a: number, b: number): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Why a redirect may not be followed, or null when it may. `url.hostname` is already normalised by URL (IPv4 shorthand becomes dotted, IPv6 is bracketed and compressed). */
function unsafeRedirectReason(url: URL): string | null {
  if (url.protocol !== "https:") return "is not https";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || /\.(localhost|internal|local)$/.test(host)) return "is a local host";
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (v4) return isPrivateIPv4(Number(v4[1]), Number(v4[2])) ? "is a private address" : null;
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (mapped) {
      const high = parseInt(mapped[1] ?? "0", 16);
      return isPrivateIPv4(high >> 8, high & 0xff) ? "is a private address" : null;
    }
    if (v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return "is a private address";
  }
  return null;
}

/** Reads the body as it arrives and stops, cancelling the stream, as soon as it passes the cap. */
async function readCapped(answer: Response): Promise<Buffer> {
  const tooLarge = (): PreviewScreenshotError => new PreviewScreenshotError("The screenshot is too large.");
  if (Number(answer.headers.get("content-length") ?? 0) > MAX_ANSWER_BYTES) {
    await answer.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  if (!answer.body) throw new PreviewScreenshotError("The screenshot service sent no body.");
  const reader = answer.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ANSWER_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PreviewScreenshotError) throw error;
    throw new PreviewScreenshotError("The screenshot could not be read in time.", { cause: error });
  }
  return Buffer.concat(chunks, total);
}

/**
 * Takes a picture of a preview page through the screenshot service and returns it as a webp 1280 wide at most, under
 * 900 KB. Only the service's address is fetched (see providerAddress); the answer must be a real PNG, JPEG or WebP under
 * 6 MB (counted as it streams in), and is decoded and re-encoded here. The first request goes to the provider's own
 * address; redirects are followed by hand, at most 3, and only to public https hosts. Anything else throws PreviewScreenshotError.
 */
export async function captureScreenshot(previewUrl: string, options: CaptureOptions = {}): Promise<Screenshot> {
  let target: URL;
  try {
    target = new URL(previewUrl);
  } catch (error) {
    throw new PreviewScreenshotError("The preview address is not an address.", { cause: error });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new PreviewScreenshotError("The preview address must be http or https.");

  const template = options.template ?? (process.env.PREVIEW_SCREENSHOT_URL?.trim() || DEFAULT_TEMPLATE);
  const address = providerAddress(template, previewUrl);
  const doFetch = options.fetch ?? fetch;

  let next = address;
  let answer: Response;
  for (let hops = 0; ; hops += 1) {
    try {
      answer = await doFetch(next, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new PreviewScreenshotError("The screenshot service did not answer in time.", { cause: error });
    }
    if (!REDIRECT_STATUSES.has(answer.status)) break;
    await answer.body?.cancel().catch(() => undefined);
    if (hops >= MAX_REDIRECTS) throw new PreviewScreenshotError("The screenshot service redirected too many times.");
    const location = answer.headers.get("location");
    if (!location) throw new PreviewScreenshotError("The screenshot service redirected with no address.");
    let to: URL;
    try {
      to = new URL(location, next);
    } catch (error) {
      throw new PreviewScreenshotError("The screenshot service redirected to something that is not an address.", { cause: error });
    }
    const reason = unsafeRedirectReason(to);
    if (reason) throw new PreviewScreenshotError(`The screenshot service redirected to ${to.hostname}, which ${reason}.`);
    next = to.href;
  }
  if (!answer.ok) throw new PreviewScreenshotError(`The screenshot service answered ${answer.status}.`);
  const type = (answer.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!IMAGE_TYPES.has(type)) throw new PreviewScreenshotError(`The screenshot service sent ${type || "no type"}, not a picture.`);
  const bytes = await readCapped(answer);

  try {
    for (const quality of QUALITIES) {
      const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
        .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.byteLength < MAX_OUTPUT_BYTES) return { image: data, width: info.width, height: info.height };
    }
  } catch (error) {
    throw new PreviewScreenshotError("The screenshot could not be read as a picture.", { cause: error });
  }
  throw new PreviewScreenshotError("The screenshot is still too large after compressing it.");
}
