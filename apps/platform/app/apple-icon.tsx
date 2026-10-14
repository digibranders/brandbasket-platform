import { headers } from "next/headers";
import type { ImageResponse } from "next/og";
import { createBrandIconResponse } from "@firstfold/shared/ui/brand-icon";
import { createInitialIconResponse } from "@/lib/server/initial-icon";
import { brandForHostHeader } from "@/lib/server/request-brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home screen icon: the full five-ring mark. iOS applies its own rounded mask. On the Fynix host, an F instead. */
export default async function AppleIcon(): Promise<ImageResponse> {
  if (brandForHostHeader((await headers()).get("host")).id === "fynix") {
    return createInitialIconResponse({ size: size.width, letter: "F", cornerRadius: 0 });
  }
  return createBrandIconResponse({
    size: size.width,
    rings: 5,
    strokeWidth: 2.6,
    markScale: 0.7,
    cornerRadius: 0,
  });
}
