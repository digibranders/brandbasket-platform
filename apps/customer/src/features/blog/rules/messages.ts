/** What the blog's actions answer. Old wording kept where the old app had it. */

/** New: the old app had no roles. Payload has no row-level security, so this check is the only thing stopping a viewer's write. */
export const VIEWER_MESSAGE = "Only the owner or an editor can change the blog.";
/** New: an unexpected failure while writing. */
export const SAVE_FAILED_MESSAGE = "We couldn't save that just now. Nothing was lost. Try again in a minute.";

export const POST_GONE_MESSAGE = "This post no longer exists. Reload the page.";
export const RELATION_GONE_MESSAGE = "That category or author no longer exists. Reload the page.";
export const POST_SLUG_TAKEN_MESSAGE = "Another of your posts already uses this address. Choose another.";
export const TITLE_NO_ADDRESS_MESSAGE = "That title doesn't make a usable web address. Try adding some letters.";

export const AUTHOR_GONE_MESSAGE = "This author no longer exists. Reload the page.";
export const CATEGORY_GONE_MESSAGE = "This category no longer exists. Reload the page.";
export const CATEGORY_SLUG_TAKEN_MESSAGE = "Another of your categories already uses this address. Choose another.";

export function categoryNameTakenMessage(name: string): string {
  return `You already have a category called ${name}.`;
}
