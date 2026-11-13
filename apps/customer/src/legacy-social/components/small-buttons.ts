import { buttonClasses } from "@/ui/button-styles";

/*
 * The buttons of the copied Social media screens, drawn as the rest of the app draws its buttons (src/ui/button-styles): the same
 * primary and secondary looks and sizes, so a Social media button reads like a button anywhere else. A native `disabled` button also
 * dims, since these are plain buttons, not the Button primitive.
 */
const DIM = "disabled:cursor-not-allowed disabled:opacity-50";

export const SMALL_WHITE = `${buttonClasses("secondary", "sm")} ${DIM}`;
export const SMALL_SOFT = `${buttonClasses("secondary", "sm")} ${DIM}`;
/** The one main action of a card. */
export const SMALL_DARK = `${buttonClasses("primary", "sm")} ${DIM}`;
/** The page's one main action in its top corner (New post). */
export const SMALL_ACCENT = `${buttonClasses("primary", "md")} ${DIM}`;
