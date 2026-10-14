import Image from "next/image";
import type { ReactElement } from "react";
import type { DirectoryAdPlacement } from "@firstfold/db";
import { BRANDS, type Brand } from "@/lib/brand";
import { cn } from "@firstfold/shared/lib/cn";

/*
 * How an ad will look on the website, drawn the way the website draws it: the same picture-led cards, the Ad mark, the
 * call to action. It uses the business's own name and line and its own approved picture, or a stock photo of its kind
 * of place while it has none, so the owner sees their ad and not a diagram. Nothing here is clickable.
 */

export interface AdPreviewData {
  readonly name: string;
  /** The approved line, or the line the owner has saved, or null (the page shows a line for the category). */
  readonly tagline: string | null;
  /** The area, e.g. "Naupada", for "View in Naupada". */
  readonly place: string;
  /** Pictures to draw: tall (8 : 9), wide (8 : 5) and the square listing photo. Stock when the owner has none. */
  readonly tall: string;
  readonly wide: string;
  readonly square: string;
  /** Whether the pictures are stock photos, so the preview can say so. */
  readonly stock: boolean;
}

const AD_PILL = "rounded-full bg-paper/90 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-ink uppercase";

function Photo({ src, className, sizes }: { readonly src: string; readonly className?: string; readonly sizes: string }): ReactElement {
  return <Image src={src} alt="" fill sizes={sizes} unoptimized className={cn("object-cover", className)} />;
}

function line(data: AdPreviewData): string {
  return data.tagline ?? "Your line shows here once we have checked it.";
}

/** The list's first row: the card the list draws for every business, a size smaller, marked Ad beside the name. */
function TopRow({ data }: { readonly data: AdPreviewData }): ReactElement {
  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 rounded-card bg-paper p-4 shadow-sm ring-1 ring-line">
        <span className="relative block aspect-square overflow-hidden rounded-[10px] bg-paper-deep">
          <Photo src={data.square} sizes="56px" />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-serif text-lg font-medium">{data.name}</span>
            <span className="shrink-0 rounded-full px-2 py-px text-[0.6875rem] font-semibold text-ink-soft ring-1 ring-inset ring-ink-soft/65">Ad</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-ink-soft">{line(data)}</span>
        </span>
      </div>
      {[0, 1].map((index) => (
        <div key={index} aria-hidden="true" className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 rounded-card bg-paper/60 p-4 ring-1 ring-line">
          <span className="block aspect-square rounded-[10px] bg-paper-deep" />
          <span className="grid gap-2">
            <span className="h-2.5 w-2/3 rounded-full bg-line" />
            <span className="h-2 w-1/2 rounded-full bg-line/70" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A picture card with the name and line over it and a call to action along the bottom, as the side column draws it. */
function PictureCard({ data, src, tall, className }: { readonly data: AdPreviewData; readonly src: string; readonly tall: boolean; readonly className: string }): ReactElement {
  return (
    <div className={cn("grid grid-rows-[17fr_3fr] overflow-hidden rounded-lg", className)}>
      <span className="relative min-h-0 overflow-hidden bg-paper-deep">
        <Photo src={src} sizes="300px" />
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-transparent" />
        <span className={cn("absolute left-3 top-3", AD_PILL)}>Ad</span>
        <span className="absolute inset-x-0 bottom-0 grid gap-1 px-4 pb-3.5 text-paper">
          <span className={cn("font-serif font-medium leading-snug", tall ? "line-clamp-2 text-xl" : "line-clamp-1 text-lg")}>{data.name}</span>
          <span className={cn("text-sm leading-snug text-paper/85", tall ? "line-clamp-2" : "line-clamp-1")}>{line(data)}</span>
        </span>
      </span>
      <span className="flex min-h-0 items-center justify-between gap-3 bg-accent px-4 text-sm font-semibold text-paper">
        <span className="truncate">View in {data.place}</span>
        <span aria-hidden="true">→</span>
      </span>
    </div>
  );
}

function SideColumn({ data }: { readonly data: AdPreviewData }): ReactElement {
  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3">
      <div aria-hidden="true" className="grid content-start gap-2.5">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-card bg-paper/60 p-3 ring-1 ring-line">
            <span className="block aspect-square rounded-[10px] bg-paper-deep" />
            <span className="grid gap-2">
              <span className="h-2.5 w-3/4 rounded-full bg-line" />
              <span className="h-2 w-1/2 rounded-full bg-line/70" />
            </span>
          </div>
        ))}
      </div>
      <PictureCard data={data} src={data.tall} tall className="h-80" />
    </div>
  );
}

