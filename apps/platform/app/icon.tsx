import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { createBrandIconResponse } from "@firstfold/shared/ui/brand-icon";
import { createInitialIconResponse } from "@/lib/server/initial-icon";
import { brandForHostHeader } from "@/lib/server/request-brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: three rings instead of five, so the mark stays legible at 16–32px. On the Fynix host, an F instead. */
export default async function Icon(): Promise<ImageResponse> {
  if (brandForHostHeader((await headers()).get("host")).id === "fynix") {
    return createInitialIconResponse({ size: size.width, letter: "F", cornerRadius: 7 });
  }
  return createBrandIconResponse({
    size: size.width,
    rings: 3,
    strokeWidth: 6.5,
    markScale: 0.84,
    cornerRadius: 7,
  });
}
