import type { ImageResponse } from "next/og";
import { createInitialIconResponse } from "@/lib/server/initial-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: an F on Fynix's navy. */
export default function Icon(): ImageResponse {
  return createInitialIconResponse({ size: size.width, letter: "F", cornerRadius: 7 });
}
