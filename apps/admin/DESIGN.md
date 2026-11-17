# Staff console design (v2)

The owner chose the console redesign on 2026-10-26: `docs/plans/40-console-redesign-audit.md`, contract
`docs/plans/41-console-redesign-plan.md`, mock `docs/design/console-mock.html`. It uses the same palette, type and
surfaces as the customer dashboard (`apps/customer/DESIGN.md`), made denser for staff. The binding rules are the premium
design language, `docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md`, and its section 8b for the console patterns. The
owner's rulings are in `docs/implementation/CONSOLE-REDESIGN-RULINGS.md`. This file says how the console applies them and
never contradicts them; if the two differ, the language file wins.

## Palette

Tokens from `packages/shared/src/styles/theme.css`, applied to the console by `html[data-app="console"]`:
`bg` page, `surface` the one raised surface, `sunken` soft buttons and chips, `ink` text, the rail (`#23242A`, `--color-ink-raised`), `ink-2`
secondary text, `line` hairlines, `rattan` family for the one accent (counts, waiting states), `sage` family for
done (text `sage-text`, wash `sage-wash`), `error` and `error-wash` for problems and late work. Console-only extras:
`rattan-soft` (selected row), `row-hover`, `shadow-popover`. No other hex values in components.

## Type

Red Hat Display for titles (`font-display`), Red Hat Text for everything else, Red Hat Mono for figures: money, dates,
times, counts and ids (`font-figure`, plus `tabular-nums`). Sentence case. Nothing below 11px. No uppercase
letter-spaced labels.

## Shell

- The dark rail (`lib/console-rail.ts`, rendered by the console shell): logo, "Search everything" with ⌘K, then eight
  items (Today, Clients, Inbox, Calls, Money, Ads, Team, Settings) with live counts (`lib/server/rail-counts.ts`), the
  signed-in staff member at the foot. A count in red means late or failed work.
- An item covers several pages. Pages of one item share a tab strip (`SectionTabs`) directly under the page header; the
  strip lists only the pages the role may open, and the item links to the first of them.
- Pages a role cannot use are hidden (`needs` on the page entry; an item with no page left goes), and the page refuses
  them as well (`requireStaffCan`).
- The page sits inset 8px with a 14px radius on the rail. Content up to 1400px.
- URLs never change for a relabel: `/leads` is Enquiries, `/support` is Requests, `/support/errors` is App errors, `/deliveries` is Emails and webhooks.

## Surfaces

1. One dark button per screen (`buttonPrimary`): the screen's main action. When a side panel is open, the panel foot
   carries the only primary and the row verbs go secondary.
2. One raised surface per screen (`LIFT`): the list or form the screen is for. Overlay layers (side panel, menu, toast,
   command bar, dialog) are not raised surfaces.
3. Everything else sits on the page: a section title with a hairline under it (`Section`, `SECTION_TITLE`) and rows
   split by hairlines.
4. Secondary buttons are white with a `line` border on white surfaces and a soft sunken fill on the paper. Chips are soft
   fills. Neither is outlined on paper.
5. Form fields keep a light edge (`border-ink-2/65` at least) so people can see where to type.
6. No tinted bands behind rows. Shadows: the raised surface, and the popover shadow (`--shadow-popover`) on overlay
   layers only (side panel, menus, toasts, the command bar). Dialogs use the dialog shadow.
7. Buttons are 44px high on phone and 36px on desktop.

## Lists

- Tables are allowed for lists: staff compare rows (`TABLE`, `TH`, `TD`, `TD_NUM`, `TD_TIME`, `TR_SELECTED` in
  `components/console/table.ts`). Rows are 44px, header 36px. Only the read-only registers, Invoices and Access log, use
  36px compact rows. First column is the thing (bold name, small line under it), the last column holds the row's one
  verb and a three dot menu or the age.
- Filters are `FilterPills` with counts; the default filter shows the work to do, never an empty list.
- A list with a detail opens it in a side panel: 480px from the right on wide screens, a full sheet on phone, its own URL
  (`?open=`), the primary button at the panel foot. The selected row carries the soft gold wash and a 3px gold marker.
- Reversible internal changes show a toast with Undo; see Confirm and undo.
- Console patterns (`DataTable`, `RowActions`, `SidePanel`, `FilterBar`, `InlineEdit`, `Toast`, `BulkBar`,
  `CommandBar`, shortcuts) follow section 8b of the language file.

## Detail pages

- `PageHeader`, then any `Notice`, then the content. A client page uses tabs, each its own route.
- At most one `Section` with `tone="attention"`: the thing to deal with first.

## Status

- `StatusPill` for states in tables and headers. Vocabulary: late or failed is red (`problem`), waiting or next step is
  rattan wash (`wait`), done or active is sage (`done`), idle is sunken (`todo`); `progress` (blue) stays for work under
  way. `StatusDot` for a quiet state inside a sentence. Every state has a word. Red appears only for late or failed.
- Clocks are Mono: `17d 08h remaining`, `5h 12m left`.

## Money

- `formatMoney` always, with the currency symbol; `tabular-nums`; big figures in `Figures`.
- Every price includes GST: write "₹2,999 a month, GST included".
- Anything that moves money or cannot be undone needs a required first-person checkbox that names the amount or
  thing ("I've checked that ₹2,999 has arrived."), then the button.
- Actions with side effects on the customer's site say so on the button and in the hint.

## Confirm and undo

- Reversible and internal, no email to the customer (enquiry, ticket or error status, an internal note, a rename, a
  preview link): do it and show a toast with Undo (10 seconds). Plain toasts last 4 seconds; error toasts stay until
  dismissed.
- A native dialog (`ConfirmDialog`) is allowed only to confirm an action that emails the customer or changes what they
  see, moves or records money, or cannot be undone. It states the consequence, the primary is on the right and named for
  the act, "Keep" cancels. No undo toast after a confirmed action.
- Moving or recording money adds the required first-person checkbox (see Money). Money is never bulk.

## Empty, loading, not found

- Empty: `EmptyLine`, one sentence that says what to do next when there is something to do.
- Pages stream as server components; a loading state is skeleton rows matching the layout (`Skeleton`), no spinner, no text.
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
- Dialogs (search, confirmation, keyboard help) are native `<dialog>` elements: focus moves in and comes back. Single key shortcuts never fire inside a field or an open dialog.
- Checked at 390 and 1280 wide with no sideways scroll.

## Not allowed

- Bordered boxes around sections or rows; more than one raised surface or one dark button on a screen.
- Outlined secondary buttons or chips on paper.
- Colour as the only sign of a state.
- Fonts other than Red Hat; hex values outside the palette.
- Glass, floating docks or map-style homes.
- Uppercase letter-spaced labels; text under 11px.
- A modal for anything reversible. A dialog confirms only what emails the customer, moves money or cannot be undone.
- A shadow on anything but the raised surface and the overlay layers.
- Em or en dashes in any copy.
