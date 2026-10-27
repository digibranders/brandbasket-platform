import "server-only";
import type { BusinessProfile, MediaAsset, PrimaryDomain, ProjectBrief, Service } from "@brandbasket/db";

import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { MediaThumbnail } from "@/components/panel/media-thumbnail";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageSection } from "@/components/v2/page";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { describeHours, type OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";

const NOT_GIVEN = <span className="text-ink-2">Not given</span>;

interface SummaryCardProps {
  readonly title: string;
  /** Shown as an "Edit" link while the answers can still change. */
  readonly editHref?: string;
  readonly children: ReactNode;
}

/** One part of what the customer told us: its title with a hairline under it, and Edit while the answers can still change. */
export function SummaryCard({ title, editHref, children }: SummaryCardProps): ReactElement {
  return (
    <PageSection
      id={`summary-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      title={title}
      aside={
        editHref === undefined ? undefined : (
          <Link href={editHref} className={SOFT_BUTTON}>
            Edit<span className="sr-only"> {title.toLowerCase()}</span>
          </Link>
        )
      }
    >
      {children}
    </PageSection>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid gap-1 py-3 text-sm first:pt-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function orNotGiven(value: string | null | undefined): ReactNode {
  return value === null || value === undefined || value.trim() === "" ? NOT_GIVEN : value;
}

function multiline(value: string | null | undefined): ReactNode {
  if (value === null || value === undefined || value.trim() === "") return NOT_GIVEN;
  return <span className="whitespace-pre-line">{value}</span>;
}

function addressOf(profile: BusinessProfile): string | null {
  const parts = [
    profile.addressLine1,
    profile.addressLine2,
    profile.city,
    profile.region,
    profile.postalCode,
    profile.country,
  ].filter((part): part is string => part !== null && part.trim() !== "");
  return parts.length === 0 ? null : parts.join(", ");
}

function hoursText(day: OpeningHours | undefined): ReactNode {
  return day === undefined ? NOT_GIVEN : describeHours(day);
}

/** A link the customer gave us: clickable only when it is https, otherwise shown as plain text. */
function ExternalLink({ url }: { readonly url: string }): ReactElement {
  const href = safeExternalHref(url);
  if (href === null) return <span className="break-all">{url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-4">
      {url}
    </a>
  );
}

export function BusinessSummary({
  profile,
  hours,
}: {
  readonly profile: BusinessProfile | null;
  readonly hours: readonly OpeningHours[];
}): ReactElement {
  if (profile === null) return <p className="text-sm text-ink-2">Nothing here yet.</p>;
  return (
    <dl className="divide-y divide-line">
      <Row label="Business name">{profile.displayName}</Row>
      <Row label="Tagline">{orNotGiven(profile.tagline)}</Row>
      <Row label="Description">{multiline(profile.description)}</Row>
      <Row label="Phone">{orNotGiven(displayPhoneText(profile.phone))}</Row>
      <Row label="Email">{orNotGiven(profile.email)}</Row>
      <Row label="Address">{orNotGiven(addressOf(profile))}</Row>
      <Row label="Areas you serve">{orNotGiven(profile.serviceAreas)}</Row>
      <Row label="Google Business Profile">
        {profile.googleBusinessUrl === null || profile.googleBusinessUrl.trim() === "" ? (
          NOT_GIVEN
        ) : (
          <ExternalLink url={profile.googleBusinessUrl} />
        )}
      </Row>
      <Row label="Opening hours">
        {hours.length === 0 ? (
          NOT_GIVEN
        ) : (
          <ul className="space-y-0.5">
            {WEEKDAYS.map((label, dayOfWeek) => (
              <li key={label} className="flex gap-3">
                <span className="w-24 shrink-0 text-ink-2">{label}</span>
                <span>{hoursText(hours.find((day) => day.dayOfWeek === dayOfWeek))}</span>
              </li>
            ))}
          </ul>
        )}
      </Row>
    </dl>
  );
}

export function ServicesList({ services }: { readonly services: readonly Service[] }): ReactElement {
  if (services.length === 0) return <p className="text-sm text-ink-2">No services yet.</p>;
  return (
    <ol className="divide-y divide-line border-b border-line">
      {services.map((service) => (
        <li key={service.id} className="py-3 first:pt-0">
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
            <span className="font-semibold text-ink">{service.name}</span>
            {service.priceText === null ? null : <span className="font-figure text-[0.8125rem] tabular-nums text-ink-2">{service.priceText}</span>}
          </p>
          {service.summary === null ? null : <p className="mt-1 text-[0.8125rem] text-ink-2">{service.summary}</p>}
        </li>
      ))}
    </ol>
  );
}

export function ContentSummary({
  services,
  brief,
}: {
  readonly services: readonly Service[];
  readonly brief: ProjectBrief | null;
}): ReactElement {
  return (
    <div className="space-y-5">
      <ServicesList services={services} />
      <dl className="divide-y divide-line">
        <Row label="Anything else">{multiline(brief?.notesForBuilder)}</Row>
        <Row label="How it should feel">{multiline(brief?.styleLikes)}</Row>
        <Row label="Websites you like">
          {brief === null || brief.referenceUrls.length === 0 ? (
            NOT_GIVEN
          ) : (
            <ul className="space-y-0.5">
              {brief.referenceUrls.map((url, index) => (
                // Links may repeat, so the position is the key.
                <li key={index}>
                  <ExternalLink url={url} />
                </li>
              ))}
            </ul>
          )}
        </Row>
      </dl>
    </div>
  );
}

export function BrandSummary({
  logo,
  photos,
}: {
  readonly logo: MediaAsset | null;
  readonly photos: readonly MediaAsset[];
}): ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[0.8125rem] text-ink-2">Logo</h3>
        {logo === null ? (
          <p className="mt-1 text-sm">No logo. We’ll set your name in a clean typeface.</p>
        ) : (
          <div className="mt-2 w-40">
            <MediaThumbnail asset={logo} alt="Your logo" fit="contain" />
          </div>
        )}
      </div>
      <div>
        <h3 className="text-[0.8125rem] text-ink-2">Photos</h3>
        {photos.length === 0 ? (
          <p className="mt-1 text-sm">No photos.</p>
        ) : (
          <ul className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id}>
                <MediaThumbnail asset={photo} alt={photo.altText ?? ""} />
                <p className="mt-2 text-sm">{orNotGiven(photo.altText)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export async function DomainSummary({ domain }: { readonly domain: PrimaryDomain | null }): Promise<ReactElement> {
  const temporary = domain !== null && isTemporarySubdomain(domain.hostname);
  return (
    <dl className="divide-y divide-line">
      <Row label="Domain">
        {domain === null ? (
          NOT_GIVEN
        ) : (
          <>
            <span className="font-medium">{domain.hostname}</span>
            {temporary ? <span className="text-ink-2"> (free, temporary)</span> : null}
          </>
        )}
      </Row>
      <Row label="Yours to change">
        {domain === null
          ? NOT_GIVEN
          : temporary
            ? "A temporary address, not yours to change"
            : domain.ownerConfirmedAt === null
              ? "Not confirmed yet"
              : "Confirmed"}
      </Row>
    </dl>
  );
}

/** Shown on every step, the review and the project page once onboarding has been sent. */
export function LockedNotice(): ReactElement {
  return (
    <p role="status" className="rounded-lg bg-rattan-wash px-4 py-3 text-sm text-rattan-ink">
      You’ve sent this to us, so these answers are locked. To change anything now,{" "}
      <Link href="/project" className="font-semibold underline underline-offset-4">
        see Your project
      </Link>
      .
    </p>
  );
}
