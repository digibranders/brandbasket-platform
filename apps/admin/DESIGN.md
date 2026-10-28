# Staff console design (v2)

The owner chose the console redesign on 2026-10-26: `docs/plans/40-console-redesign-audit.md`, contract
`docs/plans/41-console-redesign-plan.md`, mock `docs/design/console-mock.html`. It uses the same palette, type and
surfaces as the customer dashboard (`apps/platform/DESIGN.md`), made denser for staff.

## Palette

Tokens from `packages/shared/src/styles/theme.css`, applied to the console by `html[data-app="console"]`:
`bg` page, `surface` the one raised surface, `sunken` soft buttons and chips, `ink` text and the rail, `ink-2`
secondary text, `line` hairlines, `rattan` family for the one accent (counts, waiting states), `sage` family for
done, `error` for problems and late work. No other hex values in components.

## Type

Red Hat Display for titles (`font-display`), Red Hat Text for everything else, Red Hat Mono for figures: money, dates,
times, counts and ids (`font-figure`, plus `tabular-nums`). Sentence case. Nothing below 11px. No uppercase
letter-spaced labels.

## Shell

- The dark rail (`lib/console-rail.ts`, rendered by the console shell): logo, "Search everything" with ⌘K, Today,
  then Work, Money and System groups with live counts (`lib/server/rail-counts.ts`), the signed-in staff member at the
  foot. A count in red means late or failed work.
- Items a role cannot use are hidden (`needs` in the rail entry), and the page refuses them as well
  (`requireStaffCan`).
- The page sits inset 8px with a 14px radius on the rail. Content up to 1400px.
- URLs never change for a relabel: `/leads` is Enquiries, `/support` is Requests.

## Surfaces

1. One dark button per screen (`buttonPrimary`): the screen's main action.
2. One raised surface per screen (`LIFT`): the list or form the screen is for.
3. Everything else sits on the page: a section title with a hairline under it (`Section`, `SECTION_TITLE`) and rows
   split by hairlines.
4. Secondary buttons and chips are soft fills (`buttonSecondary`, `buttonSmall`, `FilterPills`), never outlined.
5. Form fields keep a light edge (`border-ink-2/65` at least) so people can see where to type.
6. No tinted bands behind rows; no shadows other than the raised surface.

## Lists

- Tables are allowed for lists: staff compare rows (`TABLE`, `TH`, `TD`, `TD_NUM`, `TD_TIME`, `TR_SELECTED` in
  `components/console/table.ts`). First column is the thing (bold name, small line under it), the last column holds a
  small button or the age.
- Filters are `FilterPills` with counts; the default filter shows the work to do, never an empty list.
- A list with a detail opens the detail beside it on wide screens and keeps its own URL.

## Detail pages

- `PageHeader`, then any `Notice`, then the content. A client page uses tabs, each its own route.
- At most one `Section` with `tone="attention"`: the thing to deal with first.

## Status

- `StatusPill` for states in tables and headers: `wait` (rattan), `done` (sage), `progress` (blue), `todo` (grey),
  `problem` (error). `StatusDot` for a quiet state inside a sentence. Every state has a word.

## Money

- `formatMoney` always, with the currency symbol; `tabular-nums`; big figures in `Figures`.
- Every price includes GST: write "₹2,999 a month, GST included".
- Anything that moves money or cannot be undone needs a required first-person checkbox that names the amount or
  thing ("I've checked that ₹2,999 has arrived."), then the button.
- Actions with side effects on the customer's site say so on the button and in the hint.

## Empty, loading, not found

- Empty: `EmptyLine`, one sentence that says what to do next when there is something to do.
- Pages stream as server components; a loading state, if added, is hairline rows and whitespace, no text.
- Not found, sign-in and error use `QuietFrame`. Error shows only the digest.

## Motion

- `transition-colors` or `transition-transform` at 200ms; buttons move down 1px when pressed.
- With reduced motion on, nothing moves (`console-motion` in `app/console.css` where it is still used).

## Icons

Phosphor (`@phosphor-icons/react/dist/ssr`), regular weight, 18px in the rail and 16px in rows. Always
`aria-hidden`; the link or button carries the name.

## Accessibility

- Text 4.5:1 against its background; marks, rings and field edges 3:1.
- Focus visible everywhere: the theme's ring on light surfaces, white on the dark rail (`data-surface="dark"`).
- `aria-current="page"` on the current rail link and tab.
- Forms: labels tied to inputs; errors announced (`role="alert"`), the field `aria-invalid` and `aria-describedby`.
- Dialogs (search only) are native `<dialog>` elements: focus moves in and comes back.
- Checked at 390 and 1280 wide with no sideways scroll.

## Not allowed

- Bordered boxes around sections or rows; more than one raised surface or one dark button on a screen.
- Outlined secondary buttons or chips.
- Colour as the only sign of a state.
- Fonts other than Red Hat; hex values outside the palette.
- Glass, floating docks or map-style homes.
- Uppercase letter-spaced labels; text under 11px.
- Modals for confirmation.
- Em or en dashes in any copy.
