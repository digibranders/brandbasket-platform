/**
 * The trades Fynix builds for. The stored value is the slug, never the label, so wording can change
 * without rewriting past leads.
 */
export const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurant, café or bakery" },
  { value: "salon", label: "Salon, spa or barber" },
  { value: "clinic", label: "Clinic, dental or medical practice" },
  { value: "fitness", label: "Gym, yoga or fitness studio" },
  { value: "retail", label: "Retail shop or showroom" },
  { value: "home_services", label: "Home services (plumbing, electrical, repairs)" },
  { value: "property", label: "Real estate or property" },
  { value: "hospitality", label: "Hotel, homestay or travel" },
  { value: "events", label: "Events, catering or photography" },
  { value: "education", label: "School, coaching or training" },
  { value: "professional", label: "Professional services (legal, accounting, consulting)" },
  { value: "automotive", label: "Automotive, workshop or dealership" },
  { value: "other", label: "Something else" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];

/** zod's enum needs a non-empty tuple, which `.map()` alone does not give it. */
export const BUSINESS_TYPE_VALUES: readonly [BusinessType, ...BusinessType[]] = [
  BUSINESS_TYPES[0].value,
  ...BUSINESS_TYPES.slice(1).map((type) => type.value),
];

const BUSINESS_TYPE_VALUES_SET: ReadonlySet<string> = new Set(BUSINESS_TYPE_VALUES);

export function isBusinessType(value: string): value is BusinessType {
  return BUSINESS_TYPE_VALUES_SET.has(value);
}

/** Falls back to the stored value so a slug retired from the list still reads sensibly in admin. */
export function businessTypeLabel(value: string): string {
  return BUSINESS_TYPES.find((type) => type.value === value)?.label ?? value;
}
