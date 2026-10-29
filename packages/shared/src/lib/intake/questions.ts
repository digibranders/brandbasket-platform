import { BUSINESS_TYPES } from "@brandbasket/shared/lib/business-types";
/** The three services, by the names the dashboard and the console use for them. */
export type IntakeService = "website" | "social" | "search";

/*
 * The short questions between creating an account and paying (docs/redesign-29-oct-2026/implementation-plan.md, section 7).
 * The services were already chosen, so these are not a recommendation: they tell the team what the business is. Which
 * questions apply depends on the services in the basket and on earlier answers, and a bundle asks each question once. The
 * rules are data and small functions, so the page, the answer check and the console all read the same ones. Pure and
 * browser-safe. The copy here is a draft for the owner's yes.
 */

export const INTAKE_VERSION = 1;

export type IntakeField =
  | "businessType"
  | "businessSubtype"
  | "primaryGoal"
  | "websiteState"
  | "existingWebsiteUrl"
  | "primaryAction"
  | "designDirection"
  | "socialChannels"
  | "searchScope";

/** The answers as stored: a single choice is a slug, a multi-choice a list, and a question not answered is null (or empty). */
export interface IntakeAnswers {
  readonly businessType: string | null;
  readonly businessSubtype: string | null;
  readonly primaryGoal: string | null;
  readonly websiteState: string | null;
  readonly existingWebsiteUrl: string | null;
  readonly primaryAction: string | null;
  readonly designDirection: string | null;
  readonly socialChannels: readonly string[];
  readonly searchScope: string | null;
}

export const NO_ANSWERS: IntakeAnswers = {
  businessType: null,
  businessSubtype: null,
  primaryGoal: null,
  websiteState: null,
  existingWebsiteUrl: null,
  primaryAction: null,
  designDirection: null,
  socialChannels: [],
  searchScope: null,
};

export interface IntakeOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

export interface IntakeQuestion {
  readonly field: IntakeField;
  /** Who asked: every business, or the one service that needs it. */
  readonly group: "common" | IntakeService;
  /** One choice, several choices, or a web address. */
  readonly kind: "single" | "multi" | "url";
  readonly title: string;
  readonly hint: string;
  /** A question that may be passed over without an answer (the summary does not ask for it again). */
  readonly optional?: boolean;
  readonly options: (answers: IntakeAnswers) => readonly IntakeOption[];
  readonly appliesWhen?: (answers: IntakeAnswers) => boolean;
}

const OTHER: IntakeOption = { value: "other", label: "Something else" };
const NOT_SURE: IntakeOption = { value: "unsure", label: "Not sure yet", hint: "We will decide together on the call." };

/** What kind of practice, shop or service, for each kind of business. */
const SUBTYPES: Readonly<Record<string, readonly IntakeOption[]>> = {
  restaurant: [
    { value: "restaurant", label: "Restaurant" },
    { value: "cafe_bakery", label: "Cafe or bakery" },
    { value: "cloud_kitchen", label: "Cloud kitchen" },
    { value: "catering", label: "Catering" },
    OTHER,
  ],
  salon: [
    { value: "hair_salon", label: "Hair salon" },
    { value: "barber", label: "Barber shop" },
    { value: "spa_wellness", label: "Spa or wellness" },
    { value: "beauty_makeup", label: "Beauty or makeup" },
    OTHER,
  ],
  clinic: [
    { value: "dental", label: "Dental" },
    { value: "general", label: "General practice" },
    { value: "skin_hair", label: "Skin or hair" },
    { value: "physio", label: "Physiotherapy" },
    { value: "diagnostics", label: "Diagnostics or lab" },
    OTHER,
  ],
  fitness: [
    { value: "gym", label: "Gym" },
    { value: "yoga", label: "Yoga" },
    { value: "studio", label: "Dance or fitness studio" },
    { value: "personal_training", label: "Personal training" },
    OTHER,
  ],
  retail: [
    { value: "fashion", label: "Clothing or fashion" },
    { value: "electronics", label: "Electronics" },
    { value: "grocery", label: "Grocery or daily needs" },
    { value: "home_goods", label: "Home and furniture" },
    OTHER,
  ],
  home_services: [
    { value: "plumbing_electrical", label: "Plumbing or electrical" },
    { value: "cleaning_pest", label: "Cleaning or pest control" },
    { value: "appliance_repair", label: "Appliance repair" },
    { value: "painting_renovation", label: "Painting or renovation" },
    OTHER,
  ],
  property: [
    { value: "agent", label: "Agent or broker" },
    { value: "developer", label: "Developer" },
    { value: "rentals", label: "Rentals or PG" },
    OTHER,
  ],
  hospitality: [
    { value: "hotel", label: "Hotel" },
    { value: "homestay", label: "Homestay" },
    { value: "travel_tours", label: "Travel or tours" },
    OTHER,
  ],
  events: [
    { value: "weddings", label: "Weddings" },
    { value: "photography", label: "Photography" },
    { value: "event_planning", label: "Event planning" },
    OTHER,
  ],
  education: [
    { value: "school", label: "School" },
    { value: "coaching", label: "Coaching classes" },
    { value: "skills_training", label: "Skills or training" },
    OTHER,
  ],
  professional: [
    { value: "legal", label: "Legal" },
    { value: "accounting_tax", label: "Accounting or tax" },
    { value: "consulting", label: "Consulting" },
    { value: "agency", label: "Agency" },
    OTHER,
  ],
  automotive: [
    { value: "dealership", label: "Dealership" },
    { value: "workshop", label: "Workshop or garage" },
    { value: "car_care", label: "Car care or detailing" },
    OTHER,
  ],
};

