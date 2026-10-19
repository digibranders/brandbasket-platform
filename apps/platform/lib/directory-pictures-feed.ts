// Types only: nothing here touches the database.
import type { DirectoryLookup, LiveDirectoryAd, LiveDirectoryAds, LiveDirectoryPictures } from "@brandbasket/db";
import type { AdsResponse, DirectoryAd } from "@/lib/directory-api";

/*
 * How a listing's approved pictures reach the website's answers (lib/directory-api.ts, "Pictures"), kept free of the
 * database so it can be tested.
 */

function adsOf(ads: LiveDirectoryAds): readonly LiveDirectoryAd[] {
  return [...(ads.top === null ? [] : [ads.top]), ...ads.side, ...(ads.profile === null ? [] : [ads.profile]), ...ads.home];
}

/** Every advertiser an answer of ads names, once, for one read of their pictures: by place, or by key when it has none. */
export function adPictureLookup(ads: LiveDirectoryAds): DirectoryLookup {
  const placeIds = new Set<string>();
  const unplacedKeys = new Set<string>();
  for (const ad of adsOf(ads)) {
    // A link ad has no business, so there are no pictures to look for.
    if (ad.linkUrl !== null) continue;
    if (ad.placeId === null) unplacedKeys.add(ad.key);
    else placeIds.add(ad.placeId);
  }
  return { placeIds: [...placeIds], unplacedKeys: [...unplacedKeys] };
}

function withPictures(ad: LiveDirectoryAd, pictures: ReadonlyMap<string, LiveDirectoryPictures>): DirectoryAd {
  const own = ad.linkUrl === null ? pictures.get(ad.placeId ?? ad.key) : undefined;
  // A picture staff uploaded for this ad takes the place of the business's own in the shape of its spot.
  const staffTall = ad.picture?.shape === "tall" ? ad.picture.id : null;
  const staffWide = ad.picture?.shape === "wide" ? ad.picture.id : null;
  return {
    spot: ad.spot,
    key: ad.key,
    ...(ad.linkUrl === null ? {} : { link: ad.linkUrl }),
    id: ad.placeId,
    name: ad.name,
    tagline: ad.tagline,
    pictures: { photo: own?.listing ?? null, tall: staffTall ?? own?.ad_tall ?? null, wide: staffWide ?? own?.ad_wide ?? null },
  };
}

/** This week's ads with each advertiser's id and approved pictures; an advertiser with none gets nulls, and the website its own fallbacks. */
export function adsWithPictures(ads: LiveDirectoryAds, pictures: ReadonlyMap<string, LiveDirectoryPictures>): AdsResponse {
  return {
    top: ads.top === null ? null : withPictures(ads.top, pictures),
    side: ads.side.map((ad) => withPictures(ad, pictures)),
    profile: ads.profile === null ? null : withPictures(ads.profile, pictures),
    home: ads.home.map((ad) => withPictures(ad, pictures)),
  };
}
