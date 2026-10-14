import Image from "next/image";
import type { ReactElement, ReactNode } from "react";
import type { BusinessFaq, BusinessProduct, BusinessService, DirectoryClaim, DirectoryProfile } from "@fynix/db";
import { WEEKDAYS } from "@fynix/shared/lib/onboarding/business-fields";
import type { OpeningHours } from "@fynix/shared/lib/onboarding/hours";
import { ArrowIcon } from "@fynix/shared/ui/icons";
import { Button, ButtonLink, ExternalButtonLink } from "@fynix/shared/ui/panel/button";
import { BusinessIdLine } from "@/components/panel/business/business-id-line";
import { StatusLine } from "@/components/panel/status-line";
import { type Brand } from "@/lib/brand";
import { profileHref } from "@/lib/business-profile-notices";
import { CONTACT_OPTION_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/business-profile-fields";
import { pageTabLabel } from "@fynix/shared/lib/directory/page-tabs";
import { canPublish, isPublished, isTakenDown, missingForPublish, type ProfileState, type ProfileTabId } from "@/lib/business-profile";
import { ownPictureHref } from "@/lib/photos-view";
import { youtubeWatchUrl } from "@/lib/youtube-video";

interface ReviewTabProps {
  readonly businessName: string;
  readonly claim: DirectoryClaim | null;
  readonly profile: DirectoryProfile | null;
  readonly hours: readonly OpeningHours[];
  /** The featured photo shown to the owner, or null. */
  readonly photoId: string | null;
  /** The banner shown to the owner, or null. */
  /** How many gallery photos are added. */
  readonly galleryCount: number;
  readonly services: readonly BusinessService[];
  readonly faqs: readonly BusinessFaq[];
  readonly products: readonly BusinessProduct[];
  readonly state: ProfileState;
  /** Where the business is listed, in words: "Dentists in Naupada, Thane", or null before the Listing tab. */
  readonly listedAs: string | null;
  /** Numbers as the owner reads them. */
  readonly phoneText: string | null;
  readonly whatsappText: string | null;
  /** The business's page on the local directory, once it is live. */
  readonly pageUrl: string | null;
  readonly supportEmail: string;
  /** The brand the dashboard is sold under: it names the directory the page goes live on. */
  readonly brand: Brand;
  readonly publishAction: (formData: FormData) => Promise<void>;
  /** The Verify section's body (components/panel/business/verify-business.tsx), or null when there is nothing to show. */
  readonly verification: ReactNode;
}

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const TAB_NAMES: Readonly<Record<ProfileTabId, string>> = {
  details: "Identity",
  listing: "Listing",
  services: "Services",
  products: "Products",
  faq: "FAQ",
  photos: "Photos",
  contact: "Contact options",
  reviews: "Reviews",
  promotions: "Promotions",
  trust: "Trust",
  "page-tabs": "Page tabs",
  review: "Review",
};

function hoursLine(day: OpeningHours): string {
  const name = WEEKDAYS[day.dayOfWeek] ?? "";
  if (day.mode === "closed") return `${name}: closed`;
  if (day.mode === "all-day") return `${name}: open 24 hours`;
  return `${name}: ${day.opensAt} to ${day.closesAt}`;
}

interface PartProps {
  readonly title: string;
  readonly tab: ProfileTabId;
  /** False hides Edit: a live claimed listing's part, or a business staff took down. */
  readonly editable: boolean;
  readonly children: ReactNode;
}

/** One part of the summary: a heading, an Edit link to its tab, and what was saved there. */
function Part({ title, tab, editable, children }: PartProps): ReactElement {
  return (
    <section className="border-t border-line py-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="panel-section">{title}</h2>
        {editable ? (
          <ButtonLink href={profileHref(tab)} variant="quiet" size="sm">
            Edit<span className="sr-only"> {title.toLowerCase()}</span>
          </ButtonLink>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Facts({ facts }: { readonly facts: readonly { readonly label: string; readonly value: ReactNode }[] }): ReactElement {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-[0.8125rem] text-ink-soft">{fact.label}</dt>
          <dd className="mt-1.5 break-words text-sm">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function Empty({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className="text-sm text-ink-soft">{children}</p>;
}

/** Where the business stands, and what Publish does or did. */
function Standing({ props }: { readonly props: ReviewTabProps }): ReactElement {
  const { state, claim, pageUrl, publishAction, supportEmail } = props;
  if (isTakenDown(state)) {
    return (
      <div className="space-y-2">
        <StatusLine tone="stopped">{"Taken off the local directory"}</StatusLine>
        <p className="text-sm text-ink-soft">
          Email us at{" "}
          <a href={`mailto:${supportEmail}`} className="link-underline text-ink">
            {supportEmail}
          </a>{" "}
          and we&rsquo;ll look at it with you.
        </p>
      </div>
    );
  }
  if (isPublished(state)) {
    const since = claim?.publishedAt ?? claim?.decidedAt ?? null;
    return (
      <div className="space-y-4">
        <StatusLine tone="done">
          Live · Claimed
          {since === null ? null : <span className="font-normal text-ink-soft">{` · since ${DATE.format(since)}`}</span>}
        </StatusLine>
        {pageUrl === null ? null : (
          <ExternalButtonLink href={pageUrl} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
            View your page
            <ArrowIcon className="size-4 -rotate-45" />
            <span className="sr-only">(opens in a new tab)</span>
          </ExternalButtonLink>
        )}
      </div>
    );
  }
  const missing = missingForPublish(state);
  return (
    <div className="space-y-4">
      {missing.length === 0 ? (
        <p className="text-sm text-ink-soft">{"Your page goes live on the local directory straight away, marked Claimed. You can keep changing your details after."}</p>
      ) : (
        <p className="text-sm text-ink-soft">
          Before you publish, fill in{" "}
          {missing.map((tab, index) => (
            <span key={tab}>
              {index === 0 ? null : " and "}
              <a href={profileHref(tab)} className="link-underline text-ink">
                {TAB_NAMES[tab]}
              </a>
            </span>
          ))}
          .
        </p>
      )}
      <form action={publishAction}>
        <Button type="submit" disabled={!canPublish(state)}>
          Publish my business
        </Button>
      </form>
    </div>
  );
}

/**
 * The last tab: everything the owner has given, part by part with Edit beside each, and Publish. Once published it is
 * the business's live page: where it stands and a link to it. What visitors send is on the Leads page.
 */
export function ReviewTab(props: ReviewTabProps): ReactElement {
  const { businessName, claim, profile, hours, photoId, galleryCount, services, faqs, products, state, listedAs, phoneText, whatsappText } = props;
  const editable = !isTakenDown(state);
  return (
    <div className="max-w-2xl">
      <div className="mt-8">
        <Standing props={props} />
      </div>

      {props.verification === null ? null : (
        <section className="mt-10 border-t border-line py-6">
          <h2 className="panel-section">Verification</h2>
          <div className="mt-4">{props.verification}</div>
        </section>
      )}

      <div className="mt-10">
        <Part title="Identity" tab="details" editable={editable}>
          {profile === null ? (
            <Empty>Not filled in yet.</Empty>
          ) : (
            <Facts
              facts={[
                { label: "Business name", value: businessName },
                { label: "Category", value: listedAs ?? "Not chosen yet" },
                { label: "Established", value: profile.establishedYear === null ? "Not given" : <span className="tabular-nums">{profile.establishedYear}</span> },
                { label: "Description", value: profile.about ?? "None" },
                { label: "Address", value: profile.streetAddress },
                { label: "Service area", value: profile.serviceArea ?? "Not given" },
                {
                  label: "Directions",
                  value:
                    profile.mapsUrl === null ? (
                      "None"
                    ) : (
                      <a href={profile.mapsUrl} target="_blank" rel="noopener noreferrer" className="link-underline">
                        Google Maps link
                      </a>
                    ),
                },
                { label: "Phone", value: <span className="tabular-nums">{phoneText}</span> },
                { label: "WhatsApp", value: whatsappText === null ? "None" : <span className="tabular-nums">{whatsappText}</span> },
                { label: "Email", value: profile.email ?? "None" },
                { label: "GST number", value: profile.gstNumber ?? "None" },
                { label: "Website", value: profile.websiteUrl ?? "None" },
                {
                  label: "Social profiles",
                  value: [profile.instagramUrl, profile.facebookUrl, profile.linkedinUrl].filter((url): url is string => url !== null).map((url) => (
                    <span key={url} className="block truncate">
                      {url.replace(/^https:\/\//, "")}
                    </span>
                  )),
                },
                { label: "Opening hours", value: hours.length === 0 ? "Not given" : hours.map((day) => <span key={day.dayOfWeek} className="block">{hoursLine(day)}</span>) },
                { label: "Holiday hours", value: profile.holidayHours ?? "None" },
                { label: "Open 24×7 for emergencies", value: profile.open24x7 ? "Yes" : "No" },
              ]}
            />
          )}
        </Part>

        <Part title={pageTabLabel("services", state.pageTabLabels)} tab="services" editable={editable}>
          {services.length === 0 ? <Empty>None added. They&rsquo;re optional.</Empty> : <p className="text-sm">{countOf(services.length, state.pageTabLabels.services === undefined ? "service" : "item")} listed.</p>}
        </Part>

        <Part title={pageTabLabel("products", state.pageTabLabels)} tab="products" editable={editable}>
          {products.length === 0 ? <Empty>None added. They&rsquo;re optional.</Empty> : <p className="text-sm">{countOf(products.length, state.pageTabLabels.products === undefined ? "product" : "item")} listed.</p>}
        </Part>

        <Part title="FAQ" tab="faq" editable={editable}>
          {faqs.length === 0 ? <Empty>None added. They&rsquo;re optional.</Empty> : <p className="text-sm">{countOf(faqs.length, "question")} answered.</p>}
        </Part>

        <Part title="Photos" tab="photos" editable={editable}>
          {photoId === null && galleryCount === 0 && profile?.youtubeVideoId == null ? (
            <Empty>Nothing added yet. Your page needs a feature photo before it goes live.</Empty>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                {photoId === null ? null : (
                  <Image src={ownPictureHref(photoId)} alt="Your featured photo" width={112} height={112} unoptimized className="size-28 rounded-[14px] object-cover" />
                )}
              </div>
              <p className="text-sm text-ink-soft">
                {photoId === null ? "No feature photo yet. " : ""}
                {galleryCount === 0 ? "No gallery photos." : `${countOf(galleryCount, "gallery photo")}.`}
              </p>
              {profile?.youtubeVideoId == null ? null : (
                <a href={youtubeWatchUrl(profile.youtubeVideoId)} target="_blank" rel="noopener noreferrer" className="link-underline text-sm">
                  Featured video on YouTube
                </a>
              )}
            </div>
          )}
        </Part>

        <Part title="Contact options" tab="contact" editable={editable}>
          {profile === null ? (
            <Empty>Save your Identity first.</Empty>
          ) : profile.contactOptions.length === 0 ? (
            <Empty>No buttons on your page.</Empty>
          ) : (
            <p className="text-sm">{profile.contactOptions.map((option) => CONTACT_OPTION_LABELS[option]).join(" · ")}</p>
          )}
        </Part>

        <Part title="Trust" tab="trust" editable={editable}>
          {profile === null || (profile.paymentMethods.length === 0 && profile.licences.length === 0) ? (
            <Empty>Nothing added yet. It&rsquo;s optional.</Empty>
          ) : (
            <Facts
              facts={[
                { label: "Payment methods", value: profile.paymentMethods.length === 0 ? "Not given" : profile.paymentMethods.map((method) => PAYMENT_METHOD_LABELS[method]).join(", ") },
                { label: "Licences and certifications", value: profile.licences.length === 0 ? "None" : profile.licences.map((line) => <span key={line} className="block">{line}</span>) },
              ]}
            />
          )}
        </Part>

        <Part title="Listing" tab="listing" editable={editable && !isPublished(state)}>
          {claim === null || listedAs === null ? (
            <Empty>Not chosen yet.</Empty>
          ) : (
            <div className="space-y-4">
              <p className="text-sm">{listedAs}</p>
              {claim.placeId === null ? null : <BusinessIdLine placeId={claim.placeId} />}
            </div>
          )}
        </Part>
      </div>
    </div>
  );
}
