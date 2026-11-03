// Basket UI enforcement (plan 60, section 16; plan 61, section 2). Copied from idraft's eslint.config.mjs and adjusted:
// no extra plugins, the class rules read string literals with no-restricted-syntax.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const SOURCES = ["src/**/*.{ts,tsx}"];
const TESTS = ["src/**/*.test.{ts,tsx}"];

// -------------------------------------------------------------------------------------------------
// Imports. A later no-restricted-imports replaces an earlier one for the same file, so each block repeats the bans.

const BANNED_IMPORTS = [
  {
    regex: "(^|/)apps/platform(/|$)|(^|/)\\.\\./platform(/|$)|^@brandbasket/platform(/|$)",
    message: "apps/customer never imports the old app. Port the logic into a feature's rules.ts with its tests (BUILD-RULES rule 1).",
  },
  {
    group: ["@brandbasket/shared/ui", "@brandbasket/shared/ui/*", "@brandbasket/shared/styles", "@brandbasket/shared/styles/*"],
    message: "The old UI and theme stay in the old app. Use src/ui and src/styles (BUILD-RULES rule 1).",
  },
  {
    group: ["@radix-ui/*", "radix-ui", "@mui/*", "antd", "@chakra-ui/*", "@mantine/*", "@headlessui/*"],
    message: "Base UI through src/ui is the only component system (plan 60, section 10).",
  },
  {
    group: ["lucide-react", "react-icons", "react-icons/*", "@heroicons/*", "@tabler/icons-react"],
    message: "Phosphor through the Icon primitive is the only icon set (plan 60, section 7).",
  },
  {
    group: ["recharts", "echarts", "echarts/*", "echarts-for-react", "chart.js", "victory", "@nivo/*"],
    message: "Charts are the in-house LineChart, Sparkline and BarList (plan 60, section 11).",
  },
  { group: ["sonner", "react-hot-toast"], message: "Toasts use the Toast primitive in src/ui." },
];
const PHOSPHOR = {
  group: ["@phosphor-icons/*"],
  message: "Import icons through the Icon primitive (src/ui/icon.tsx), which sets the light weight and the accessible name.",
};
const UI_BOUNDARY = {
  group: ["@/features/*", "@/components/*", "@/app/*", "@/lib/guards", "@/lib/db", "@/lib/session", "@/lib/auth"],
  message: "Primitives know nothing about the product: they import React, Base UI, the Icon primitive and other primitives only.",
};
const restrictedImports = (...extra) => ["error", { patterns: [...BANNED_IMPORTS, ...extra] }];

// -------------------------------------------------------------------------------------------------
// Literals: colours come from tokens, classes from the Basket UI scales.

const COLOR_MESSAGE = "Colours come from tokens (src/styles/tokens.css), never from literals in code (plan 60, section 3).";
// A hex colour is 3, 4, 6 or 8 hex digits and nothing more: "#page" and "#add-item" are anchors.
const HEX = "/#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\\w-])/";
const COLOR_FUNCTION = "/\\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\\(/";
const PALETTES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const PALETTE_UTILITIES =
  "bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|divide|from|via|to|shadow|accent|caret|decoration|placeholder|inset-shadow|inset-ring";
const PALETTE_CLASS = `/(^|[\\s:!])-?(${PALETTE_UTILITIES})-(${PALETTES})(-(50|[1-9]00|950))?(?![\\w-])/`;
const PALETTE_MESSAGE = "Tailwind palette colours are not part of Basket UI. Use a token utility such as bg-surface or text-ink-3.";
const STEPS = "0|0\\.5|1|1\\.5|2|2\\.5|3|3\\.5|4|5|6|7|8|10|12|px|auto";
const SPACING_CLASS = `/(^|[\\s:!])-?(p[xytrblse]?|m[xytrblse]?|gap(-[xy])?|space-[xy])-(?!(${STEPS})(?![\\w.-]))\\d/`;
const SPACING_MESSAGE = "Spacing uses the 4px scale only: 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48 (plan 60, section 5).";
const ARBITRARY = "/(^|[\\s:!])[\\w-]*-\\[[^\\]]+\\]/";
const ARBITRARY_MESSAGE = "Arbitrary values (p-[13px]) are allowed only inside src/ui. Use a token utility, or add the token first.";

const literalRules = (pattern, message) => [
  { selector: `Literal[value=${pattern}]`, message },
  { selector: `TemplateElement[value.cooked=${pattern}]`, message },
  { selector: `JSXText[value=${pattern}]`, message },
];
const LITERAL_RULES = [
  ...literalRules(HEX, COLOR_MESSAGE),
  ...literalRules(COLOR_FUNCTION, COLOR_MESSAGE),
  ...literalRules(PALETTE_CLASS, PALETTE_MESSAGE),
  ...literalRules(SPACING_CLASS, SPACING_MESSAGE),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  {
    files: SOURCES,
    rules: {
      "no-restricted-imports": restrictedImports(PHOSPHOR),
      "no-restricted-syntax": ["error", ...LITERAL_RULES, ...literalRules(ARBITRARY, ARBITRARY_MESSAGE)],
    },
  },
  // Primitives may use arbitrary values (Base UI's anchor sizes), and the Icon primitive alone imports Phosphor.
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(PHOSPHOR, UI_BOUNDARY),
      "no-restricted-syntax": ["error", ...LITERAL_RULES],
    },
  },
  { files: ["src/ui/icon.tsx"], rules: { "no-restricted-imports": restrictedImports(UI_BOUNDARY) } },

  // Numbers, money and dates are written by src/lib/format.ts only (plan 60, section 12).
  {
    files: SOURCES,
    ignores: ["src/lib/format.ts", ...TESTS],
    rules: {
      "no-restricted-properties": [
        "error",
        ...["NumberFormat", "DateTimeFormat", "RelativeTimeFormat", "ListFormat", "PluralRules"].map((property) => ({
          object: "Intl",
          property,
          message: "Use @/lib/format.",
        })),
        ...["toLocaleString", "toLocaleDateString", "toLocaleTimeString", "toFixed", "toPrecision"].map((property) => ({
          property,
          message: "Use @/lib/format.",
        })),
      ],
    },
  },
]);

export default eslintConfig;
