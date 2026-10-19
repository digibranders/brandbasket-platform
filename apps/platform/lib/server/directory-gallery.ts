import "server-only";
import {
  answerByAsked,
  readLiveDirectoryPictures,
  readLiveDirectoryVideos,
  resolveDirectoryAsk,
  type Database,
  type DirectoryAsk,
  type DirectoryLookup,
  type LiveDirectoryPictures,
  type LiveDirectoryVideo,
  type ResolvedDirectoryAsk,
} from "@brandbasket/db";
import { vimeoEmbedUrl } from "@brandbasket/shared/lib/directory/videos";
import { GALLERY_SLOTS } from "@brandbasket/shared/lib/directory/pictures";
import type { GalleryEntry, GalleryResponse } from "@/lib/directory-api";

/*
 * The work behind `GET /api/directory/gallery` (docs/superpowers/specs/2026-10-07-business-videos-design.md): what a
 * business's page shows beside its photo: the owner's gallery photos, and for a Premium member its live videos, each as
 * the address of Vimeo's player and a poster. Read on the staff connection, like the status answer: the pictures and
 * videos tables are not the website's to read, and the website's shared secret has already been checked by the route.
 */

/**
 * One business's gallery: its gallery photos in slot order (the listing photo, banner and ad pictures are shown
 * elsewhere), then its videos in slot order. Null when it has neither, so the answer carries only businesses with
 * something to show.
 */
export function galleryEntryOf(pictures: LiveDirectoryPictures | undefined, videos: readonly LiveDirectoryVideo[] | undefined): GalleryEntry | null {
  const photos = GALLERY_SLOTS.flatMap((slot) => {
    const id = pictures?.[slot];
    return id === null || id === undefined ? [] : [id];
  });
  const shown = (videos ?? []).map((video) => ({
    id: video.id,
    embed: vimeoEmbedUrl(video.vimeoId, video.vimeoHash),
    poster: video.posterUrl,
    seconds: video.durationMs / 1000,
    width: video.width,
    height: video.height,
    featured: video.featured,
  }));
  return photos.length === 0 && shown.length === 0 ? null : { photos, videos: shown };
}

export interface GalleryDeps {
  readonly resolveAsk: (ask: DirectoryAsk) => Promise<ResolvedDirectoryAsk>;
  readonly livePictures: (lookup: DirectoryLookup) => Promise<ReadonlyMap<string, LiveDirectoryPictures>>;
  readonly liveVideos: (lookup: DirectoryLookup) => Promise<ReadonlyMap<string, readonly LiveDirectoryVideo[]>>;
}

/** The dependencies the route uses: the staff connection's reads. */
export function galleryDeps(db: Database): GalleryDeps {
  return {
    resolveAsk: (ask) => resolveDirectoryAsk(db, ask),
    livePictures: (lookup) => readLiveDirectoryPictures(db, lookup),
    liveVideos: (lookup) => readLiveDirectoryVideos(db, lookup),
  };
}

/**
 * The galleries of up to 50 businesses, each read once by its place (or by its key, for a key no place has) and answered
 * under every id and key it was asked by. A business with no photo and no video is left out.
 */
export async function readGalleries(ask: DirectoryAsk, deps: GalleryDeps): Promise<GalleryResponse> {
  const resolved = await deps.resolveAsk(ask);
  const [pictures, videos] = await Promise.all([deps.livePictures(resolved.lookup), deps.liveVideos(resolved.lookup)]);
  const byBusiness = new Map<string, GalleryEntry>();
  for (const business of new Set([...pictures.keys(), ...videos.keys()])) {
    const entry = galleryEntryOf(pictures.get(business), videos.get(business));
    if (entry !== null) byBusiness.set(business, entry);
  }
  return { galleries: Object.fromEntries(answerByAsked(resolved, byBusiness)) };
}
