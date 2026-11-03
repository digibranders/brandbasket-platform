"use client";

import { GeistSans } from "geist/font/sans";
import { RouteError } from "./route-error";
import "@/styles/globals.css";

/** Replaces the root layout when it fails, so it brings its own document, styles and font. */
export default function GlobalError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  return (
    <html lang="en-IN" className={GeistSans.variable}>
      <body>
        <title>Brandbasket</title>
        <main id="page" className="mx-auto w-full max-w-page px-gutter py-8">
          <RouteError error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