const businessTypeOptions = (): readonly IntakeOption[] => BUSINESS_TYPES.map((type) => ({ value: type.value, label: type.label }));

/** Every question, in the order they are asked: about the business, then the website, social, then search. */
export const INTAKE_QUESTIONS: readonly IntakeQuestion[] = [
  {
    field: "businessType",
    group: "common",
    kind: "single",
    title: "What kind of business do you run?",
    hint: "This decides what we ask next.",
    options: businessTypeOptions,
  },
  {
    field: "businessSubtype",
    group: "common",
    kind: "single",
    title: "What best describes it?",
    hint: "Choose the closest. You can say more on the call.",
    options: (answers) => SUBTYPES[answers.businessType ?? ""] ?? [],
    appliesWhen: (answers) => (SUBTYPES[answers.businessType ?? ""] ?? []).length > 0,
  },
  {
    field: "primaryGoal",
    group: "common",
    kind: "single",
    title: "What matters most to your business right now?",
    hint: "We use this as the starting point for everything you chose.",
    options: () => [
      { value: "more_enquiries", label: "More calls and enquiries" },
      { value: "more_bookings", label: "More bookings or visits" },
      { value: "be_found", label: "Be found by people nearby" },
      { value: "look_professional", label: "Look more professional online" },
      { value: "keep_customers", label: "Keep customers coming back" },
      NOT_SURE,
    ],
  },
  {
    field: "websiteState",
    group: "website",
    kind: "single",
    title: "Do you already have a website?",
    hint: "So we know whether to start fresh or learn from what you have.",
    options: () => [
      { value: "no_site", label: "No, this is my first", hint: "We start from scratch." },
      { value: "replace", label: "Yes, I want a new one", hint: "We use it only as a reference." },
      { value: "improve", label: "Yes, I want it improved", hint: "We keep what works." },
      NOT_SURE,
    ],
  },
  {
    field: "existingWebsiteUrl",
    group: "website",
    kind: "url",
    optional: true,
    title: "What is its address?",
    hint: "We only look at it. Nothing changes until you approve the new one.",
    options: () => [],
    appliesWhen: (answers) => answers.websiteState === "replace" || answers.websiteState === "improve",
  },
  {
    field: "primaryAction",
    group: "website",
    kind: "single",
    title: "What should visitors do on your website?",
    hint: "We design the pages around this.",
    options: () => [
      { value: "call", label: "Call us" },
      { value: "whatsapp", label: "Message us on WhatsApp" },
      { value: "book", label: "Book an appointment" },
      { value: "form", label: "Send an enquiry" },
      { value: "visit", label: "Visit us in person" },
      NOT_SURE,
    ],
  },
  {
    field: "designDirection",
    group: "website",
    kind: "single",
    title: "What kind of feel suits your business?",
    hint: "Pick the closest, or let us decide.",
    options: () => [
      { value: "clean_professional", label: "Clean and professional", hint: "Clear and trustworthy." },
      { value: "modern_bold", label: "Modern and bold", hint: "Confident and contemporary." },
      { value: "warm_friendly", label: "Warm and friendly", hint: "Approachable and human." },
      { value: "premium_elegant", label: "Premium and elegant", hint: "Refined and understated." },
      { value: "let_us_decide", label: "Let BrandBasket decide", hint: "We will suggest a direction." },
    ],
  },
  {
    field: "socialChannels",
    group: "social",
    kind: "multi",
    title: "Which channels matter most right now?",
    hint: "Choose all that apply.",
    options: () => [
      { value: "instagram", label: "Instagram", hint: "Content, visibility and engagement." },
      { value: "facebook", label: "Facebook", hint: "Local audience, community and ads." },
      { value: "google_business", label: "Google Business Profile", hint: "Local discovery and updates." },
      { value: "recommend", label: "Let BrandBasket recommend", hint: "We will suggest the right mix." },
    ],
  },
  {
    field: "searchScope",
    group: "search",
    kind: "single",
    title: "Where do you mainly want customers to find you?",
    hint: "This sets where we start with local search.",
    options: () => [
      { value: "local_area", label: "My local area or city", hint: "People searching near my business." },
      { value: "multiple_locations", label: "Several cities or locations", hint: "I serve more than one place." },
      { value: "regional", label: "A wider region", hint: "Beyond one city." },
      NOT_SURE,
    ],
  },
];

