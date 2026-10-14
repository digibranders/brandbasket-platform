/**
 * The directory's published categories (content/local/thane-places.json) grouped into a few families, so a listing
 * without a photo can still show a picture of what kind of place it is. A category missing here falls back to "other".
 */

export const DIRECTORY_FAMILIES = [
  "health",
  "dental",
  "food",
  "beauty",
  "fitness",
  "shopping",
  "money",
  "professional",
  "property",
  "vehicles",
  "education",
  "stay",
  "events",
  "home-services",
  "other",
] as const;

export type DirectoryFamily = (typeof DIRECTORY_FAMILIES)[number];

const FAMILY_MEMBERS: Readonly<Record<Exclude<DirectoryFamily, "other">, readonly string[]>> = {
  health: [
    "hospitals",
    "clinics",
    "diagnostic-centers",
    "pharmacies",
    "general-physicians",
    "nursing-homes",
    "maternity-hospitals",
    "ayurvedic-clinics",
    "homeopathic-doctors",
    "physiotherapy-clinics",
    "ophthalmologists",
    "general-surgeons",
    "gynecologists",
    "pediatricians",
    "psychiatrists",
    "child-development-centers",
    "medical-equipment-suppliers",
  ],
  dental: ["dentists"],
  food: [
    "restaurants",
    "fast-food-restaurants",
    "cafes",
    "cloud-kitchens",
    "sweet-shops",
    "bakeries",
    "ice-cream-shops",
    "juice-shops",
    "bars",
  ],
  beauty: ["beauty-salons", "spas", "tattoo-shops"],
  fitness: ["gyms", "sports-complexes", "swimming-pools"],
  shopping: [
    "clothing-stores",
    "boutiques",
    "jewellery-stores",
    "shoe-stores",
    "watch-stores",
    "optical-stores",
    "electronics-stores",
    "mobile-phone-stores",
    "grocery-stores",
    "supermarkets",
    "fruit-and-vegetable-stores",
    "wine-and-liquor-shops",
    "home-decor-stores",
    "furniture-stores",
    "mattress-stores",
    "hardware-stores",
    "stationery-stores",
    "sports-stores",
    "baby-stores",
    "pet-stores",
    "saree-shops",
    "tiles-showrooms",
    "home-appliance-stores",
    "meat-products-stores",
    "fish-stores",
  ],
  money: ["banks", "stock-brokers", "financial-planners", "loan-agencies", "insurance-agencies", "tax-consultants"],
  professional: [
    "it-services",
    "internet-service-providers",
    "printing-services",
    "lawyers",
    "architects",
    "interior-designers",
    "photo-studios",
    "travel-agencies",
    "astrologers",
    "coworking-spaces",
    "security-guard-services",
    "police-stations",
    "solar-energy-companies",
    "lpg-suppliers",
    "building-materials-suppliers",
  ],
  property: ["real-estate-agencies", "construction-companies"],
  vehicles: [
    "auto-repair-shops",
    "motorcycle-repair-shops",
    "car-dealers",
    "motorcycle-dealers",
    "auto-parts-stores",
    "bicycle-stores",
    "petrol-pumps",
    "taxi-services",
    "bike-rental-services",
  ],
  education: [
    "schools",
    "colleges",
    "preschools",
    "coaching-centers",
    "driving-schools",
    "music-schools",
    "art-schools",
    "dance-schools",
  ],
  stay: ["hotels", "guest-houses", "hostels", "serviced-apartments", "paying-guest-accommodation"],
  events: [
    "wedding-venues",
    "event-management-companies",
    "caterers",
    "wedding-photographers",
    "cinemas",
    "amusement-parks",
    "night-clubs",
  ],
  "home-services": [
    "home-maintenance-services",
    "home-cleaning-services",
    "painters",
    "packers-and-movers",
    "laundry-services",
    "mobile-phone-repair-shops",
    "veterinarians",
  ],
};

const FAMILY_BY_SERVICE: ReadonlyMap<string, DirectoryFamily> = new Map(
  Object.entries(FAMILY_MEMBERS).flatMap(([family, services]) =>
    services.map((service) => [service, family as DirectoryFamily] as const),
  ),
);

/** The family a category belongs to; "other" for one not grouped yet. */
export function familyOf(service: string): DirectoryFamily {
  return FAMILY_BY_SERVICE.get(service) ?? "other";
}

/** Every grouped category, for the test that keeps the grouping complete. */
export function groupedServices(): readonly string[] {
  return [...FAMILY_BY_SERVICE.keys()];
}
