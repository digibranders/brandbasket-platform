import type {
  DirectoryFeedAddedListing,
  DirectoryFeedAddedProfile,
  DirectoryFeedFaq,
  DirectoryFeedProduct,
  DirectoryFeedService,
} from "@brandbasket/shared/lib/directory/feed-contract";
import { RENAMABLE_PAGE_TABS, checkPageTabLabel, type RenamablePageTab } from "@brandbasket/shared/lib/directory/page-tabs";
import { SERVICE_DEFAULT_CATEGORY } from "@/lib/business-profile-fields";

/*
 * What the dashboard sends the live preview (the website's lib/preview-draft.ts takes it): what the owner has typed
 * but not saved, and for an owner's Business profile and Deals, what they have saved too, read from our database so the
 * preview does not wait for the website to hear of it. Two kinds of page send two kinds of draft:
 *
 *  - A client's Listing and Your details pages send only what has been changed from the page as it loaded: the About
 *    line, the tagline and its colour, the announcement and the week's hours.
 *  - An owner's Business and Deals pages send the whole profile (`PreviewBase`) with whatever is typed in the forms on
 *    top: those forms save as they go, so the saved profile is always the starting point.
 */

export interface PreviewHours {
  /** 0 = Monday ... 6 = Sunday. */
  readonly day: number;
  readonly opens: string;
  readonly closes: string;
}

/** One offer on show, as the page's Offers card prints it. */
export interface PreviewOffer {
  readonly id: string;
  readonly badge: string;
  readonly title: string;
  readonly terms: string;
}

/**
 * The ids of the saved rows behind the profile's lists, in the order the lists have them: the forms on the page are named
 * by them, so what is typed into one can be matched to its place in the list.
 */
export interface PreviewIds {
  readonly offers: readonly string[];
  readonly services: readonly string[];
  readonly products: readonly string[];
  readonly faqs: readonly string[];
}

/** The owner's saved profile as the directory's feed would carry it, with their feature photo and the offers on show. */
export interface PreviewBase {
  readonly owner: DirectoryFeedAddedProfile;
  readonly photo: string | null;
  readonly offers: readonly PreviewOffer[];
  /**
   * For a business that is not live yet: the business as the directory will receive it once published, which the
   * website draws the page from since it holds none. Absent once the page is live (the website has it).
   */
  readonly entry?: DirectoryFeedAddedListing;
  readonly ids: PreviewIds;
}

export interface PreviewDraft {
  readonly entry?: DirectoryFeedAddedListing;
  readonly address?: string;
  readonly about?: string | null;
  readonly tagline?: { readonly text: string; readonly colour: string } | null;
  readonly announcement?: string | null;
  readonly hours?: readonly PreviewHours[];
  readonly owner?: DirectoryFeedAddedProfile;
  readonly name?: string;
  readonly website?: string;
  readonly photo?: string | null;
  readonly offers?: readonly PreviewOffer[];
}

/** What is typed in a deal's form: its offer line, stamp and small print. */
export interface PreviewOfferFields {
  readonly badge: string;
  readonly title: string;
  readonly terms: string;
}

/** The form fields currently on the page; a key is absent when its field is not there. */
export interface PreviewFields {
  readonly about?: string;
  readonly tagline?: { readonly text: string; readonly colour: string };
  readonly announcement?: string;
  readonly hours?: readonly PreviewHours[];
  readonly name?: string;
  readonly website?: string;
  readonly address?: string;
  readonly establishedYear?: string;
  readonly gstNumber?: string;
  readonly serviceArea?: string;
  readonly socials?: { readonly instagram: string; readonly facebook: string; readonly linkedin: string };
  readonly open24x7?: boolean;
  /** An offer being typed into the "new deal" form, and the edits to saved ones, by deal id. */
  readonly newOffer?: PreviewOfferFields;
  readonly editedOffers?: Readonly<Record<string, PreviewOfferFields>>;
  /** The optional tabs ticked on the Page tabs tab, and the payment methods and licences on the Trust tab. */
  readonly pageTabs?: readonly string[];
  /** What is typed in the name boxes of the Page tabs tab, as typed (a blank one means the usual word). */
  readonly pageTabLabels?: Readonly<Partial<Record<RenamablePageTab, string>>>;
  readonly paymentMethods?: readonly string[];
  readonly licences?: readonly string[];
  /**
   * Services, products and questions as their forms hold them: one entry for each saved row, in the list's order, with
   * undefined where the form is not on the page or is not complete; and the one being typed into the "add" form.
   */
  readonly services?: readonly (DirectoryFeedService | undefined)[];
  readonly newService?: DirectoryFeedService;
  readonly products?: readonly (DirectoryFeedProduct | undefined)[];
  readonly newProduct?: DirectoryFeedProduct;
  readonly faqs?: readonly (DirectoryFeedFaq | undefined)[];
  readonly newFaq?: DirectoryFeedFaq;
}

