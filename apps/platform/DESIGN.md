# Customer dashboard design (v2)

The owner chose direction B, "Ledger", on 2026-10-26: `docs/plans/28-platform-redesign-ux.md`, mock
`docs/design/platform-ledger.html`. This file is the rulebook for every new or reworked screen. Pages not reworked yet
still use the older components; they already take the v2 palette and type through theme.css `[data-app="customer"]`.

## Palette (theme.css `@theme`)

| Token | Value | Use |
|---|---|---|
| `bg` | #f6f5f2 | Page |
| `surface` | #ffffff | The one raised surface |
| `sunken` | #eeece7 | Soft buttons, chips, picks, empty markers |
| `ink` | #15161a | Text, the rail, the primary button |
| `ink-2` | #4e5057 | Secondary text |
| `line` | #e3e0d9 | Hairlines |
| `rattan`, `rattan-text`, `rattan-ink`, `rattan-wash` | #c48a47, #a46c2f, #8a5524, #f4e6d3 | The one accent: the picked time, "now" markers, waiting states |
| `sage`, `sage-wash`, `sage-deep` | #4a745e, #e5efe8, #2f5a43 | Done |
| `error` | #b42318 | Problems |
| `c-site`, `c-growth`, `c-search` | #a8743c, #2f7f7a, #3d5a8a | Service tags: Website, Social & Ads, Search |

No other hex values in new code. No dark mode.

## Type

Red Hat Display for titles (`font-display`), Red Hat Text for everything else, Red Hat Mono for figures: money,
dates, times and counts (`font-figure`, plus `tabular-nums`). Sentence case. Nothing below 11px. No uppercase
letter-spaced labels.

## Icons

Phosphor (`@phosphor-icons/react/dist/ssr`), regular weight, `fill` only for a done check. 16 to 18px in rows, 18px in
the rail. Never hand-drawn SVG. The older `@brandbasket/shared/ui/icons` set stays on pages not reworked yet.

## Surfaces

1. One dark button per screen: the task's main action.
2. One raised surface per screen, for the task only (`bg-surface rounded-lift shadow-lift`, no border).
3. Everything else sits on the page: a section title (`font-display`, 15px, a hairline under it) and rows split by
   hairlines. No card around it.
4. Secondary buttons and chips are soft fills (`bg-sunken`), never outlined.
5. Form inputs keep a light edge so people can see where to type.
6. No tinted bands behind rows, and no shadows other than `shadow-lift`.

## Layout

Desktop: the dark rail (232px) and the page inset 8px on three sides with a 14px radius. Phones: a light top bar
with the logo and search, a bottom tab bar, and a Menu sheet for the rest. Content column up to 1088px. Task on the
left, things to read on the right; one column on phones. Must work at 390px with no sideways scroll.

## Words

Plain words, one idea per line. Every state has a word as well as a colour. Dates sit next to the action that moves
them ("With this time, your website can be live by Thu 5 Nov"). New copy goes to the owner before it ships.

## Motion

`transition-colors` or `transition-transform` at 200ms; `active:translate-y-px` on buttons. Respect reduced motion.

## Not allowed

- Bordered boxes around sections or rows.
- More than one raised surface, or more than one dark button, on a screen.
- Outlined secondary buttons or chips.
- Colour as the only sign of a state.
- Modals for confirmation. Dialogs are for search and the phone menu only.
- Fonts other than Red Hat; hex values outside the palette above.
- Em or en dashes in any copy.
