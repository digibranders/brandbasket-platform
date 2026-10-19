import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { BUSINESS_EXTRA_CATEGORIES_MAX, findBusinessTimeZone, findPlaces, listClosures, loadGeoCatalog, withTenantScope, marketOfListing, placeUrlPath, type DirectoryClaim, type DirectoryPlace, type DirectoryProfile } from "@brandbasket/db";
import { areaName, categoryLabel, cityName, directoryCategoryPath } from "@brandbasket/shared/lib/directory/places";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { BusinessIdLine } from "@/components/panel/business/business-id-line";
import { DetailsForm, type DetailsValues } from "@/components/panel/business/details-form";
import { ClosuresPanel } from "@/components/panel/details/closures-panel";
import { ContactTab } from "@/components/panel/business/contact-tab";
import { ExtraCategories } from "@/components/panel/business/extra-categories";
import { FaqTab } from "@/components/panel/business/faq-tab";
import { ListingForm } from "@/components/panel/business/listing-form";
import { PageTabsTab, type PageTabSource } from "@/components/panel/business/page-tabs-tab";
import { PhotosTab } from "@/components/panel/business/photos-tab";
import { ProductsTab } from "@/components/panel/business/products-tab";
import { PromotionsTab } from "@/components/panel/business/promotions-tab";
import { ReviewsTab } from "@/components/panel/business/reviews-tab";
import { ServicesTab } from "@/components/panel/business/services-tab";
import { TrustTab } from "@/components/panel/business/trust-tab";
import { ProfileTabs } from "@/components/panel/business/profile-tabs";
import { ReviewTab } from "@/components/panel/business/review-tab";
import { VerifiedLine } from "@/components/panel/business/verified-line";
import { LivePreviewLayout } from "@/components/panel/live-preview/live-preview-layout";
import { StatusLine, type StatusTone } from "@/components/panel/status-line";
import { extraCategoryOptions } from "@/lib/extra-categories-form";
import { districtName, DIRECTORY_DISTRICTS, listingFormOptions } from "@/lib/business-listing-form";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { profileHref, readProfileNotice } from "@/lib/business-profile-notices";
import { isPublished, isTakenDown, nextTab, openingTab, profileTabs, type ProfileState, type ProfileTabId } from "@/lib/business-profile";
import { LISTING_ADDRESS_HOST, listingChangeRequestHref } from "@/lib/listing-address";
import { pinPlaceName, type PinLookup } from "@/lib/listing-location";
import { shownPicture } from "@/lib/photos-view";
import { getOwnVideos } from "@/lib/server/listing-videos";
import { videoAccessOf, videoTiles } from "@/lib/videos-view";
import type { OptionalPageTab } from "@brandbasket/shared/lib/directory/page-tabs";
import { GALLERY_SLOTS } from "@brandbasket/shared/lib/directory/pictures";
import { getBusinessProfilePage, getOwnExtraCategories, lookupPincode, type BusinessProfilePage } from "@/lib/server/business-profile";
import { verifiedSince } from "@/lib/server/business-verification";
import { opensClaimPages } from "@/lib/listing-sections";
import { DEALS_PATH } from "@/lib/deals";
import { LEADS_PATH } from "@/lib/leads";
import { getDealsPage } from "@/lib/server/deals";
import { ADVERTISE_PATH, getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { ensureGeoCatalog } from "@/lib/server/geo-catalog";
import { livePreviewBase, livePreviewSource } from "@/lib/server/live-preview";
import type { PreviewSection } from "@/lib/preview-draft";
import { addClosureAction, deleteClosureAction } from "@/app/app-host/(protected)/details/actions";
import { upcomingClosures } from "@brandbasket/shared/lib/business-facts/closures";
import { DEFAULT_BUSINESS_TIME_ZONE, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import {
  publishAction,
  removeFaqAction,
  removePhotoAction,
  removeProductAction,
  removeProductPhotoAction,
  removeServiceAction,
  featureClipAction,
  removeClipAction,
  removeVideoAction,
  saveContactOptionsAction,
  savePageTabsAction,
  saveDetailsAction,
  saveExtraCategoriesAction,
  saveFaqAction,
  saveListingAction,
  saveProductAction,
  saveServiceAction,
  saveTrustAction,
  saveVideoAction,
} from "./actions";

export const metadata: Metadata = { title: "Business profile" };

/** The tabs whose content shows on the business's page, so the page is shown beside them, and the card each one fills. */
const PREVIEWED_TABS: Readonly<Partial<Record<ProfileTabId, PreviewSection>>> = {
  details: "about",
  photos: "gallery",
  services: "services",
  products: "products",
  faq: "faq",
  trust: "about",
  "page-tabs": "about",
  // Where a new business is placed and where it is published: the page it is about to put live.
  listing: "about",
  review: "about",
};

/** Every area is in Thane district today (DIRECTORY_DISTRICTS). */
const DISTRICT = DIRECTORY_DISTRICTS[0]?.slug ?? "thane";

interface BusinessProfileScreenProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Where the business stands, in one line under its name. */
function standing(state: ProfileState): { readonly tone: StatusTone; readonly text: string } {
  if (isTakenDown(state)) return { tone: "stopped", text: "Taken off the local directory" };
  if (isPublished(state)) return { tone: "done", text: "Live · Claimed" };
  if (state.listing === "claimed") return state.status === "approved" ? { tone: "done", text: "Confirmed" } : { tone: "waiting", text: "Waiting for our call" };
  return { tone: "quiet", text: "Not published yet" };
}

/**
 * The Details form's starting values: the profile; for a business from before it, what its claim has; and for a new
 * account, the number it signed up with, which is most often the business's own. An account opened with a mobile
 * number carries its owner's name until the business is named, which is not offered as the business's.
 */
function detailsValues(page: BusinessProfilePage, owner: { readonly name: string; readonly phone: string | null }): DetailsValues {
  const { profile, claim } = page;
  // A claim on a business the directory had keeps the number we called, whatever an older save of this form kept.
  const phone = claim?.origin === "claimed" ? claim.phone : (profile?.phone ?? claim?.phone ?? owner.phone);
  // WhatsApp is the phone until the owner says otherwise.
  const whatsapp = profile === null ? phone : profile.whatsapp;
  const namedAfterOwner = profile === null && claim === null && page.businessName === owner.name;
  return {
    businessName: namedAfterOwner ? "" : page.businessName,
    address: profile?.streetAddress ?? claim?.streetAddress ?? "",
    phone: phone === null ? "" : displayPhone(phone).text,
    whatsappSame: profile === null || (whatsapp !== null && whatsapp === phone),
    whatsapp: whatsapp === null || whatsapp === phone ? "" : displayPhone(whatsapp).text,
    maps: profile?.mapsUrl ?? "",
    directionsNote: profile?.directionsNote ?? "",
    website: profile?.websiteUrl ?? claim?.websiteUrl ?? "",
    email: profile?.email ?? "",
    gstNumber: profile?.gstNumber ?? "",
    instagram: profile?.instagramUrl ?? "",
    facebook: profile?.facebookUrl ?? "",
    linkedin: profile?.linkedinUrl ?? "",
    about: profile?.about ?? "",
    establishedYear: profile?.establishedYear === null || profile === null ? "" : String(profile.establishedYear),
    serviceArea: profile?.serviceArea ?? "",
    holidayHours: profile?.holidayHours ?? "",
    open24x7: profile?.open24x7 ?? false,
    hours: page.hours,
  };
}

/**
 * "Dentists in Naupada, Thane": where the business is listed, in words. Outside the opened districts, its locality and
 * district: "Dentists in Salt Lake Sector V, North 24 Parganas".
 */
function listedAs(claim: DirectoryClaim, pin: PinLookup | null): string {
  const market = marketOfListing(claim.listingKey);
  const category = categoryLabel(market.categorySlug) ?? market.categorySlug;
  if (claim.localityName !== null) {
    return pin?.kind === "elsewhere" ? `${category} in ${claim.localityName}, ${pin.districtName}` : `${category} in ${claim.localityName}`;
  }
  const area = areaName(market.citySlug, market.areaSlug) ?? market.areaSlug;
  const town = cityName(market.citySlug) ?? market.citySlug;
  return `${category} in ${area}, ${town}`;
}

/** Where the business is on the website: the full address to link, and the same written out for an email. */
interface WebsiteAddress {
  readonly url: string;
  readonly text: string;
}

/**
 * The claim's place (its Business ID and web address), or null for a claim from before places. The place is
 * staff-only data (see 0076), read here for the claim the caller has already proved is this account's.
 */
/**
 * The areas an owner can pick as the service area: the catalog's areas that are switched on, in the business's own
 * city when it has a listing, else every one, by name and without repeats.
 */
async function serviceAreaOptions(claim: DirectoryClaim | null): Promise<readonly string[]> {
  const catalog = await loadGeoCatalog(getStaffDb());
  const citySlug = claim === null ? null : marketOfListing(claim.listingKey).citySlug;
  const names = catalog.areas
    .filter((area) => area.status === "on" && (citySlug === null || area.citySlug === citySlug))
    .map((area) => area.name);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

async function placeOf(claim: DirectoryClaim): Promise<DirectoryPlace | null> {
  if (claim.placeId === null) return null;
  return (await findPlaces(getStaffDb(), [claim.placeId])).get(claim.placeId) ?? null;
}

/**
 * The business's own page once it has a place, /in/<state>/business/<name>/<code>; before that, its category's page
 * in its area. A business outside the opened districts has no category page, so with no place it has no address yet.
 */
function websiteAddressOf(claim: DirectoryClaim, place: DirectoryPlace | null): WebsiteAddress | null {
  const market = marketOfListing(claim.listingKey);
  if (place === null && claim.pincode !== null) return null;
  const path = place === null ? directoryCategoryPath(market.areaSlug, market.categorySlug) : placeUrlPath(place);
  return { url: new URL(path, siteConfig.url).toString(), text: `${LISTING_ADDRESS_HOST}${path}` };
}

function phoneText(stored: string | null): string | null {
  return stored === null ? null : displayPhone(stored).text;
}

interface ListingTabProps {
  readonly claim: DirectoryClaim | null;
  readonly profile: DirectoryProfile | null;
  readonly state: ProfileState;
  readonly businessName: string;
  /** The claim's address on the website (websiteAddressOf); null with no claim. */
  readonly address: WebsiteAddress | null;
  /** What the claim's PIN is (lookupPincode); null for an opened-district claim, which stores none. */
  readonly pin: PinLookup | null;
  /** The categories the business also lists in. */
  readonly extras: readonly string[];
  /** Where the business writes for help (lib/brand.ts supportEmailOf). */
  readonly supportEmail: string;
}

/** The Listing tab: the picks, then the Business ID they gave; open for an added business, live or not, and fixed for a claimed listing. */
function ListingTab({ claim, profile, state, businessName, address, pin, extras, supportEmail }: ListingTabProps): ReactElement {
  if (claim === null && profile === null) {
    return (
      <div className="mt-8 max-w-2xl space-y-4">
        <p className="text-sm text-ink-soft">Your listing needs your business&rsquo;s name, address and phone. Fill in your Details first.</p>
        <ButtonLink href={profileHref("details")} variant="secondary" size="sm">
          Go to Details
        </ButtonLink>
      </div>
    );
  }
  if (claim === null) {
    return (
      <ListingForm action={saveListingAction} saved={null} options={listingFormOptions()} supportEmail={supportEmail} />
    );
  }

  const market = marketOfListing(claim.listingKey);
  const businessId = claim.placeId === null ? null : (
    <div className="mt-8">
      <BusinessIdLine placeId={claim.placeId} />
    </div>
  );
  const alsoListed =
    claim.status === "rejected" ? null : (
      <ExtraCategories
        action={saveExtraCategoriesAction}
        options={extraCategoryOptions(market.categorySlug)}
        saved={extras}
        mainLabel={categoryLabel(market.categorySlug) ?? market.categorySlug}
        canChange={!isTakenDown(state)}
        max={BUSINESS_EXTRA_CATEGORIES_MAX}
      />
    );
  // A business already listed by PIN code (before the PIN step was taken out) is outside the district form: it
  // keeps the read-only view below, and changes through us. An added business keeps the form once it is live.
  if (claim.origin === "added" && claim.status !== "rejected" && claim.pincode === null) {
    return (
      <>
        {businessId}
        <ListingForm
          action={saveListingAction}
          saved={{ districtSlug: DISTRICT, areaSlug: market.areaSlug, categorySlug: market.categorySlug }}
          options={listingFormOptions()}
          supportEmail={supportEmail}
        />
        {alsoListed}
        {isPublished(state) ? null : (
          <div className="mt-10">
            <ButtonLink href={profileHref("review")} variant="secondary">
              Next: Review &amp; publish
              <ArrowIcon className="size-4" />
            </ButtonLink>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="max-w-2xl">
      {businessId}
      <dl className="mt-8 grid gap-x-8 gap-y-5 border-t border-line pt-6 sm:grid-cols-3">
        {[
          ...(claim.pincode === null
            ? [
                { label: "District", value: districtName(DISTRICT) ?? DISTRICT },
                { label: "Area", value: `${areaName(market.citySlug, market.areaSlug) ?? market.areaSlug}, ${cityName(market.citySlug) ?? market.citySlug}` },
              ]
            : [
                { label: "PIN code", value: [claim.pincode, pin === null ? null : pinPlaceName(pin)].filter((part) => part !== null).join(" · ") },
                { label: "Locality", value: claim.localityName ?? market.areaSlug },
              ]),
          { label: "Category", value: categoryLabel(market.categorySlug) ?? market.categorySlug },
        ].map((fact) => (
          <div key={fact.label}>
            <dt className="text-[0.8125rem] text-ink-soft">{fact.label}</dt>
            <dd className="mt-1.5 text-sm">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {isTakenDown(state) ? null : (
        <a
          href={listingChangeRequestHref(supportEmail, businessName, address?.text ?? claim.listingKey)}
          className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent"
        >
          Ask us to change where you&rsquo;re listed
          <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
        </a>
      )}
      {alsoListed}
    </div>
  );
}

const VERIFIED_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** The Review tab's Verification section: the done line once the business is verified, nothing before. */
async function verificationSection(customer: Awaited<ReturnType<typeof requireCustomerAccess>>): Promise<ReactElement | null> {
  const verifiedAt = await verifiedSince(customer);
  return verifiedAt === null ? null : <VerifiedLine since={VERIFIED_DATE.format(verifiedAt)} />;
}

/** The count and a word for it: "1 service", "3 services". */
function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Like `counted`, but a tab the owner named themselves ("Menu") counts "items": "service" would be the wrong word for a dish. */
function countedAs(count: number, ownName: string | undefined, one: string, many: string): string {
  return ownName === undefined ? counted(count, one, many) : counted(count, "item", "items");
}

/** Where each optional tab on the public page is filled in, and what it holds now. */
function pageTabSources({ state, running }: { readonly state: ProfileState; readonly running: number }): Record<OptionalPageTab, PageTabSource> {
  return {
    offers: {
      href: DEALS_PATH,
      summary: running === 0 ? "No deal running. Post one from Deals." : `${counted(running, "deal", "deals")} running now`,
      ready: running > 0,
    },
    services: {
      href: profileHref("services"),
      summary: state.serviceCount === 0 ? "Nothing added yet." : countedAs(state.serviceCount, state.pageTabLabels.services, "service", "services"),
      ready: state.serviceCount > 0,
    },
    products: {
      href: profileHref("products"),
      summary: state.productCount === 0 ? "Nothing added yet." : countedAs(state.productCount, state.pageTabLabels.products, "product", "products"),
      ready: state.productCount > 0,
    },
    faq: {
      href: profileHref("faq"),
      summary: state.faqCount === 0 ? "Nothing added yet." : counted(state.faqCount, "question", "questions"),
      ready: state.faqCount > 0,
    },
    trust: {
      href: profileHref("trust"),
      summary: state.hasTrust ? "Payment methods and licences added." : "Payment methods and licences. Nothing added yet.",
      ready: state.hasTrust,
    },
    appointment: {
      href: LEADS_PATH,
      summary: "Visitors ask for a day and time. Each request arrives in Leads.",
      ready: true,
      linkLabel: "View requests",
    },
  };
}

/**
 * A free listing account's Business profile (docs/superpowers/specs/2026-10-01-business-profile-design.md): Details,
 * Photos, Listing, then Review & publish. A new business fills them in in that order; the Listing tab gives it its
 * Business ID, and Publish puts its page live as Claimed, with no call from us. Once live, the tabs are where it keeps
 * its details up to date.
 */
export default async function BusinessProfileScreen({ searchParams }: BusinessProfileScreenProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  // The layout refreshes the catalog too, but a layout and its page render side by side: read the lists below only
  // after the places are current.
  const [kind, page, params] = await Promise.all([
    getCustomerBusinessKind(customer.tenant.userId, customer.tenant.businessId),
    getBusinessProfilePage(customer),
    searchParams,
    ensureGeoCatalog(),
  ]);
  // A Premium member keeps the profile of the business it claimed while free (lib/listing-sections.ts). Any other
  // website client's directory entry lives on its own Listing tab (/listing), not here.
  if (!opensClaimPages(kind, page.claim !== null)) notFound();
  const { claim, profile, state } = page;
  const [place, pin] =
    claim === null ? [null, null] : await Promise.all([placeOf(claim), claim.pincode === null ? null : lookupPincode(claim.pincode)]);
  const address = claim === null ? null : websiteAddressOf(claim, place);
  const extras = claim === null ? [] : await getOwnExtraCategories(customer);
  const tab: ProfileTabId = openingTab(state, typeof params.tab === "string" ? params.tab : undefined);
  const tabs = profileTabs(state);
  const brand = await requestBrand();
  const supportEmail = supportEmailOf(brand);
  const found = readProfileNotice(params.notice, state.pageTabLabels);
  const notice = found === null ? null : { ...found, text: found.text };
  const status = standing(state);
  const after = nextTab(state, tab);
  const nextView = after === null ? null : (tabs.find((view) => view.id === after) ?? null);
  const nextLink = nextView === null ? null : { id: nextView.id, label: nextView.label };
  const live = isPublished(state);
  const photo = shownPicture(page.slots.listing);

  let body: ReactElement;
  if (tab === "details") {
    const serviceAreas = await serviceAreaOptions(claim);
    const { closures, timeZone } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => ({
      closures: await listClosures(tx),
      timeZone: await findBusinessTimeZone(tx, customer.tenant.businessId),
    }));
    const today = localDateIn(timeZone ?? DEFAULT_BUSINESS_TIME_ZONE, new Date());
    body = (
      <>
        <DetailsForm
          serviceAreas={serviceAreas}
          action={saveDetailsAction}
          initial={detailsValues(page, customer.user)}
          submitLabel={live || state.listing === "claimed" ? "Save" : "Save and continue"}
          claimed={state.listing === "claimed"}
        />
        <div className="mt-10 border-t border-line pt-8">
          {profile?.holidayHours ? <p className="mb-4 text-sm text-ink-soft">Your earlier note: {profile.holidayHours}</p> : null}
          <ClosuresPanel
            closures={upcomingClosures(closures, today)}
            today={today}
            addAction={addClosureAction}
            deleteAction={deleteClosureAction}
            heading="Holidays"
            itemNoun="holiday"
            notePlaceholder="Diwali"
            withHours
          />
        </div>
      </>
    );
  } else if (tab === "services") {
    body = <ServicesTab services={page.services} label={state.pageTabLabels.services ?? null} canChange={!isTakenDown(state)} saveAction={saveServiceAction} removeAction={removeServiceAction} next={nextLink} />;
  } else if (tab === "products") {
    body = <ProductsTab products={page.products} label={state.pageTabLabels.products ?? null} canChange={!isTakenDown(state)} saveAction={saveProductAction} removeAction={removeProductAction} removePhotoAction={removeProductPhotoAction} next={nextLink} />;
  } else if (tab === "faq") {
    body = <FaqTab faqs={page.faqs} canChange={!isTakenDown(state)} saveAction={saveFaqAction} removeAction={removeFaqAction} next={nextLink} />;
  } else if (tab === "contact") {
    body = <ContactTab profile={profile} canChange={!isTakenDown(state)} saveAction={saveContactOptionsAction} next={nextLink} />;
  } else if (tab === "reviews") {
    body = <ReviewsTab next={nextLink} />;
  } else if (tab === "promotions") {
    body = <PromotionsTab advertiseHref={ADVERTISE_PATH} next={nextLink} />;
  } else if (tab === "trust") {
    body = <TrustTab profile={profile} canChange={!isTakenDown(state)} saveAction={saveTrustAction} next={nextLink} />;
  } else if (tab === "page-tabs") {
    const deals = await getDealsPage(customer, new Date());
    const running = deals.deals.filter((deal) => deal.status === "live" && deal.endsOn >= deals.today).length;
    body = (
      <PageTabsTab
        profile={profile}
        sources={pageTabSources({ state, running })}
        canChange={!isTakenDown(state)}
        saveAction={savePageTabsAction}
        next={nextLink}
      />
    );
  } else if (tab === "photos") {
    const videos = await getOwnVideos(customer);
    body = (
      <PhotosTab
        slots={page.slots}
        videosView={videoTiles(videos, videoAccessOf(kind, claim === null ? null : claim.status))}
        removeClipAction={removeClipAction}
        featureClipAction={featureClipAction}
        videoId={profile?.youtubeVideoId ?? null}
        hasDetails={profile !== null}
        canChange={!isTakenDown(state)}
        published={live}
        removePhotoAction={removePhotoAction}
        saveVideoAction={saveVideoAction}
        removeVideoAction={removeVideoAction}
        next={nextLink}
      />
    );
  } else if (tab === "listing") {
    body = <ListingTab claim={claim} profile={profile} state={state} businessName={page.businessName} address={address} pin={pin} extras={extras} supportEmail={supportEmail} />;
  } else {
    body = (
      <ReviewTab
        businessName={page.businessName}
        claim={claim}
        profile={profile}
        hours={page.hours}
        photoId={photo?.id ?? null}
        galleryCount={GALLERY_SLOTS.filter((slot) => shownPicture(page.slots[slot]) !== null).length}
        services={page.services}
        faqs={page.faqs}
        products={page.products}
        state={state}
        listedAs={claim === null ? null : listedAs(claim, pin)}
        phoneText={phoneText(profile?.phone ?? null)}
        whatsappText={phoneText(profile?.whatsapp ?? null)}
        pageUrl={live ? (address?.url ?? null) : null}
        supportEmail={supportEmail}
        brand={brand}
        publishAction={publishAction}
        verification={await verificationSection(customer)}
      />
    );
  }

  // The business's page beside the tab, once it has a Business ID: drawn from the profile as our database has it now.
  const now = new Date();
  const placeId = claim?.placeId ?? null;
  const previewSection = PREVIEWED_TABS[tab];
  const previewSource = previewSection === undefined ? null : livePreviewSource(placeId, now);
  // A business its owner added is drawn from our data when the website has no page for it: before it is published, and in
  // the moment after, until the website next reads the feed.
  const added = claim !== null && claim.origin === "added" && claim.status !== "rejected" ? { claim, profile } : undefined;
  const previewBase =
    previewSource === null || placeId === null
      ? null
      : await livePreviewBase({ businessId: customer.tenant.businessId, placeId, now, ...(added === undefined ? {} : { added }) });

  return (
    <LivePreviewLayout source={previewSource} base={previewBase} section={previewSection}>
      <h1 className="panel-title">
        Business <em>profile</em>
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="text-sm font-medium">{page.businessName}</p>
        <StatusLine tone={status.tone}>{status.text}</StatusLine>
      </div>
      <ProfileTabs tabs={tabs} current={tab} />
      {notice === null ? null : (
        <p role="status" className={`mt-6 max-w-2xl rounded-control px-4 py-3 text-sm ${notice.ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}>
          {notice.text}
        </p>
      )}
      {body}
    </LivePreviewLayout>
  );
}
