import type { LiveDirectoryAds, LiveDirectoryPictures } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { adsResponseSchema } from "@/lib/directory-api";
import { adPictureLookup, adsWithPictures } from "./directory-pictures-feed";

const SMILE = "dentists/thane/naupada/smile-dental";
/** The place SMILE is a legacy key of. */
const SMILE_ID = "k7m2q9a";
const BRIGHT = "dentists/thane/naupada/bright-teeth";
const PHOTO = "0192f3c4-0000-7000-8000-000000000001";
const TALL = "0192f3c4-0000-7000-8000-000000000002";

const ads: LiveDirectoryAds = {
  top: { spot: 1, key: SMILE, linkUrl: null, picture: null, placeId: SMILE_ID, name: "Smile Dental", tagline: "Open Sundays" },
  side: [
    { spot: 1, key: BRIGHT, linkUrl: null, picture: null, placeId: null, name: "Bright Teeth", tagline: null },
    { spot: 2, key: SMILE, linkUrl: null, picture: null, placeId: SMILE_ID, name: "Smile Dental", tagline: "Open Sundays" },
  ],
  profile: { spot: 1, key: BRIGHT, linkUrl: null, picture: null, placeId: null, name: "Bright Teeth", tagline: null },
  home: [{ spot: 1, key: SMILE, linkUrl: null, picture: null, placeId: SMILE_ID, name: "Smile Dental", tagline: "Open Sundays" }],
};

describe("adPictureLookup", () => {
  it("names each advertiser once: by place, or by key when it has none", () => {
    expect(adPictureLookup(ads)).toEqual({ placeIds: [SMILE_ID], unplacedKeys: [BRIGHT] });
    expect(adPictureLookup({ top: null, side: [], profile: null, home: [] })).toEqual({ placeIds: [], unplacedKeys: [] });
  });
});

describe("adsWithPictures", () => {
  it("gives each ad its advertiser's id and approved pictures, and nulls where there are none", () => {
    const pictures = new Map<string, LiveDirectoryPictures>([[SMILE_ID, { listing: PHOTO, ad_tall: TALL, ad_wide: null }]]);
    const answer = adsWithPictures(ads, pictures);
    expect(answer).toEqual({
      top: { spot: 1, key: SMILE, id: SMILE_ID, name: "Smile Dental", tagline: "Open Sundays", pictures: { photo: PHOTO, tall: TALL, wide: null } },
      side: [
        { spot: 1, key: BRIGHT, id: null, name: "Bright Teeth", tagline: null, pictures: { photo: null, tall: null, wide: null } },
        { spot: 2, key: SMILE, id: SMILE_ID, name: "Smile Dental", tagline: "Open Sundays", pictures: { photo: PHOTO, tall: TALL, wide: null } },
      ],
      profile: { spot: 1, key: BRIGHT, id: null, name: "Bright Teeth", tagline: null, pictures: { photo: null, tall: null, wide: null } },
      home: [{ spot: 1, key: SMILE, id: SMILE_ID, name: "Smile Dental", tagline: "Open Sundays", pictures: { photo: PHOTO, tall: TALL, wide: null } }],
    });
    expect(adsResponseSchema.safeParse(answer).success).toBe(true);
  });

  it("answers no ads as no ads", () => {
    expect(adsWithPictures({ top: null, side: [], profile: null, home: [] }, new Map())).toEqual({
      top: null,
      side: [],
      profile: null,
      home: [],
    });
  });
});

describe("a link ad", () => {
  const linkAd = { spot: 1, key: "dentists/thane/naupada/link-ad", linkUrl: "https://example.com/offer", picture: null, placeId: null, name: "Free check-up camp", tagline: "This Sunday" };

  it("looks for no pictures, because no business is behind it", () => {
    expect(adPictureLookup({ top: null, side: [linkAd], profile: null, home: [] })).toEqual({ placeIds: [], unplacedKeys: [] });
  });

  it("carries its link, validates against the contract, and leaves other ads' answers unchanged", () => {
    const answer = adsWithPictures({ top: null, side: [linkAd, { spot: 2, key: BRIGHT, linkUrl: null, picture: null, placeId: null, name: "Bright Teeth", tagline: null }], profile: null, home: [] }, new Map());
    expect(answer.side[0]).toEqual({ spot: 1, key: linkAd.key, link: linkAd.linkUrl, id: null, name: linkAd.name, tagline: linkAd.tagline, pictures: { photo: null, tall: null, wide: null } });
    expect(answer.side[1]).not.toHaveProperty("link");
    expect(adsResponseSchema.safeParse(answer).success).toBe(true);
  });
});

describe("a picture staff uploaded for an ad", () => {
  const STAFF_PICTURE = "0192f3c4-0000-7000-8000-0000000000aa";
  const OWN_TALL = "0192f3c4-0000-7000-8000-0000000000bb";
  const linkAd = { key: "dentists/thane/naupada/link-ad", linkUrl: "https://example.com/offer", placeId: null, name: "Camp", tagline: null };

  it("fills the shape of its spot: tall for the first side spot, wide for another", () => {
    const answer = adsWithPictures(
      {
        top: null,
        side: [
          { ...linkAd, spot: 1, picture: { id: STAFF_PICTURE, shape: "tall" } },
          { ...linkAd, spot: 2, picture: { id: STAFF_PICTURE, shape: "wide" } },
        ],
        profile: null,
        home: [],
      },
      new Map(),
    );
    expect(answer.side[0]?.pictures).toEqual({ photo: null, tall: STAFF_PICTURE, wide: null });
    expect(answer.side[1]?.pictures).toEqual({ photo: null, tall: null, wide: STAFF_PICTURE });
    expect(adsResponseSchema.safeParse(answer).success).toBe(true);
  });

  it("takes the place of a business's own picture in that shape only", () => {
    const ad = { spot: 1, key: SMILE, linkUrl: null, picture: { id: STAFF_PICTURE, shape: "tall" as const }, placeId: SMILE_ID, name: "Smile Dental", tagline: null };
    const pictures = new Map<string, LiveDirectoryPictures>([[SMILE_ID, { listing: PHOTO, ad_tall: OWN_TALL, ad_wide: TALL }]]);
    expect(adsWithPictures({ top: null, side: [ad], profile: null, home: [] }, pictures).side[0]?.pictures).toEqual({ photo: PHOTO, tall: STAFF_PICTURE, wide: TALL });
  });
});

describe("which spot an ad holds", () => {
  it("names the spot on every ad, so a free spot between two ads stays free on the website", () => {
    const home = [
      { spot: 1, key: SMILE, linkUrl: null, picture: null, placeId: SMILE_ID, name: "Smile Dental", tagline: null },
      { spot: 3, key: BRIGHT, linkUrl: null, picture: null, placeId: null, name: "Bright Teeth", tagline: null },
    ];
    const answer = adsWithPictures({ top: null, side: [], profile: null, home }, new Map());
    expect(answer.home?.map((ad) => ad.spot)).toEqual([1, 3]);
    expect(adsResponseSchema.safeParse(answer).success).toBe(true);
  });

  it("is a spot the contract can hold: 1 to 4, and an answer without one still validates", () => {
    const ad = { key: SMILE, id: null, name: "Smile Dental", tagline: null };
    expect(adsResponseSchema.safeParse({ top: null, side: [ad], home: [{ ...ad, spot: 4 }] }).success).toBe(true);
    expect(adsResponseSchema.safeParse({ top: null, side: [{ ...ad, spot: 0 }] }).success).toBe(false);
    expect(adsResponseSchema.safeParse({ top: null, side: [{ ...ad, spot: 5 }] }).success).toBe(false);
  });
});
