import { describe, expect, it } from "vitest";
import { changedPreviewFields, ownerDraft, readPreviewFields, type FieldLookup, type PreviewBase } from "@/lib/preview-draft";

/** A page with these fields: selector to value. */
function page(fields: Readonly<Record<string, string>>): FieldLookup {
  return (selector) => fields[selector] ?? null;
}

const LISTING = {
  "#listing-about": "Gentle dentistry",
  "#listing-tagline": "Open late",
  'input[name="colour"]:checked': "sage",
};

function week(days: Record<number, readonly [string, string?, string?]>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let day = 0; day < 7; day += 1) {
    const [mode, opens = "", closes = ""] = days[day] ?? ["unset"];
    fields[`[name="hours.${String(day)}.mode"]`] = mode;
    fields[`[name="hours.${String(day)}.opens"]`] = opens;
    fields[`[name="hours.${String(day)}.closes"]`] = closes;
  }
  return fields;
}

describe("readPreviewFields", () => {
  it("reads the about line, the tagline and its chosen colour", () => {
    expect(readPreviewFields(page(LISTING))).toEqual({
      about: "Gentle dentistry",
      tagline: { text: "Open late", colour: "sage" },
    });
  });

  it("reads the announcement message", () => {
    expect(readPreviewFields(page({ "#announcement-message": "Closed for Diwali" }))).toEqual({ announcement: "Closed for Diwali" });
  });

  it("reads the week: open days with both times, open-all-day days, and none for closed or unset ones", () => {
    const fields = readPreviewFields(
      page(week({ 0: ["open", "09:00", "21:00"], 1: ["all-day"], 2: ["closed"], 3: ["open", "09:00", ""], 4: ["open", "10:00", "10:00"] })),
    );
    expect(fields.hours).toEqual([
      { day: 0, opens: "09:00", closes: "21:00" },
      { day: 1, opens: "00:00", closes: "24:00" },
    ]);
  });

  it("keeps a day that closes after midnight", () => {
    expect(readPreviewFields(page(week({ 5: ["open", "18:00", "02:00"] }))).hours).toEqual([{ day: 5, opens: "18:00", closes: "02:00" }]);
  });

  it("leaves out whatever the page does not have", () => {
    expect(readPreviewFields(page({}))).toEqual({});
  });
});

describe("changedPreviewFields", () => {
  const initial = { about: "Gentle dentistry", tagline: { text: "Open late", colour: "rose" }, hours: [{ day: 0, opens: "09:00", closes: "21:00" }] };

  it("is empty until something is edited", () => {
    expect(changedPreviewFields(initial, initial)).toEqual({});
  });

  it("holds only the fields that differ", () => {
    expect(changedPreviewFields(initial, { ...initial, about: "New line" })).toEqual({ about: "New line" });
    expect(changedPreviewFields(initial, { ...initial, tagline: { text: "Open late", colour: "sky" } })).toEqual({
      tagline: { text: "Open late", colour: "sky" },
    });
  });

  it("keeps an emptied field, so the preview clears it", () => {
    expect(changedPreviewFields(initial, { ...initial, about: "" })).toEqual({ about: "" });
  });

  it("sends the whole week when any day changes", () => {
    const hours = [{ day: 0, opens: "10:00", closes: "21:00" }];
    expect(changedPreviewFields(initial, { ...initial, hours })).toEqual({ hours });
  });
});


describe("readPreviewFields on an owner's pages", () => {
  it("reads the Details form: name, description, year, service area, website and the three social pages", () => {
    const fields = readPreviewFields(
      page({
        "#details-name": "Meera Dental Studio",
        "#details-about": "Family dentistry",
        "#details-year": "2012",
        "#details-gst": "27AAPFU0939F1ZV",
        "#details-area": "Naupada",
        "#details-website": "https://meera.example",
        '[name="instagram"]': "https://instagram.com/meera",
        '[name="facebook"]': "",
        '[name="linkedin"]': "",
      }),
      (selector) => (selector === 'input[name="open24x7"]' ? true : null),
    );
    expect(fields).toMatchObject({
      name: "Meera Dental Studio",
      about: "Family dentistry",
      establishedYear: "2012",
      gstNumber: "27AAPFU0939F1ZV",
      serviceArea: "Naupada",
      website: "https://meera.example",
      socials: { instagram: "https://instagram.com/meera", facebook: "", linkedin: "" },
      open24x7: true,
    });
  });

  it("reads the new deal form and the edit form of each saved deal it is asked about", () => {
    const fields = readPreviewFields(
      page({
        "input#new-deal-title": "Free check-up",
        "input#new-deal-badge": "Free",
        "input#new-deal-terms": "Weekdays",
        "input#deal-d1-title": "20% off braces",
        "input#deal-d1-badge": "20% off",
        "input#deal-d1-terms": "Till Diwali",
      }),
      () => null,
      { offers: ["d1", "d2"], services: [], products: [], faqs: [] },
    );
    expect(fields.newOffer).toEqual({ title: "Free check-up", badge: "Free", terms: "Weekdays" });
    expect(fields.editedOffers).toEqual({ d1: { title: "20% off braces", badge: "20% off", terms: "Till Diwali" } });
  });
});