/** The message the dashboard sends the preview, and the one it sends back once it can take drafts. */
export const PREVIEW_DRAFT_MESSAGE = "brandbasket-preview-draft";
export const PREVIEW_READY_MESSAGE = "brandbasket-preview-ready";
/** Asks the preview to bring a card of the page into view: the one the tab being edited fills. */
export const PREVIEW_SECTION_MESSAGE = "brandbasket-preview-section";

/** The cards of the business's page the preview can scroll to (their ids on the website). */
export type PreviewSection = "about" | "offers" | "services" | "products" | "faq" | "gallery";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SOCIAL_NETWORKS = ["instagram", "facebook", "linkedin"] as const;

/** Looks up a form field's current value by CSS selector; null when the page has no such field. */
export type FieldLookup = (selector: string) => string | null;
/** Looks up whether a checkbox is ticked; null when the page has no such checkbox. */
export type CheckedLookup = (selector: string) => boolean | null;
/** The values of the ticked boxes of a group, by their `name`; null when the page has no such group. */
export type TickedLookup = (name: string) => readonly string[] | null;

/** The lookups for the fields inside `root`. */
export function fieldsIn(root: ParentNode): { readonly value: FieldLookup; readonly checked: CheckedLookup; readonly ticked: TickedLookup } {
  return {
    ticked: (name) => {
      const boxes = [...root.querySelectorAll(`input[type="checkbox"][name="${name}"]`)].filter(
        (box): box is HTMLInputElement => box instanceof HTMLInputElement,
      );
      return boxes.length === 0 ? null : boxes.filter((box) => box.checked).map((box) => box.value);
    },
    value: (selector) => {
      const field = root.querySelector(selector);
      return field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement ? field.value : null;
    },
    checked: (selector) => {
      const field = root.querySelector(selector);
      return field instanceof HTMLInputElement ? field.checked : null;
    },
  };
}

/** The week as the editor shows it: an open day with both times, or an open-all-day one; closed and unset days have no row. */
function hoursOn(valueOf: FieldLookup): readonly PreviewHours[] | undefined {
  const modes = DAYS.map((day) => valueOf(`[name="hours.${String(day)}.mode"]`));
  if (modes.every((mode) => mode === null)) return undefined;
  const rows: PreviewHours[] = [];
  DAYS.forEach((day, index) => {
    const mode = modes[index];
    if (mode === "all-day") rows.push({ day, opens: "00:00", closes: "24:00" });
    if (mode !== "open") return;
    const opens = valueOf(`[name="hours.${String(day)}.opens"]`) ?? "";
    const closes = valueOf(`[name="hours.${String(day)}.closes"]`) ?? "";
    if (TIME.test(opens) && TIME.test(closes) && opens !== closes) rows.push({ day, opens, closes });
  });
  return rows;
}

/** A deal's form. `input#` because the Deals page also has a heading with the id `new-deal-title`. */
function offerFieldsAt(valueOf: FieldLookup, prefix: string): PreviewOfferFields | undefined {
  const title = valueOf(`input#${prefix}-title`);
  if (title === null) return undefined;
  return { title, badge: valueOf(`input#${prefix}-badge`) ?? "", terms: valueOf(`input#${prefix}-terms`) ?? "" };
}

/** The limits the website's feed reader holds each field to; a longer value would cost the whole preview, so it is cut. */
const LIMITS = { name: 80, category: 60, description: 300, area: 120, question: 150, answer: 600, price: 10_000_000, minutes: 1440 } as const;

