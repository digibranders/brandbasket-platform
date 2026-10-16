import type { ReactElement, ReactNode } from "react";

/*
 * The product's icons: Lucide (ISC licence, lucide.dev), plain line, 24px grid, stroke 1.75, round caps and joins, the same
 * family as the sidebar (nav-icons.tsx). The WhatsApp mark is the brand's own and stays as drawn. Sized and coloured by
 * the caller (`size-5` is 20px, `currentColor` is the text colour).
 */

interface IconProps {
  readonly className?: string;
}

function LineIcon({ className, children }: IconProps & { readonly children: ReactNode }): ReactElement {
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

/** arrow-right */
export function ArrowIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </LineIcon>
  );
}

/** check */
export function TickIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M20 6 9 17l-5-5" />
    </LineIcon>
  );
}

/** search */
export function SearchIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </LineIcon>
  );
}

/** mail */
export function MailIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </LineIcon>
  );
}

/** chevron-down */
export function ChevronDownIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m6 9 6 6 6-6" />
    </LineIcon>
  );
}

/** map-pin */
export function PinIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </LineIcon>
  );
}

/** phone */
export function PhoneIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
    </LineIcon>
  );
}

/** file-text */
export function DocumentIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </LineIcon>
  );
}

/** user */
export function UserIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </LineIcon>
  );
}

/** building-2 */
export function BuildingIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M10 12h4" />
      <path d="M10 8h4" />
      <path d="M14 21v-3a2 2 0 0 0-4 0v3" />
      <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
      <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    </LineIcon>
  );
}

/** percent */
export function PercentIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <line x1="19" x2="5" y1="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </LineIcon>
  );
}

/** tag */
export function TagIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </LineIcon>
  );
}

/** message-square-text */
export function ChatIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <path d="M7 11h10" />
      <path d="M7 15h6" />
      <path d="M7 7h8" />
    </LineIcon>
  );
}

export function WhatsAppIcon({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M12.04 2.95a9 9 0 0 0-7.63 13.78L3.2 20.8l4.18-1.1A9 9 0 1 0 12.04 2.95Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16.7 14.1c-.26-.13-1.53-.76-1.77-.84-.24-.09-.41-.13-.58.13-.17.26-.66.84-.82 1.01-.15.18-.3.2-.56.07-.26-.13-1.1-.4-2.08-1.29-.77-.69-1.29-1.53-1.44-1.79-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.18.04-.33-.02-.45-.06-.13-.58-1.4-.8-1.92-.21-.5-.42-.44-.58-.44h-.5c-.17 0-.45.06-.69.33-.24.26-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.13.18 1.81 2.78 4.4 3.9.62.27 1.1.43 1.47.54.62.2 1.18.17 1.62.1.5-.07 1.53-.62 1.74-1.22.21-.61.21-1.13.15-1.23-.06-.11-.24-.18-.5-.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** shield-check */
export function ShieldIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </LineIcon>
  );
}

/** heart */
export function HeartIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
    </LineIcon>
  );
}

/** crown */
export function CrownIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </LineIcon>
  );
}

/** lock */
export function LockIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </LineIcon>
  );
}

/** eye */
export function EyeIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </LineIcon>
  );
}

/** eye-off */
export function EyeOffIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </LineIcon>
  );
}

/** users */
export function UsersIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
    </LineIcon>
  );
}

/** gauge */
export function GaugeIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </LineIcon>
  );
}

/** briefcase */
export function BriefcaseIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </LineIcon>
  );
}

/** plus */
export function PlusIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </LineIcon>
  );
}

/** circle-check */
export function CheckCircleIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </LineIcon>
  );
}

/** link */
export function LinkIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </LineIcon>
  );
}

/** credit-card */
export function CardIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </LineIcon>
  );
}

/** house */
export function HomeIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </LineIcon>
  );
}

/** clipboard-list */
export function ClipboardIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </LineIcon>
  );
}

/** palette */
export function PaletteIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </LineIcon>
  );
}

/** code */
export function CodeIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </LineIcon>
  );
}

/** rocket */
export function RocketIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09" />
      <path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05" />
    </LineIcon>
  );
}

/** refresh-cw */
export function RefreshIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </LineIcon>
  );
}

/** settings */
export function SettingsIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </LineIcon>
  );
}

/** log-out */
export function SignOutIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </LineIcon>
  );
}

/** chevron-right */
export function ChevronRightIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="m9 18 6-6-6-6" />
    </LineIcon>
  );
}

/** mouse-pointer-click */
export function MouseIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M14 4.1 12 6" />
      <path d="m5.1 8-2.9-.8" />
      <path d="m6 12-1.9 2" />
      <path d="M7.2 2.2 8 5.1" />
      <path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z" />
    </LineIcon>
  );
}

/** pointer */
export function TapIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M22 14a8 8 0 0 1-8 8" />
      <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
      <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </LineIcon>
  );
}

/** bell */
export function BellIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </LineIcon>
  );
}

/** ellipsis */
export function EllipsisIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </LineIcon>
  );
}

/** copy */
export function CopyIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </LineIcon>
  );
}

/** smile */
export function SmileIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" x2="9.01" y1="9" y2="9" />
      <line x1="15" x2="15.01" y1="9" y2="9" />
    </LineIcon>
  );
}

/** book-open */
export function BookIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </LineIcon>
  );
}

/** pencil */
export function PencilIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </LineIcon>
  );
}

/** life-buoy */
export function LifebuoyIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 4.24 4.24" />
      <path d="m14.83 9.17 4.24-4.24" />
      <path d="m14.83 14.83 4.24 4.24" />
      <path d="m9.17 14.83-4.24 4.24" />
      <circle cx="12" cy="12" r="4" />
    </LineIcon>
  );
}

/** clock */
export function ClockIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </LineIcon>
  );
}

/** calendar */
export function CalendarIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </LineIcon>
  );
}

/** download */
export function DownloadIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </LineIcon>
  );
}

/** image */
export function PhotoIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </LineIcon>
  );
}

/** star */
export function StarIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </LineIcon>
  );
}

/** scroll-text */
export function ScrollTextIcon({ className }: IconProps): ReactElement {
  return (
    <LineIcon className={className}>
      <path d="M15 12h-5" />
      <path d="M15 8h-5" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
    </LineIcon>
  );
}