describe("ownerDraft", () => {
  const base: PreviewBase = {
    owner: {
      about: "Saved about",
      hours: [{ day: 0, opens: "09:00", closes: "18:00" }],
      services: [{ category: "Dental", name: "Braces" }],
      products: [],
      faqs: [{ question: "Q?", answer: "A." }],
      paymentMethods: [],
      licences: [],
      pageTabs: ["faq"],
      establishedYear: 2010,
      socials: { instagram: "https://instagram.com/saved" },
    },
    photo: "0f6f3f6e-6a7c-4a4e-9a63-0c2f3a6b9a22",
    offers: [{ id: "d1", badge: "20% off", title: "Braces", terms: "Weekdays" }],
    ids: { offers: ["d1"], services: ["s1"], products: [], faqs: ["f1"] },
  };

  it("sends the saved profile, photo and offers when nothing is typed", () => {
    expect(ownerDraft(base, {})).toEqual({ owner: base.owner, photo: base.photo, offers: base.offers });
  });

  it("lays what is typed over the saved profile, leaving the lists as saved", () => {
    const draft = ownerDraft(base, {
      about: "  Typed about ",
      hours: [{ day: 2, opens: "10:00", closes: "12:00" }],
      serviceArea: "Naupada ",
      establishedYear: "2015",
      open24x7: false,
      socials: { instagram: "", facebook: "https://facebook.com/meera", linkedin: "" },
    });
    expect(draft.owner).toMatchObject({
      about: "Typed about",
      hours: [{ day: 2, opens: "10:00", closes: "12:00" }],
      serviceArea: "Naupada",
      establishedYear: 2015,
      open24x7: false,
      socials: { facebook: "https://facebook.com/meera" },
    });
    expect(draft.owner?.socials).not.toHaveProperty("instagram");
    expect(draft.owner?.services).toEqual(base.owner.services);
    expect(draft.owner?.faqs).toEqual(base.owner.faqs);
  });

  it("lays the typed GST number over the saved one, in capitals and trimmed, and an emptied field replaces it with nothing", () => {
    expect(ownerDraft(base, { gstNumber: " 27aapfu0939f1zv " }).owner?.gstNumber).toBe("27AAPFU0939F1ZV");
    expect(ownerDraft(base, { gstNumber: "" }).owner?.gstNumber).toBe("");
  });

  it("leaves the saved GST number as it is when the page has no GST field", () => {
    const saved = { ...base, owner: { ...base.owner, gstNumber: "27AAPFU0939F1ZV" } };
    expect(ownerDraft(saved, {}).owner?.gstNumber).toBe("27AAPFU0939F1ZV");
  });

  it("clears the year when the field is emptied or is not a year", () => {
    expect(ownerDraft(base, { establishedYear: "" }).owner?.establishedYear).toBeUndefined();
    expect(ownerDraft(base, { establishedYear: "20x5" }).owner?.establishedYear).toBeUndefined();
    expect(ownerDraft(base, { establishedYear: "1500" }).owner?.establishedYear).toBeUndefined();
  });

  it("sends the name and website only when they are typed", () => {
    expect(ownerDraft(base, { name: " New name ", website: " https://x.example " })).toMatchObject({ name: "New name", website: "https://x.example" });
    const empty = ownerDraft(base, { name: "   " });
    expect(empty).not.toHaveProperty("name");
    expect(ownerDraft(base, { website: "" }).website).toBe("");
  });

  it("adds the deal being typed once it is complete, and lays a saved deal's edits over it", () => {
    expect(ownerDraft(base, { newOffer: { title: "Free check-up", badge: "Free", terms: "" } }).offers).toEqual(base.offers);
    const draft = ownerDraft(base, {
      newOffer: { title: "Free check-up", badge: "Free", terms: "Weekdays" },
      editedOffers: { d1: { title: "30% off braces", badge: "30% off", terms: "Weekdays" } },
    });
    expect(draft.offers).toEqual([
      { id: "d1", title: "30% off braces", badge: "30% off", terms: "Weekdays" },
      { id: "new-deal", title: "Free check-up", badge: "Free", terms: "Weekdays" },
    ]);
  });
});


