# Staff console design (v2)

The owner approved the console redesign on 2026-10-26: `docs/plans/40-console-redesign-audit.md`, plan index
`docs/plans/41-console-redesign-plan.md`, mock `docs/design/console-mock.html`. This file is the rulebook for every new
or reworked console screen. Pages not reworked yet follow `DESIGN-v1.md`; they already take the v2 palette and type
through theme.css `[data-app="console"]`.

## Palette (theme.css `@theme`)

The same palette as the customer dashboard (`apps/platform/DESIGN.md`): `bg` page, `surface` the one raised surface,
`sunken` soft buttons and chips, `ink` text, the rail and the dark button, `ink-2` secondary text, `line` hairlines,
`rattan` family the one accent (counts, waiting states), `sage` family done, `error` problems, `c-site`, `c-growth`,
`c-search` service tags. No other hex values in new code.

## Type

Red Hat Display for titles (`font-display`), Red Hat Text for everything else, Red Hat Mono for figures: money, dates,
times, counts and ids (`font-figure`, plus `tabular-nums`). Sentence case. Nothing below 11px. No uppercase
letter-spaced labels.

## Icons

Phosphor (`@phosphor-icons/react/dist/ssr`), regular weight, `fill` for the current rail entry. 16 to 18px. Never
hand-drawn SVG. The older `@brandbasket/shared/ui/icons` set stays on pages not reworked yet.

## Shell

The dark rail from `lg` up (`components/console/rail.tsx`): logo, "Search everything" (⌘K), the sections from
`lib/console-rail.ts` with counts, the signed-in person at the foot. Below `lg`, a light top bar with search and Menu.
The page sits inset 8px with a 14px radius. A role never sees an entry it cannot open.

## Building blocks (`components/console/`)

`PageHeader`, `Section`, `Figures` (the KPI line), `FilterPills`, `HairlineList`, `StatusDot`, `StatusPill`, `Notice`,
the table class strings in `table.ts`, `LIFT` and `SECTION_TITLE` in `classes.ts`, and the buttons in `buttons.ts`.
New screens build from these; they do not restate their colours.

## Surfaces

1. One dark button per screen (`buttonPrimary`): the screen's main action.
2. One raised surface per screen (`LIFT`): the task, such as the queue on Today or the open enquiry.
3. Everything else sits on the page: a section title with a hairline under it, then rows split by hairlines.
4. Secondary buttons and chips are soft fills (`buttonSecondary`, `buttonSmall`, `FilterPills`), never outlined.
5. Form fields keep a visible edge (`border-ink-2/65` at least).

## Lists

Staff compare rows, so lists are tables (`TABLE`, `TH`, `TD`, `TD_NUM`, `TD_TIME`). The first column says what the row
is; figures are right-aligned in the figure face; dates are quiet. A list that opens a detail beside it marks the
open row with `TR_SELECTED`. Filters are `FilterPills` above the table, with counts. A list opens on the filter that
shows work to do, never on one that hides everything.

## Accessibility

- Text 4.5:1, marks and field edges 3:1. `rattan-text` only for text 18px and up; small accent text uses `rattan-ink`.
- Focus is always visible; on the dark rail the ring is white.
- `aria-current="page"` on the open rail entry and filter chip.
- Every state has a word as well as a colour (`StatusPill`, `StatusDot`).
- Dialogs are native `<dialog>` elements: search, the phone menu and existing non-confirmation dialogs only.

## Words

Plain words, sentence case, one idea per line. Say who, what and when. No em or en dashes. New copy goes to the owner
before it ships.

## Money

Unchanged from `DESIGN-v1.md` "Money": amounts through `formatMoney`, a first-person confirm on every action that moves
money, and money pages and actions behind `requireStaffCan("money")`.

## Not allowed

- Bordered boxes around sections or rows; more than one raised surface or dark button on a screen.
- Outlined secondary buttons or chips.
- Colour as the only sign of a state.
- Modals for confirmation.
