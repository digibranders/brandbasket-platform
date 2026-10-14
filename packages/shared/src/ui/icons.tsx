import type { ReactElement } from "react";

interface IconProps {
  readonly className?: string;
}

export function ArrowIcon({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M2.5 8h10.5M9 3.75 13.25 8 9 12.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TickIcon({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M2.75 8.5 6.25 11.75 13.25 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <path
        d="m4 6 4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PinIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.5 4h3l1.5 4-2 1.4a12 12 0 0 0 5.6 5.6L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z" />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.5 3.5h7L18 8v12.5H6.5Z" />
      <path d="M13.5 3.5V8H18M9.5 12.5h5M9.5 16h5" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 20.5V5.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15" />
      <path d="M13.5 10.5h5a1 1 0 0 1 1 1v9M3 20.5h18" />
      <path d="M7.5 8h3M7.5 12h3M7.5 16h3M16 14h1M16 17.5h1" />
    </svg>
  );
}

export function PercentIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18.5 5.5 5.5 18.5" />
      <circle cx="7.5" cy="7.5" r="2.3" />
      <circle cx="16.5" cy="16.5" r="2.3" />
    </svg>
  );
}

export function TagIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 11.2V4.8a.8.8 0 0 1 .8-.8h6.4a.8.8 0 0 1 .57.23l7.7 7.7a1.2 1.2 0 0 1 0 1.7l-5.67 5.67a1.2 1.2 0 0 1-1.7 0l-7.7-7.7A.8.8 0 0 1 4 11.2Z" />
      <circle cx="8" cy="8" r="1.1" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

/** WhatsApp's speech bubble and handset, drawn like the website's (fynix-website components/icons.tsx). */
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

export function ShieldIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3.5 5.5 6v6c0 4 2.7 7.2 6.5 8.5 3.8-1.3 6.5-4.5 6.5-8.5V6Z" />
      <path d="M9.25 12.2 11.3 14.2l3.6-3.9" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 19.5c-4.2-2.6-7-5.3-7-8.6a3.9 3.9 0 0 1 7-2.4 3.9 3.9 0 0 1 7 2.4c0 3.3-2.8 6-7 8.6Z" />
    </svg>
  );
}

/** A crown: Premium. Stroke only like the rest; give it a fill class (fill-gold/40) where it should read as gold. */
export function CrownIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m4 8 3.6 3.6L12 5l4.4 6.6L20 8l-1.5 9h-13Z" />
      <path d="M5.5 20h13" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function EyeOffIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.2 6.6C3.9 8.3 2.5 12 2.5 12s3.5 5.5 9.5 5.5c1.7 0 3.2-.44 4.4-1.07M9.9 7c.67-.15 1.37-.23 2.1-.23 6 0 9.5 5.23 9.5 5.23s-1.03 1.62-2.8 3.06" />
      <path d="M10.05 10.05a2.75 2.75 0 0 0 3.9 3.9M4 4l16 16" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="9.5" cy="8.5" r="3" />
      <path d="M3.5 19a6 6 0 0 1 12 0M16 6.2a3 3 0 0 1 0 5.6M17.5 19a6 6 0 0 0-2.2-4.6" />
    </svg>
  );
}

export function GaugeIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l3.5-5" />
    </svg>
  );
}

export function BriefcaseIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.4 2.4 4.6-5" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2" />
      <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" />
    </svg>
  );
}

export function CardIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 14.5h3" />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

export function ClipboardIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M8.5 11.5l2 2 4-4.5M8.5 17h7" />
    </svg>
  );
}

function StrokeIcon({ className, children }: IconProps & { readonly children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function PaletteIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.1 0 1.8-.8 1.8-1.7 0-.9-.7-1.3-.7-2.2 0-1 .8-1.6 1.8-1.6h1.9a3.7 3.7 0 0 0 3.7-3.7C20.5 7 16.7 3.5 12 3.5Z" />
      <circle cx="7.8" cy="11" r="1" />
      <circle cx="10.5" cy="7.3" r="1" />
      <circle cx="15" cy="7.8" r="1" />
    </StrokeIcon>
  );
}

