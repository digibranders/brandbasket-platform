import type { SidebarNavItem } from "@fynix/shared/ui/panel/sidebar-nav";

/**
 * Lays the sidebar's sections end to end: the first row of every section after the first gets a hairline above it
 * (`sectionStart`). A section a customer has nothing in is skipped, so a hairline is never drawn at the top or twice
 * in a row.
 */
export function joinSections(sections: readonly (readonly SidebarNavItem[])[]): readonly SidebarNavItem[] {
  return sections
    .filter((section) => section.length > 0)
    .flatMap((section, sectionIndex) =>
      section.map((row, rowIndex) => (sectionIndex > 0 && rowIndex === 0 ? { ...row, sectionStart: true } : row)),
    );
}
