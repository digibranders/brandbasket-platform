import "server-only";
import { ImageResponse } from "next/og";

interface InitialIconOptions {
  readonly size: number;
  readonly letter: string;
  readonly cornerRadius: number;
}

/**
 * A plain letter on a dark square, for a brand that has no icon file of its own to serve (Fynix Digital's site ships no
 * favicon). Swap this for the brand's real mark when it has one.
 */
export function createInitialIconResponse({ size, letter, cornerRadius }: InitialIconOptions): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1c1c1c",
          color: "#ffffff",
          borderRadius: cornerRadius,
          fontSize: Math.round(size * 0.68),
          fontWeight: 700,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size },
  );
}