/** The questions to ask for these services and answers, in order. A bundle asks each one once. */
export function visibleQuestions(services: readonly IntakeService[], answers: IntakeAnswers): readonly IntakeQuestion[] {
  return INTAKE_QUESTIONS.filter((question) => (question.group === "common" || services.includes(question.group)) && (question.appliesWhen?.(answers) ?? true));
}

export function questionFor(field: string): IntakeQuestion | undefined {
  return INTAKE_QUESTIONS.find((question) => question.field === field);
}

function isAnswered(question: IntakeQuestion, answers: IntakeAnswers): boolean {
  const value = answers[question.field];
  return Array.isArray(value) ? value.length > 0 : value !== null;
}

/** The first question that still needs an answer, or null when there is none. An optional question never counts as unanswered. */
export function firstUnanswered(services: readonly IntakeService[], answers: IntakeAnswers): IntakeQuestion | null {
  return visibleQuestions(services, answers).find((question) => question.optional !== true && !isAnswered(question, answers)) ?? null;
}

/** How many questions still need an answer. */
export function unansweredCount(services: readonly IntakeService[], answers: IntakeAnswers): number {
  return visibleQuestions(services, answers).filter((question) => question.optional !== true && !isAnswered(question, answers)).length;
}

/** The question after `field` in the order asked, or null when `field` was the last. */
export function questionAfter(services: readonly IntakeService[], answers: IntakeAnswers, field: IntakeField): IntakeQuestion | null {
  const questions = visibleQuestions(services, answers);
  const index = questions.findIndex((question) => question.field === field);
  return index === -1 ? null : (questions[index + 1] ?? null);
}

/** The question before `field`, or null for the first. */
export function questionBefore(services: readonly IntakeService[], answers: IntakeAnswers, field: IntakeField): IntakeQuestion | null {
  const questions = visibleQuestions(services, answers);
  const index = questions.findIndex((question) => question.field === field);
  return index <= 0 ? null : (questions[index - 1] ?? null);
}

/** "Question 4 of 7": where `field` sits among the questions asked. */
export function questionPosition(services: readonly IntakeService[], answers: IntakeAnswers, field: IntakeField): { readonly number: number; readonly total: number } {
  const questions = visibleQuestions(services, answers);
  return { number: questions.findIndex((question) => question.field === field) + 1, total: questions.length };
}

/** The intake's services for the catalogue ids a basket holds (ids it does not know are dropped), so the console reads a saved basket the way the portal does. */
export function intakeServicesOf(addOnIds: readonly string[]): readonly IntakeService[] {
  const keyOf: Readonly<Record<string, IntakeService>> = { "managed-website": "website", "digital-growth": "social", "local-seo-aeo": "search" };
  return addOnIds.flatMap((id) => (keyOf[id] === undefined ? [] : [keyOf[id]]));
}

const ROW_LABELS: Readonly<Record<IntakeField, string>> = {
  businessType: "Business",
  businessSubtype: "Kind of business",
  primaryGoal: "Main priority",
  websiteState: "Current website",
  existingWebsiteUrl: "Website address",
  primaryAction: "Main website action",
  designDirection: "Look and feel",
  socialChannels: "Social focus",
  searchScope: "Where to be found",
};

export interface IntakeSummaryRow {
  readonly field: IntakeField;
  readonly label: string;
  /** The answer in words, or null when the question was not answered. */
  readonly value: string | null;
}

/** The answers as the summary shows them: one row per question asked, in the order asked. */
export function summaryRows(services: readonly IntakeService[], answers: IntakeAnswers): readonly IntakeSummaryRow[] {
  return visibleQuestions(services, answers).map((question) => {
    const stored = answers[question.field];
    if (!isAnswered(question, answers)) return { field: question.field, label: ROW_LABELS[question.field], value: null };
    if (question.kind === "url") return { field: question.field, label: ROW_LABELS[question.field], value: String(stored) };
    const options = question.options(answers);
    const labelOf = (value: string): string => options.find((option) => option.value === value)?.label ?? value;
    return { field: question.field, label: ROW_LABELS[question.field], value: Array.isArray(stored) ? stored.map(labelOf).join(", ") : labelOf(String(stored)) };
  });
}
