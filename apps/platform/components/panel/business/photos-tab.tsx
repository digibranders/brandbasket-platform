import type { ReactElement } from "react";
import type { DirectoryPictureSlot } from "@firstfold/db";
import { GALLERY_SLOTS } from "@firstfold/shared/lib/directory/pictures";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { VideosSection } from "@/components/panel/business/videos-section";
import { PhotosEditor } from "@/components/panel/business/photos-editor";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import { MEMBERSHIP_PATH } from "@/lib/membership";
import type { GalleryEntry } from "@/lib/photos-editor";
import { shownPicture, type SlotPictures } from "@/lib/photos-view";
import type { VideosView } from "@/lib/videos-view";
import { youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube-video";

interface PhotosTabProps {
  readonly slots: Readonly<Record<DirectoryPictureSlot, SlotPictures>>;
  /** The saved YouTube video id, or null. */
  readonly videoId: string | null;
  /** Whether the Details are saved: the video goes on the profile they made. */
  readonly hasDetails: boolean;
  /** False once staff have taken the business down: it can look but not add. */
  readonly canChange: boolean;
  /** Whether the business's page is live, so a new photo shows on it straight away. */
  readonly published: boolean;
  readonly removePhotoAction: (formData: FormData) => Promise<void>;
  /** A Premium member's short videos: what to show, or why they are not available. */
  readonly videosView: VideosView;
  readonly removeClipAction: (formData: FormData) => Promise<void>;
  /** Puts a live video in the mosaic at the top of the page, or takes it out (`featured` 1 or 0). */
  readonly featureClipAction: (formData: FormData) => Promise<void>;
  readonly saveVideoAction: (formData: FormData) => Promise<void>;
  readonly removeVideoAction: (formData: FormData) => Promise<void>;
  /** The tab after this one, for "Next"; null when there is none to go on to. */
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

const INPUT_CLASSES =
  "block w-full rounded-control border border-ink-soft/65 bg-white px-4 py-2.5 text-base text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";

function VideoSection({
  videoId,
  hasDetails,
  canChange,
  saveVideoAction,
  removeVideoAction,
}: Pick<PhotosTabProps, "videoId" | "hasDetails" | "canChange" | "saveVideoAction" | "removeVideoAction">): ReactElement {
  return (
    <section aria-labelledby="video-title" className="mt-12 max-w-2xl border-t border-line pt-6">
      <h2 id="video-title" className="panel-section">
        Featured video
      </h2>
      <p className="mt-1 text-sm text-ink-soft">A YouTube video about your business, played on your page.</p>

      {videoId === null ? null : (
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer" className="group relative block w-56 overflow-hidden rounded-[14px] bg-paper-deep">
            {/* A YouTube thumbnail, served by YouTube: next/image would fetch it through our own server for nothing. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={youtubeThumbnailUrl(videoId)} alt="Your featured video" width={480} height={360} className="aspect-video w-full object-cover" />
            <span className="absolute inset-0 grid place-items-center bg-ink/20 transition-colors duration-300 ease-calm group-hover:bg-ink/35">
              <span className="grid size-11 place-items-center rounded-full bg-paper/95 text-ink">
                <ArrowIcon className="size-5" />
              </span>
            </span>
            <span className="sr-only"> (opens YouTube in a new tab)</span>
          </a>
          {canChange ? (
            <form action={removeVideoAction}>
              <button type="submit" className="rounded-full px-3 py-2 text-sm text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink">
                Remove video
              </button>
            </form>
          ) : null}
        </div>
      )}

      {!canChange ? null : hasDetails ? (
        <form action={saveVideoAction} className="mt-5 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="video-link" className="text-[0.8125rem] text-ink-soft">
              {videoId === null ? "YouTube link" : "Use a different video"}
              <RequiredMark />
            </label>
            <input
              id="video-link"
              name="video"
              type="text"
              inputMode="url"
              required
              autoCapitalize="none"
              spellCheck={false}
              maxLength={300}
              placeholder="https://youtu.be/…"
              className={`mt-1.5 ${INPUT_CLASSES}`}
            />
          </div>
          <SubmitButton size="sm" variant="secondary">
            Save video
          </SubmitButton>
        </form>
      ) : (
        <p className="mt-5 text-sm text-ink-soft">Save your Identity first, then add a video here.</p>
      )}
    </section>
  );
}

/**
 * The Photos tab (the sheet's Photos): a small copy of the page to tap for the banner, which the page needs before it
 * goes live, and the feature photo, cropped to the directory's square; one gallery of up to twenty; a Premium member's
 * short videos; and a featured video, a YouTube link. Each picture is live as soon as it is uploaded. "Next" goes on
 * to Contact options.
 */
export function PhotosTab(props: PhotosTabProps): ReactElement {
  const { slots, canChange, published, removePhotoAction, next } = props;
  const gallery: readonly GalleryEntry[] = GALLERY_SLOTS.map((slot) => ({ slot, pictureId: shownPicture(slots[slot])?.id ?? null }));
  return (
    <>
      <PhotosEditor
        feature={shownPicture(slots.listing)?.id ?? null}
        gallery={gallery}
        canChange={canChange}
        published={published}
        removeAction={removePhotoAction}
      />
      <VideosSection
        view={props.videosView}
        canChange={canChange}
        removeAction={props.removeClipAction}
        featureAction={props.featureClipAction}
        premiumHref={MEMBERSHIP_PATH}
        listingHref={profileHref("listing")}
      />
      <VideoSection {...props} />
      {next === null ? null : (
        <div className="mt-12">
          <ButtonLink href={profileHref(next.id)} variant="secondary">
            Next: {next.label}
            <ArrowIcon className="size-4" />
          </ButtonLink>
        </div>
      )}
    </>
  );
}