/** The home page's grid: the first tile is the large one, every tile its advertiser's picture with an arrow on it. */
function HomeGrid({ data }: { readonly data: AdPreviewData }): ReactElement {
  return (
    <div className="grid grid-cols-4 grid-rows-2 gap-2.5">
      <span className="relative col-span-2 row-span-2 min-h-56 overflow-hidden rounded-[18px] bg-paper-deep">
        <Photo src={data.tall} sizes="400px" />
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
        <span className={cn("absolute right-3 top-3", AD_PILL)}>Ad</span>
        <span className="absolute inset-x-0 bottom-0 grid gap-0.5 p-4 pr-14 text-paper">
          <span className="font-serif text-xl font-medium leading-tight">{data.name}</span>
          <span className="line-clamp-1 text-sm text-paper/85">{line(data)}</span>
        </span>
        <span aria-hidden="true" className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-white/90 text-accent">
          →
        </span>
      </span>
      {[0, 1, 2, 3].map((index) => (
        <span key={index} aria-hidden="true" className={cn("rounded-[14px] bg-paper-deep/80 ring-1 ring-line", index === 0 && "col-span-2")} />
      ))}
    </div>
  );
}

/** The card on a business page, under its details: the picture, the name with the Ad mark, the line and the way in. */
function ProfileCard({ data }: { readonly data: AdPreviewData }): ReactElement {
  return (
    <div className="grid gap-3">
      <div aria-hidden="true" className="grid gap-2 rounded-card bg-paper/60 p-4 ring-1 ring-line">
        <span className="h-3 w-1/3 rounded-full bg-line" />
        <span className="h-2 w-5/6 rounded-full bg-line/70" />
        <span className="h-2 w-2/3 rounded-full bg-line/70" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] overflow-hidden rounded-card bg-paper shadow-sm ring-1 ring-line">
        <span className="relative min-h-36">
          <Photo src={data.wide} sizes="260px" />
        </span>
        <span className="grid content-center gap-1 p-4">
          <span className="w-fit rounded-full px-2 py-px text-[0.6875rem] font-semibold text-ink-soft ring-1 ring-inset ring-ink-soft/65">Ad</span>
          <span className="font-serif text-lg font-medium leading-snug">{data.name}</span>
          <span className="line-clamp-2 text-sm text-ink-soft">{line(data)}</span>
          <span className="mt-1 text-sm font-semibold text-accent">View in {data.place} →</span>
        </span>
      </div>
    </div>
  );
}

const FRAME_TITLES: Readonly<Record<DirectoryAdPlacement, string>> = {
  home: "firstfold.io",
  top: "Dentists in your area",
  side: "Dentists in your area",
  profile: "A business page",
};

/** The chosen placement drawn on its page, in a browser-like frame. */
export function AdPreview({
  placement,
  data,
  brand = BRANDS.firstfold,
}: {
  readonly placement: DirectoryAdPlacement;
  readonly data: AdPreviewData;
  /** The brand the dashboard is sold under: the home page frame is titled with the directory's address, which is Firstfold's. */
  readonly brand?: Brand;
}): ReactElement {
  return (
    <figure>
      <div className="overflow-hidden rounded-card bg-paper-deep ring-1 ring-line">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
          <span aria-hidden="true" className="flex shrink-0 gap-1">
            <span className="size-1.5 rounded-full bg-ink-soft/65" />
            <span className="size-1.5 rounded-full bg-ink-soft/65" />
            <span className="size-1.5 rounded-full bg-ink-soft/65" />
          </span>
          <span className="truncate text-xs font-medium text-ink-soft">{placement === "home" && brand.id !== "firstfold" ? "The directory home page" : FRAME_TITLES[placement]}</span>
        </div>
        <div className="p-4">
          {placement === "top" ? <TopRow data={data} /> : placement === "side" ? <SideColumn data={data} /> : placement === "home" ? <HomeGrid data={data} /> : <ProfileCard data={data} />}
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-ink-soft">
        How your ad will look.{data.stock ? " Add your own picture below and it shows here." : ""}
      </figcaption>
    </figure>
  );
}
