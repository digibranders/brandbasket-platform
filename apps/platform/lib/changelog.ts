export interface ChangelogEntry {
  readonly date: string;
  /** Rendered as the visible date. Kept beside `date` so the machine-readable value never drifts from the label. */
  readonly label: string;
  readonly title: string;
  readonly body: string;
}

/**
 * What changed in the dashboard, newest first, in the customer's own terms.
 *
 * A hand-kept list rather than anything generated: it exists to tell a business owner what is different for them,
 * which is never the same thing as what the commits say. Add an entry when a customer would notice; leave internal
 * work out of it.
 */
export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
  {
    date: "2026-09-21",
    label: "21 September 2026",
    title: "Your account, in one place",
    body: "Your name at the bottom of the sidebar now opens everything to do with your account: settings, help and signing out. The bell beside it shows anything waiting on you.",
  },
  {
    date: "2026-09-21",
    label: "21 September 2026",
    title: "The blog is yours",
    body: "Write, edit, publish and unpublish posts whenever you like, with no limit on how often. Changes to the rest of your website are made by our team. Send us a note and we'll take care of it.",
  },
];
