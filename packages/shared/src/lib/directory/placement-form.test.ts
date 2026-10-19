import { describe, expect, it } from "vitest";
import { DIRECTORY_AREAS } from "./places";
import { parsePlacementForm } from "./placement-form";

const AREA = DIRECTORY_AREAS.find((area) => area.city === "thane");
if (AREA === undefined) throw new Error("no Thane area in places.json");
const AREA_SLUG = AREA.slug;
const OTHER_CITY_AREA = DIRECTORY_AREAS.find((area) => area.city !== "thane");
if (OTHER_CITY_AREA === undefined) throw new Error("no non-Thane area in places.json");
const OTHER_CITY_AREA_SLUG = OTHER_CITY_AREA.slug;

function form(overrides: Readonly<Record<string, string>> = {}): FormData {
  const values: Record<string, string> = {
    category: "dentists",
    city: "thane",
    area: AREA_SLUG,
    slug: "smile-dental-clinic",
    lat: "19.19",
    lon: "72.97",
    pinLabel: "Gokhale Road",
    whatsappPhone: "",
    bookingUrl: "",
    replacesSourcePath: "",
    ...overrides,
  };
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("parsePlacementForm", () => {
  it("accepts a complete form", () => {
    expect(parsePlacementForm(form())).toEqual({
      success: true,
      data: {
        categorySlug: "dentists",
        stateCode: "mh",
        citySlug: "thane",
        areaSlug: AREA_SLUG,
        slug: "smile-dental-clinic",
        lat: 19.19,
        lon: 72.97,
        pinLabel: "Gokhale Road",
        whatsappPhone: null,
        bookingUrl: null,
        replacesSourcePath: null,
        takeOverPlaceId: null,
      },
    });
  });

  it("takes the business id a new listing takes over, from the id itself or a full business address", () => {
    expect(parsePlacementForm(form({ takeOverPlaceId: " k7m2q9a " }))).toMatchObject({ success: true, data: { takeOverPlaceId: "k7m2q9a" } });
    expect(
      parsePlacementForm(form({ takeOverPlaceId: "https://brandbasket.in/in/mh/thane/business/smile-dental/k7m2q9a" })),
    ).toMatchObject({ success: true, data: { takeOverPlaceId: "k7m2q9a" } });
    expect(parsePlacementForm(form({ takeOverPlaceId: "" }))).toMatchObject({ success: true, data: { takeOverPlaceId: null } });
    expect(parsePlacementForm(form({ takeOverPlaceId: "K7M2Q9A" }))).toMatchObject({ success: true, data: { takeOverPlaceId: "k7m2q9a" } });
    expect(
      parsePlacementForm(form({ takeOverPlaceId: "https://brandbasket.in/in/mh/thane/business/smile-dental/K7M2Q9A" })),
    ).toMatchObject({ success: true, data: { takeOverPlaceId: "k7m2q9a" } });
  });

  it("normalises optional fields", () => {
    const result = parsePlacementForm(
      form({
        whatsappPhone: "+91 90000 00001",
        bookingUrl: "https://smiledental.in/book",
        replacesSourcePath: "https://brandbasket.in/in/dentists/mh/thane/naupada/smile-dental?x=1",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        whatsappPhone: "+919000000001",
        bookingUrl: "https://smiledental.in/book",
        replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
      },
    });
  });

  it.each([
    [{ category: "plumbers-that-dont-exist" }, "category"],
    [{ city: "mumbai" }, "city"],
    [{ area: "not-an-area" }, "area"],
    [{ slug: "Smile Dental" }, "slug"],
    [{ lat: "12.9" }, "lat"],
    [{ lon: "abc" }, "lon"],
    [{ pinLabel: "" }, "pinLabel"],
    [{ whatsappPhone: "12345" }, "whatsappPhone"],
    [{ bookingUrl: "http://insecure.example" }, "bookingUrl"],
    [{ replacesSourcePath: "/blog/something" }, "replacesSourcePath"],
    [{ takeOverPlaceId: "smile-dental" }, "takeOverPlaceId"],
    [{ takeOverPlaceId: "kkkkkkk" }, "takeOverPlaceId"],
    [{ takeOverPlaceId: "https://brandbasket.in/in/dentists/mh/thane/naupada/smile-dental" }, "takeOverPlaceId"],
    [{ area: OTHER_CITY_AREA_SLUG }, "area"],
    [{ lon: "75.5" }, "lon"],
    [{ slug: "a".repeat(81) }, "slug"],
    [{ bookingUrl: `https://x.com/${"a".repeat(2040)}` }, "bookingUrl"],
  ])("refuses %o in field %s", (overrides, field) => {
    expect(parsePlacementForm(form(overrides))).toMatchObject({ success: false, field });
  });

  it("keeps a slug of exactly 80 characters", () => {
    const slug = "a".repeat(80);
    expect(parsePlacementForm(form({ slug }))).toMatchObject({ success: true, data: { slug } });
  });

  it("normalises a phone number written with hyphens", () => {
    expect(parsePlacementForm(form({ whatsappPhone: "+91-90000-00001" }))).toMatchObject({
      success: true,
      data: { whatsappPhone: "+919000000001" },
    });
  });

  it("drops a trailing slash, query and hash from the unconfirmed path", () => {
    const raw = "https://brandbasket.in/in/dentists/mh/thane/naupada/smile-dental/?x=1#reviews";
    expect(parsePlacementForm(form({ replacesSourcePath: raw }))).toMatchObject({
      success: true,
      data: { replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental" },
    });
    const bare = form({ replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental/" });
    expect(parsePlacementForm(bare)).toMatchObject({
      success: true,
      data: { replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental" },
    });
  });

  it("stores the booking address in its normalised https form", () => {
    expect(parsePlacementForm(form({ bookingUrl: "HTTPS://x.com/book" }))).toMatchObject({
      success: true,
      data: { bookingUrl: "https://x.com/book" },
    });
    expect(parsePlacementForm(form({ bookingUrl: 'https://x.com/"a b' }))).toMatchObject({
      success: true,
      data: { bookingUrl: "https://x.com/%22a%20b" },
    });
  });

  it("keeps a booking address of exactly 2048 characters", () => {
    const bookingUrl = `https://x.com/${"a".repeat(2048 - "https://x.com/".length)}`;
    expect(bookingUrl).toHaveLength(2048);
    expect(parsePlacementForm(form({ bookingUrl }))).toMatchObject({ success: true, data: { bookingUrl } });
  });
});
