import { Red_Hat_Display, Red_Hat_Mono, Red_Hat_Text } from "next/font/google";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { GTM_ID } from "@/features/consent/consent";
import { ConsentBanner } from "@/features/consent/components/consent-banner";
import { ToastProvider } from "@/ui";
import "@/styles/globals.css";

const display = Red_Hat_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-red-hat-display",
  display: "swap",
});
const text = Red_Hat_Text({
  subsets: ["latin"],
  variable: "--font-red-hat-text",
  display: "swap",
});
const mono = Red_Hat_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-red-hat-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Brandbasket", template: "%s | Brandbasket" },
  // The workspace is private on every host (the X-Robots-Tag header says the same).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${text.variable} ${mono.variable}`}>
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