function clip(value: string | null, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

/** A whole number within `min` and `max` from what was typed, else undefined. */
function wholeNumber(value: string | null, min: number, max: number): number | undefined {
  const trimmed = (value ?? "").trim();
  if (!/^\d{1,12}$/.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return number >= min && number <= max ? number : undefined;
}

/** One licence a line, as the Trust tab takes them. */
function licencesOf(text: string): readonly string[] {
  return text
    .split("\n")
    .map((line) => line.trim().slice(0, 100))
    .filter((line) => line !== "");
}

function serviceAt(valueOf: FieldLookup, prefix: string): DirectoryFeedService | undefined {
  const name = clip(valueOf(`#${prefix}-name`), LIMITS.name);
  if (name === "") return undefined;
  const description = clip(valueOf(`#${prefix}-description`), LIMITS.description);
  const area = clip(valueOf(`#${prefix}-area`), LIMITS.area);
  const price = wholeNumber(valueOf(`#${prefix}-price`), 0, LIMITS.price);
  const minutes = wholeNumber(valueOf(`#${prefix}-duration`), 1, LIMITS.minutes);
  return {
    category: SERVICE_DEFAULT_CATEGORY,
    name,
    ...(description === "" ? {} : { description }),
    ...(price === undefined ? {} : { priceInr: price }),
    ...(minutes === undefined ? {} : { durationMinutes: minutes }),
    ...(area === "" ? {} : { serviceArea: area }),
  };
}

const AVAILABILITY = ["in_stock", "out_of_stock", "made_to_order"] as const;

function productAt(valueOf: FieldLookup, prefix: string): DirectoryFeedProduct | undefined {
  const name = clip(valueOf(`#${prefix}-name`), LIMITS.name);
  if (name === "") return undefined;
  const category = clip(valueOf(`#${prefix}-category`), LIMITS.category);
  const description = clip(valueOf(`#${prefix}-description`), LIMITS.description);
  const price = wholeNumber(valueOf(`#${prefix}-price`), 0, LIMITS.price);
  const chosen = valueOf(`#${prefix}-availability`);
  const availability = AVAILABILITY.find((option) => option === chosen) ?? "in_stock";
  return {
    name,
    ...(description === "" ? {} : { description }),
    ...(price === undefined ? {} : { priceInr: price }),
    ...(category === "" ? {} : { category }),
    availability,
  };
}

function faqAt(valueOf: FieldLookup, prefix: string): DirectoryFeedFaq | undefined {
  const question = clip(valueOf(`#${prefix}-question`), LIMITS.question);
  const answer = clip(valueOf(`#${prefix}-answer`), LIMITS.answer);
  return question === "" || answer === "" ? undefined : { question, answer };
}

/** Every field this page has, as it stands now. `ids` are the saved rows whose edit forms may be on the page. */
export function readPreviewFields(
  valueOf: FieldLookup,
  checkedOf: CheckedLookup = () => null,
  ids?: PreviewIds,
  tickedOf: TickedLookup = () => null,
): PreviewFields {
  const about = valueOf("#listing-about") ?? valueOf("#details-about");
  const tagline = valueOf("#listing-tagline");
  const colour = valueOf('input[name="colour"]:checked');
  const announcement = valueOf("#announcement-message");
  const hours = hoursOn(valueOf);
  const name = valueOf("#details-name");
  const website = valueOf("#details-website");
  const address = valueOf("#details-address");
  const establishedYear = valueOf("#details-year");
  const gstNumber = valueOf("#details-gst");
  const serviceArea = valueOf("#details-area");
  const socials = SOCIAL_NETWORKS.map((network) => valueOf(`[name="${network}"]`));
  const open24x7 = checkedOf('input[name="open24x7"]');
  const newOffer = offerFieldsAt(valueOf, "new-deal");
  const edited = (ids?.offers ?? []).flatMap((id) => {
    const fields = offerFieldsAt(valueOf, `deal-${id}`);
    return fields === undefined ? [] : [[id, fields] as const];
  });
  const pageTabs = tickedOf("tab");
  const typedLabels = Object.fromEntries(
    RENAMABLE_PAGE_TABS.flatMap((tab) => {
      const typed = valueOf(`[name="label-${tab}"]`);
      return typed === null ? [] : [[tab, typed] as const];
    }),
  ) as Partial<Record<RenamablePageTab, string>>;
  const paymentMethods = tickedOf("payment");
  const licencesText = valueOf("#trust-licences");
  const services = ids?.services.map((id) => serviceAt(valueOf, `service-${id}`));
  const products = ids?.products.map((id) => productAt(valueOf, `product-${id}`));
  const faqs = ids?.faqs.map((id) => faqAt(valueOf, `faq-${id}`));
  const newService = serviceAt(valueOf, "service-new");
  const newProduct = productAt(valueOf, "product-new");
  const newFaq = faqAt(valueOf, "faq-new");
  return {
    ...(about === null ? {} : { about }),
    ...(tagline === null || colour === null ? {} : { tagline: { text: tagline, colour } }),
    ...(announcement === null ? {} : { announcement }),
    ...(hours === undefined ? {} : { hours }),
    ...(name === null ? {} : { name }),
    ...(website === null ? {} : { website }),
    ...(address === null ? {} : { address }),
    ...(establishedYear === null ? {} : { establishedYear }),
    ...(gstNumber === null ? {} : { gstNumber }),
    ...(serviceArea === null ? {} : { serviceArea }),
    ...(socials.every((value) => value === null)
      ? {}
      : { socials: { instagram: socials[0] ?? "", facebook: socials[1] ?? "", linkedin: socials[2] ?? "" } }),
    ...(open24x7 === null ? {} : { open24x7 }),
    ...(newOffer === undefined ? {} : { newOffer }),
    ...(edited.length === 0 ? {} : { editedOffers: Object.fromEntries(edited) }),
    ...(pageTabs === null ? {} : { pageTabs }),
    ...(Object.keys(typedLabels).length === 0 ? {} : { pageTabLabels: typedLabels }),
    ...(paymentMethods === null ? {} : { paymentMethods }),
    ...(licencesText === null ? {} : { licences: licencesOf(licencesText) }),
    ...(services === undefined ? {} : { services }),
    ...(newService === undefined ? {} : { newService }),
    ...(products === undefined ? {} : { products }),
    ...(newProduct === undefined ? {} : { newProduct }),
    ...(faqs === undefined ? {} : { faqs }),
    ...(newFaq === undefined ? {} : { newFaq }),
  };
}

/** The fields that differ from `initial`, as the draft a client's Listing and Your details pages send. */
export function changedPreviewFields(initial: PreviewFields, current: PreviewFields): PreviewDraft {
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  return {
    ...(current.about === undefined || same(initial.about, current.about) ? {} : { about: current.about }),
    ...(current.tagline === undefined || same(initial.tagline, current.tagline) ? {} : { tagline: current.tagline }),
    ...(current.announcement === undefined || same(initial.announcement, current.announcement) ? {} : { announcement: current.announcement }),
    ...(current.hours === undefined || same(initial.hours, current.hours) ? {} : { hours: current.hours }),
  };
}

const YEAR = /^\d{4}$/;

/** The year as the profile holds it: four digits within the range the website accepts, else none. */
function yearOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (!YEAR.test(trimmed)) return undefined;
  const year = Number(trimmed);
  return year >= 1800 && year <= 2100 ? year : undefined;
}

/** An address to keep only when the owner typed one; the website drops one that is not on its network's own domain. */
function socialsOf(typed: NonNullable<PreviewFields["socials"]>): NonNullable<DirectoryFeedAddedProfile["socials"]> {
  return {
    ...(typed.instagram.trim() === "" ? {} : { instagram: typed.instagram.trim() }),
    ...(typed.facebook.trim() === "" ? {} : { facebook: typed.facebook.trim() }),
    ...(typed.linkedin.trim() === "" ? {} : { linkedin: typed.linkedin.trim() }),
  };
}

/** The offers on show, with a saved deal's edits laid on it and an offer being typed added after them. */
function offersOf(base: PreviewBase, fields: PreviewFields): readonly PreviewOffer[] {
  const edited = base.offers.map((offer) => {
    const typed = fields.editedOffers?.[offer.id];
    return typed === undefined ? offer : { id: offer.id, ...typed };
  });
  const added = fields.newOffer;
  // A deal is shown once it has its offer line, the stamp and the small print: all three are required to post it.
  const complete = added !== undefined && added.title.trim() !== "" && added.badge.trim() !== "" && added.terms.trim() !== "";
  return complete ? [...edited, { id: "new-deal", badge: added.badge.trim(), title: added.title.trim(), terms: added.terms.trim() }] : edited;
}

/** A saved list with what is typed in each row's form laid over it, and the row being typed into the "add" form after them. */
function listOf<T>(saved: readonly T[], typed: readonly (T | undefined)[] | undefined, added: T | undefined): readonly T[] {
  const edited = saved.map((item, index) => typed?.[index] ?? item);
  return added === undefined ? edited : [...edited, added];
}

/**
 * The owner's names for Services and Products: the saved ones with what is typed in the name boxes laid over them. A blank box
 * goes back to the usual word; a name the dashboard would refuse (too long, symbols) is ignored, so the preview keeps the saved one.
 */
function labelsOf(
  saved: DirectoryFeedAddedProfile["pageTabLabels"],
  typed: PreviewFields["pageTabLabels"],
): NonNullable<DirectoryFeedAddedProfile["pageTabLabels"]> | undefined {
  const labels: Partial<Record<RenamablePageTab, string>> = { ...saved };
  for (const tab of RENAMABLE_PAGE_TABS) {
    const raw = typed?.[tab];
    if (raw === undefined) continue;
    const checked = checkPageTabLabel(raw);
    if (!checked.ok) continue;
    if (checked.label === null) delete labels[tab];
    else labels[tab] = checked.label;
  }
  return Object.keys(labels).length === 0 ? undefined : labels;
}

/**
 * The draft an owner's Business or Deals page sends: their saved profile, then what is typed in the forms on the page
 * on top of it. A field the page has no form for stays as saved.
 */
export function ownerDraft(base: PreviewBase, fields: PreviewFields): PreviewDraft {
  const year = fields.establishedYear === undefined ? undefined : yearOf(fields.establishedYear);
  const { pageTabLabels: savedLabels, ...savedOwner } = base.owner;
  const pageTabLabels = labelsOf(savedLabels, fields.pageTabLabels);
  const owner: DirectoryFeedAddedProfile = {
    ...savedOwner,
    ...(pageTabLabels === undefined ? {} : { pageTabLabels }),
    ...(fields.about === undefined ? {} : { about: fields.about.trim() }),
    ...(fields.hours === undefined ? {} : { hours: fields.hours }),
    ...(fields.open24x7 === undefined ? {} : { open24x7: fields.open24x7 }),
    ...(fields.serviceArea === undefined ? {} : { serviceArea: fields.serviceArea.trim() }),
    ...(fields.establishedYear === undefined ? {} : { establishedYear: year }),
    // Whatever is typed, however far along: the page draws it only once it is a whole GST number.
    ...(fields.gstNumber === undefined ? {} : { gstNumber: fields.gstNumber.trim().toUpperCase() }),
    ...(fields.socials === undefined ? {} : { socials: socialsOf(fields.socials) }),
    services: listOf(base.owner.services, fields.services, fields.newService),
    products: listOf(base.owner.products, fields.products, fields.newProduct),
    faqs: listOf(base.owner.faqs ?? [], fields.faqs, fields.newFaq),
    ...(fields.pageTabs === undefined ? {} : { pageTabs: fields.pageTabs }),
    ...(fields.paymentMethods === undefined ? {} : { paymentMethods: fields.paymentMethods }),
    ...(fields.licences === undefined ? {} : { licences: fields.licences }),
  };
  const name = fields.name?.trim();
  const address = fields.address?.trim();
  return {
    owner,
    photo: base.photo,
    offers: offersOf(base, fields),
    ...(base.entry === undefined ? {} : { entry: base.entry }),
    ...(address === undefined || address === "" ? {} : { address }),
    ...(name === undefined || name === "" ? {} : { name }),
    ...(fields.website === undefined ? {} : { website: fields.website.trim() }),
  };
}
