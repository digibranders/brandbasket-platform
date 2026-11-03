import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { GTM_ID } from "@/features/consent/consent";
import { ConsentBanner } from "@/features/consent/components/consent-banner";
import { ToastProvider } from "@/ui";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Brandbasket", template: "%s | Brandbasket" },
  // The workspace is private on every host (the X-Robots-Tag header says the same).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <NuqsAdapter>
          <ToastProvider>{children}</ToastProvider>
          {/* Only with a Tag Manager container configured; without one no third-party tag loads and nothing is asked. */}
          {GTM_ID === null ? null : <ConsentBanner />}
        </NuqsAdapter>
      </body>
    </html>
  );
}
