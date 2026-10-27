import { Red_Hat_Display, Red_Hat_Mono, Red_Hat_Text } from "next/font/google";

/** Titles, in upright and italic. The website's own set (brandbasket-website lib/fonts.ts). */
const display = Red_Hat_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-red-hat-display", display: "swap" });
/** Body text, forms, buttons and labels. */
const text = Red_Hat_Text({ subsets: ["latin"], variable: "--font-red-hat-text", display: "swap" });
/** Figures: money, dates, times, counts. */
const mono = Red_Hat_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-red-hat-mono", display: "swap" });

/** The three font variables for `<html>`; theme.css `[data-app]` points the console's font names at them. */
export const brandbasketFontVariables = `${display.variable} ${text.variable} ${mono.variable}`;
