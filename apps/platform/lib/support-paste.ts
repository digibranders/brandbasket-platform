/** The part of a clipboard item this reads, so the logic can be tested without a browser. */
export interface PastedItem {
  readonly kind: string;
  readonly type: string;
  readonly getAsFile: () => File | null;
}

/** The part of a paste event this reads. React's ClipboardEvent fits it. */
export interface PasteEventLike {
  readonly defaultPrevented: boolean;
  readonly clipboardData: { readonly items: ArrayLike<PastedItem> } | null;
  readonly preventDefault: () => void;
}

const EXTENSIONS: Readonly<Record<string, string>> = { "image/jpeg": "jpg", "image/webp": "webp" };
/** Names browsers give a pasted image when it has no real file name. */
const GENERIC_NAMES: ReadonlySet<string> = new Set(["", "image.png", "blob"]);

/** Image files on the clipboard. A pasted image with a generic name gets a timestamped one, such as screenshot-142530.png. */
export function pastedImageFiles(items: ArrayLike<PastedItem> | null | undefined, now: Date, prefix: string): File[] {
  if (items === null || items === undefined) return [];
  const files: File[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item === undefined || item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file === null) continue;
    const extension = EXTENSIONS[file.type] ?? "png";
    const name = GENERIC_NAMES.has(file.name) ? `${prefix}-${now.toISOString().slice(11, 19).replaceAll(":", "")}.${extension}` : file.name;
    files.push(new File([file], name, { type: file.type }));
  }
  return files;
}

/**
 * One paste handler for every support form. Attach it once, to the form: a paste in the text box bubbles up to it. If a
 * handler lower down already took the event, or the clipboard holds no image, it does nothing, so a pasted image is
 * uploaded exactly once. Returns whether it took the paste.
 */
export function handleImagePaste(event: PasteEventLike, addFiles: (files: File[]) => void, prefix: string, now: Date = new Date()): boolean {
  if (event.defaultPrevented) return false;
  const files = pastedImageFiles(event.clipboardData?.items, now, prefix);
  if (files.length === 0) return false;
  event.preventDefault();
  addFiles(files);
  return true;
}
