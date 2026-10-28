/** Whether a key press asks for search: Command K on a Mac, Control K elsewhere. */
export function isSearchShortcut(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "key">): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}