describe("services, products and questions", () => {
  const ids = { offers: [], services: ["s1", "s2"], products: ["p1"], faqs: ["f1"] };

  it("reads the new service form, with the numbers as numbers and long text cut to what the feed accepts", () => {
    const fields = readPreviewFields(
      page({
        "#service-new-name": "Laser Gum Therapy",
        "#service-new-description": "x".repeat(400),
        "#service-new-price": "3500",
        "#service-new-duration": "40",
        "#service-new-area": "Thane",
      }),
      () => null,
      ids,
    );
    expect(fields.newService).toMatchObject({ category: "Services", name: "Laser Gum Therapy", priceInr: 3500, durationMinutes: 40, serviceArea: "Thane" });
    expect(fields.newService?.description).toHaveLength(300);
  });

  it("needs only a name, ignores a blank one, and drops a price that is not a number", () => {
    expect(readPreviewFields(page({ "#service-new-name": "Only a name" }), () => null, ids).newService).toEqual({ category: "Services", name: "Only a name" });
    expect(readPreviewFields(page({ "#service-new-name": "   " }), () => null, ids).newService).toBeUndefined();
    const fields = readPreviewFields(page({ "#service-new-name": "B", "#service-new-price": "12x" }), () => null, ids);
    expect(fields.newService).toEqual({ category: "Services", name: "B" });
  });

  it("reads each saved row's edit form by its id, with undefined for a form that is not there", () => {
    const fields = readPreviewFields(
      page({
        "#service-s1-name": "Braces (new name)",
        "#product-p1-name": "Brush",
        "#product-p1-availability": "made_to_order",
        "#faq-f1-question": "Open on Sundays?",
        "#faq-f1-answer": "Yes, till 2 pm.",
      }),
      () => null,
      ids,
    );
    expect(fields.services).toEqual([{ category: "Services", name: "Braces (new name)" }, undefined]);
    expect(fields.products).toEqual([{ name: "Brush", availability: "made_to_order" }]);
    expect(fields.faqs).toEqual([{ question: "Open on Sundays?", answer: "Yes, till 2 pm." }]);
  });

  const base: PreviewBase = {
    owner: {
      hours: [],
      services: [{ category: "Dental", name: "Braces" }, { category: "Dental", name: "Whitening" }],
      products: [{ name: "Brush", availability: "in_stock" }],
      faqs: [{ question: "Q?", answer: "A." }],
      paymentMethods: [],
      licences: [],
    },
    photo: null,
    offers: [],
    ids,
  };

  it("lays the typed rows over the saved lists and puts the one being added at the end", () => {
    const draft = ownerDraft(base, {
      services: [{ category: "Dental", name: "Braces (new name)" }, undefined],
      newService: { category: "Gum care", name: "Laser" },
      products: [undefined],
      newProduct: { name: "Floss", availability: "in_stock" },
      faqs: [undefined],
      newFaq: { question: "Parking?", answer: "Yes." },
    });
    expect(draft.owner?.services.map((service) => service.name)).toEqual(["Braces (new name)", "Whitening", "Laser"]);
    expect(draft.owner?.products.map((product) => product.name)).toEqual(["Brush", "Floss"]);
    expect(draft.owner?.faqs?.map((faq) => faq.question)).toEqual(["Q?", "Parking?"]);
  });

  it("keeps the saved lists when the page has no forms for them", () => {
    const draft = ownerDraft(base, { about: "Typed" });
    expect(draft.owner?.services).toEqual(base.owner.services);
    expect(draft.owner?.faqs).toEqual(base.owner.faqs);
  });
});


