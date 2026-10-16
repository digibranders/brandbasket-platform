import type { ReactElement, ReactNode } from "react";

/*
 * The sidebar's icons: Lucide (ISC licence, lucide.dev), plain line, 24px grid, stroke 1.75, round caps and joins. One
 * set, so every item reads as one family; each item has a glyph of its own. Only the glyphs the sidebar uses are here, so
 * nothing else is shipped. Sized by the caller (`size-5` is 20px).
 */

interface NavIconProps {
  readonly className?: string;
}

function LineIcon({ className, children }: NavIconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Home: layout-dashboard. */
export function NavDashboardIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </LineIcon>
  );
}

/** Appointments: calendar-check. */
export function NavCalendarCheckIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 15 2 2 4-4" />
    </LineIcon>
  );
}

/** Patients: hand-heart. */
export function NavHandHeartIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" />
      <path d="m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95" />
      <path d="m2 15 6 6" />
      <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91" />
    </LineIcon>
  );
}

/** Business profile: storefront. */
export function NavStorefrontIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
      <path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" />
      <path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
    </LineIcon>
  );
}

/** Leads: inbox. */
export function NavInboxIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </LineIcon>
  );
}

/** Photos: images. */
export function NavImagesIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16" />
      <path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2" />
      <circle cx="13" cy="7" r="1" fill="currentColor" />
      <rect x="8" y="2" width="14" height="14" rx="2" />
    </LineIcon>
  );
}

/** Advertise: megaphone. */
export function NavMegaphoneIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" />
      <path d="M8 6v8" />
    </LineIcon>
  );
}

/** Your project: briefcase. */
export function NavBriefcaseIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </LineIcon>
  );
}

/** Your details: id-card. */
export function NavGlobeIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
    </LineIcon>
  );
}

export function NavIdCardIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M13 19a4 4 0 00-8 0" />
      <path d="M16 10h2" />
      <path d="M16 14h2" />
      <circle cx="9" cy="12" r="3" />
      <rect x="2" y="5" width="20" height="14" rx="2" />
    </LineIcon>
  );
}

/** Content: notebook-pen. */
export function NavNotebookPenIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
      <path d="M2 6h4" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    </LineIcon>
  );
}

/** Billing: scroll-text. */
export function NavScrollTextIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M15 12h-5" />
      <path d="M15 8h-5" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
    </LineIcon>
  );
}

/** Upgrade: circle-arrow-up. */
export function NavCircleArrowUpIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 12-4-4-4 4" />
      <path d="M12 16V8" />
    </LineIcon>
  );
}

/** Reviews: star. */
export function NavStarIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </LineIcon>
  );
}

/** Deals: percent. */
export function NavPercentIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <line x1="19" x2="5" y1="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </LineIcon>
  );
}

/** Add-ons: circle-plus. */
export function NavCirclePlusIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </LineIcon>
  );
}

/** Set up your website: list-checks. */
export function NavListChecksIcon({ className }: NavIconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M13 5h8" />
      <path d="M13 12h8" />
      <path d="M13 19h8" />
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
    </LineIcon>
  );
}
