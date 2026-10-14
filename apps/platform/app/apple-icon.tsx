import type { ImageResponse } from "next/og";
import { createInitialIconResponse } from "@/lib/server/initial-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home screen icon: an F on Fynix's navy. iOS applies its own rounded mask. */
export default function AppleIcon(): ImageResponse {
  return createInitialIconResponse({ size: size.width, letter: "F", cornerRadius: 0 });
}