export function CodeIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />
    </StrokeIcon>
  );
}

export function RocketIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M14.5 4.5c2.7-.8 4.9-.9 5.2-.7.2.3.1 2.5-.7 5.2-.9 3-3.5 6-6.8 7.9L9.1 13.8C11 10.5 11.5 5.4 14.5 4.5Z" />
      <path d="M9.1 13.8 6.5 13l2.3-3.6 3.1-.4M12.2 16.9 13 19.5l3.6-2.3.4-3.1" />
      <circle cx="15.8" cy="8.2" r="1.3" />
      <path d="M6.7 15.8c-1.3.4-2.2 2.6-2.2 3.7 1.1 0 3.3-.9 3.7-2.2" />
    </StrokeIcon>
  );
}

export function RefreshIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12a7.5 7.5 0 0 1 13.2-4.9" />
      <path d="M17.9 3.5v3.8h-3.8M6.1 20.5v-3.8h3.8" />
    </StrokeIcon>
  );
}

export function SettingsIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" />
      <circle cx="12" cy="12" r="6.2" />
    </StrokeIcon>
  );
}

export function SignOutIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M13.5 4.5h-7a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h7M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </StrokeIcon>
  );
}

export function ChevronRightIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </StrokeIcon>
  );
}

/** A mouse whose wheel rolls down when given the `scroll-wheel` class's animation (apps/website/app/globals.css). */
export function MouseIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <rect x="6.5" y="3" width="11" height="18" rx="5.5" />
      <path className="scroll-wheel" d="M12 7v3" />
    </StrokeIcon>
  );
}

export function TapIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M9.5 13V6a1.5 1.5 0 0 1 3 0v5l4 .8a2 2 0 0 1 1.6 2.2l-.5 3.7a3 3 0 0 1-3 2.6h-2.4a3 3 0 0 1-2.4-1.2l-2.5-3.4a1.4 1.4 0 0 1 2.2-1.7Z" />
      <path d="M6.5 6H5M16.5 6H15M7.6 3.1 6.8 2.3M14.4 3.1l.8-.8" />
    </StrokeIcon>
  );
}

export function BellIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.3 5.8-1.9 6.4a.8.8 0 0 0 .6 1.3h14.6a.8.8 0 0 0 .6-1.3C19.3 14.8 18 13.2 18 9Z" />
      <path d="M10 20a2.3 2.3 0 0 0 4 0" />
    </StrokeIcon>
  );
}

export function EllipsisIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="2.5" />
    </StrokeIcon>
  );
}

export function CopyIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </StrokeIcon>
  );
}

export function SmileIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.8 14.2a4 4 0 0 0 6.4 0" />
      <path d="M9.4 9.6h.01M14.6 9.6h.01" strokeWidth="2" />
    </StrokeIcon>
  );
}

export function BookIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </StrokeIcon>
  );
}

export function PencilIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M16.2 4.3a1.9 1.9 0 0 1 2.7 2.7L8.6 17.3l-3.6.9.9-3.6Z" />
      <path d="M14.6 5.9 18 9.3" />
    </StrokeIcon>
  );
}

export function LifebuoyIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m6 6 3.4 3.4M18 6l-3.4 3.4M18 18l-3.4-3.4M6 18l3.4-3.4" />
    </StrokeIcon>
  );
}

export function ClockIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </StrokeIcon>
  );
}

export function CalendarIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
    </StrokeIcon>
  );
}

export function DownloadIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </StrokeIcon>
  );
}

export function PhotoIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.75" cy="9.5" r="1.5" />
      <path d="m4 17 4.75-4.5 3.5 3.25 2.75-2.5 5 4.75" />
    </StrokeIcon>
  );
}

export function StarIcon({ className }: IconProps): ReactElement {
  return (
    <StrokeIcon className={className}>
      <path d="m12 3.75 2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.77l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83z" />
    </StrokeIcon>
  );
}
