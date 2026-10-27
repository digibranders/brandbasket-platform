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

/**
 * Takes a picture of a preview page through the screenshot service and returns it as a webp 1280 wide at most, under
 * 900 KB. Only the service's address is fetched (see providerAddress); the answer must be a real PNG, JPEG or WebP under
 * 6 MB, and is decoded and re-encoded here. Anything else throws PreviewScreenshotError.
 * shortcut: the answer is read whole after its length header is checked, not streamed with a cap; stream it if the provider ever changes.
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

  let answer: Response;
  try {
    answer = await doFetch(address, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new PreviewScreenshotError("The screenshot service did not answer in time.", { cause: error });
  }
  if (!answer.ok) throw new PreviewScreenshotError(`The screenshot service answered ${answer.status}.`);
  const type = (answer.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!IMAGE_TYPES.has(type)) throw new PreviewScreenshotError(`The screenshot service sent ${type || "no type"}, not a picture.`);
  if (Number(answer.headers.get("content-length") ?? 0) > MAX_ANSWER_BYTES) throw new PreviewScreenshotError("The screenshot is too large.");

  const bytes = Buffer.from(await answer.arrayBuffer());
  if (bytes.byteLength > MAX_ANSWER_BYTES) throw new PreviewScreenshotError("The screenshot is too large.");

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