describe("page tabs, payment methods and licences", () => {
  const ticked = (groups: Record<string, readonly string[]>) => (name: string): readonly string[] | null => groups[name] ?? null;

  it("reads the ticked page tabs and payment methods, and the licences a line each", () => {
    const fields = readPreviewFields(
      page({ "#trust-licences": "ISO 9001\n  Dental Council reg. 4471  \n\n" }),
      () => null,
      undefined,
      ticked({ tab: ["faq", "services"], payment: ["cash", "upi"] }),
    );
    expect(fields).toMatchObject({ pageTabs: ["faq", "services"], paymentMethods: ["cash", "upi"], licences: ["ISO 9001", "Dental Council reg. 4471"] });
  });

  it("says nothing about a group the page does not have, and keeps an empty one (everything unticked)", () => {
    expect(readPreviewFields(page({}), () => null, undefined, ticked({}))).toEqual({});
    expect(readPreviewFields(page({}), () => null, undefined, ticked({ tab: [] })).pageTabs).toEqual([]);
  });

  it("lays them over the saved profile", () => {
    const base: PreviewBase = {
      owner: { hours: [], services: [], products: [], paymentMethods: ["cash"], licences: [], pageTabs: ["faq"] },
      photo: null,
      offers: [],
      ids: { offers: [], services: [], products: [], faqs: [] },
    };
    const draft = ownerDraft(base, { pageTabs: ["services"], paymentMethods: ["upi"], licences: ["ISO"] });
    expect(draft.owner).toMatchObject({ pageTabs: ["services"], paymentMethods: ["upi"], licences: ["ISO"] });
  });
});

describe("the names of the Services and Products tabs", () => {
  const base: PreviewBase = {
    owner: { hours: [], services: [], products: [], paymentMethods: [], licences: [], pageTabs: ["services"], pageTabLabels: { services: "Menu" } },
    photo: null,
    offers: [],
    ids: { offers: [], services: [], products: [], faqs: [] },
  };

  it("reads what is typed in the name boxes, and says nothing when the page has none", () => {
    expect(readPreviewFields(page({ '[name="label-services"]': "Our Menu", '[name="label-products"]': "" })).pageTabLabels).toEqual({ services: "Our Menu", products: "" });
    expect(readPreviewFields(page({}))).not.toHaveProperty("pageTabLabels");
  });

  it("keeps the saved names when the page has no name boxes", () => {
    expect(ownerDraft(base, {}).owner?.pageTabLabels).toEqual({ services: "Menu" });
  });

  it("shows a name as it is typed, tidied, and the usual word once the box is emptied", () => {
    expect(ownerDraft(base, { pageTabLabels: { services: "  Lunch   Menu ", products: "Shop" } }).owner?.pageTabLabels).toEqual({ services: "Lunch Menu", products: "Shop" });
    expect(ownerDraft(base, { pageTabLabels: { services: "" } }).owner).not.toHaveProperty("pageTabLabels");
  });

  it("ignores a name the dashboard would refuse, keeping the saved one", () => {
    expect(ownerDraft(base, { pageTabLabels: { services: "x".repeat(25), products: "<b>" } }).owner?.pageTabLabels).toEqual({ services: "Menu" });
  });
});

describe("a business that is not live yet", () => {
  const entry = {
    address: { category: "bakeries", state: "mh", city: "thane", area: "naupada", slug: "sunrise-bakery" },
    id: "6sunr2s",
    url: { city: "thane", slug: "sunrise-bakery" },
    name: "Sunrise Bakery",
    streetAddress: "Shop 4",
    phone: "+919820041002",
    confirmedAt: "2026-10-12T08:00:00.000Z",
    verified: false,
    photo: null,
  };
  const base: PreviewBase = {
    owner: { hours: [], services: [], products: [], paymentMethods: [], licences: [] },
    photo: null,
    offers: [],
    entry,
    ids: { offers: [], services: [], products: [], faqs: [] },
  };

  it("sends the entry the website draws the page from, and the address as it is typed", () => {
    const fields = readPreviewFields(page({ "#details-address": " Shop 5, Ram Maruti Road " }));
    expect(fields.address).toBe(" Shop 5, Ram Maruti Road ");
    expect(ownerDraft(base, fields)).toMatchObject({ entry, address: "Shop 5, Ram Maruti Road" });
  });

  it("sends no entry for a business that is live, and no address when none is typed", () => {
    const draft = ownerDraft({ ...base, entry: undefined }, {});
    expect(draft).not.toHaveProperty("entry");
    expect(draft).not.toHaveProperty("address");
  });
});
