# Customer dashboard design

How the customer app (`apps/platform`, app host) looks and reads. Tokens live in
`packages/shared/src/styles/theme.css`; shared pieces in `packages/shared/src/ui/panel/`; app pieces in
`components/panel/`. This file is the rules for using them. When a screen and this file disagree, fix one of them.

## Principles

1. **Calm, not busy.** Whitespace and hairlines (`border-line`) separate things. No bordered card grids, no drop
   shadows on content.
2. **Visuals over words.** Big numbers, charts, dots, pills and progress bars carry state. Labels are one to three
   words. No helper paragraphs on working screens (Appointments, Patients, Reports).
3. **Readable at a glance, all day.** A receptionist reads these screens across a desk for hours. Contrast, size and
   alignment beat decoration.
4. **Never colour alone.** Every state has a word. Colour and marks only reinforce it.
5. **Short labels.** "Add booking", "Reports", "Archived". Sentence case everywhere.

## Colour

Contrast measured on `paper` (#f6efe6) unless noted.

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `paper` | #f6efe6 | Page and panel ground; text on dark and accent fills | — |
| `paper-deep` | #efe4d6 | Hover rows, chips, tag pills, closed days, quiet surfaces | ink-soft on it 7.8:1 |
| `card` | #fbf6ef | Card fill (legacy card screens, see "Known exceptions") | ink-soft on it 9.1:1 |
| `ink` | #2a0d10 | Headings, names, values, primary buttons (fill) | 15.8:1 |
| `ink-soft` | #5e3a40 | Secondary text, labels, meta lines, inactive chips | 8.5:1 |
| `accent` / `accent-deep` | #63001e | Booked, links, active marks, "New", errors, primary on-accent fills | 11.9:1 |
| `accent-pale` | #f4dfe2 | Pale pills and notices (text on it is `accent-deep`, 10.7:1) | — |
| `gold-deep` | #b27716 | Second chart series, no-show ring. **Marks only, never text** | 3.3:1 |
| `line` | #e2d2c1 | Hairlines only. **Not** a field edge | 1.3:1 |
| `dark-surface` | #500018 | Sidebar, shell frame, billing banner | paper on it 13.6:1 |
| `dark-raised` | #5f1c2e | Account and notice popovers over the sidebar | paper on it 10.9:1 |

Derived strengths in use (all measured):

| Use | Class | Contrast |
|---|---|---|
| Field edge (input, select, textarea, phone field, editor) | `border-ink-soft/65` | 3.5:1 (3:1 non-text rule) |
| Placeholder | `placeholder:text-ink-soft/80` | 5.0:1 on paper, 5.5:1 on white |
| Inactive sidebar link | `text-paper/75` on dark-surface | 7.9:1 |
| Text in dark popovers and the billing banner | `text-paper/80` | 7.5:1 on dark-raised, 8.9:1 on dark-surface |
| Active sidebar link | `text-accent-pale` on `bg-white/10` | 9.7:1 |
| "New" pill on an accent booking card | `text-paper` on `bg-paper/25` | 6.6:1 |

Rules:
- Text is **4.5:1 or better**. Use `ink` or `ink-soft` at full strength on cream.
- **No opacity-faded text on cream.** `ink-soft/70` is 3.9:1 and `/60` is 3.1:1; both fail. To make something
  quieter, use `ink-soft` or a smaller size. The only faded text allowed is the placeholder (`ink-soft/80`) and
  `paper/75`–`/80` on the dark surfaces, all measured above.
- Non-text marks (dots, rings, bars, field edges, focus rings) need **3:1**. `gold-deep` and `emerald-600` (3.3:1)
  qualify for marks, not words.
- Text on `accent` or `ink` fills is `paper` at full strength.
- Decorative art (`WaveLines`, `ContourField` at `text-accent/10`–`/15`) carries nothing and has no minimum.
- Don't change the hex values; change which token a thing uses.

## Type

Three fonts, already loaded:
- **Newsreader** (serif): `panel-title`, `panel-section`, big numbers (`heading-display`), a patient's name,
  prices, month headings, stage numbers.
- **Hanken Grotesk** (sans): everything else: lists, forms, buttons, labels, tables.
- **Outfit**: the Brandbasket wordmark only (`font-brand`, `Logo`).

| Role | Size | Class |
|---|---|---|
| Auth and not-found headline | 40–56px serif | `heading-display text-[clamp(2.5rem,7vw,3.5rem)]` |
| Big number | 48px serif | `heading-display text-5xl tabular-nums` |
| Page title | 28px serif | `panel-title` (italic `<em>` in accent for the greeting) |
| Section title | 18px serif | `panel-section` |
| Stat figure, price | 24–30px serif | `font-serif text-2xl`/`text-3xl tabular-nums` |
| List row primary line | 15px medium | `text-[0.9375rem] font-medium` |
| Body, row secondary line, buttons | 14px | `text-sm` |
| Labels, status, eyebrows, meta | 13px | `text-[0.8125rem]` |
| Column headers, serials, hints, counters | 12px | `text-xs` |
| Smallest allowed: pills inside cards ("New", "Latest"), initials | 11px semibold | `text-[0.6875rem] font-semibold` |

Rules:
- **Nothing below 11px** that a person reads.
- **No uppercase letter-spaced text** for information: statuses, tags, badges, table headers, eyebrows, field
  labels, step counters. Sentence case at 13px instead. The one exception is the shell's "YOUR BRANDBASKET
  DASHBOARD" top bar, a brand line. Input values that are codes (referral code) may be uppercase.
- **`tabular-nums`** on every number that sits in a column or changes: prices, amounts, dates in lists and tables,
  counts, big numbers, phone numbers, times, serials, page ranges, character counters, step numbers. All field
  constants carry it, so typed phones, dates and times line up too.

## Spacing and radii

| Radius | Value | For |
|---|---|---|
| `rounded-control` | 1rem | Fields, rows' hover fill, notices, anything inside a section |
| `rounded-card` | 1.5rem | A card (legacy screens), popovers |
| `rounded-shell` | 1.75rem | The working panel and the next-step card |
| `rounded-full` | pill | Buttons, chips, pills, avatars, skeleton bars |

- Page padding: `px-5 sm:px-8`, `pb-16`. Title to first block `mt-8`. Between sections `mt-10 border-t border-line
  pt-6` (or `pt-8` on settings-style pages). Label to field `mt-1.5`. Field groups `space-y-4`/`gap-4`.

## Shell and sidebar

- `DashboardFrame` (shared) with `variant="dark"`: the dark-surface frame, the sidebar sitting on it, the working
  area a `rounded-shell bg-paper` panel inset on every side from `lg`.
- Sidebar (`lg`+): logo, `SidebarNav`, then `AccountBar` under a hairline. 16rem wide, sticky.
- Phones: logo and account chip across the top, the nav as a horizontal strip that scrolls inside itself (the only
  sideways scroller allowed), then the panel with a curved top lip.
- Nav items: icon + short label; active is `bg-white/10 text-accent-pale` with `aria-current="page"`; a count rides
  in the label ("Appointments · 5").
- The sidebar is `data-surface="dark"`, which turns the focus ring to paper (burgundy is 1.1:1 there). Any new dark
  area must carry the same attribute; the billing banner does.
- Top bar: the "Your Brandbasket dashboard" caption (`text-[0.7rem] uppercase tracking-[0.22em]`), nothing else.

## Page header

- `panel-title`, then either one short lede (`mt-2 text-sm text-ink-soft`) or, on working screens, the big number
  with a one-word unit ("5 new", "21 patients").
- Sub-pages put a back link above the title: `text-sm text-ink-soft hover:text-ink` ("← Appointments").
- Secondary actions (Add booking, Settings, Reports, Close, Download all) sit top right or at the end of the chip
  row as `link-underline text-sm font-medium` links.

## Chips and filters

- View and filter chips are rounded-full links: `rounded-full px-4 py-2 text-sm font-medium`. Active:
  `bg-ink text-paper` + `aria-current="page"`. Others: `text-ink-soft hover:bg-paper-deep hover:text-ink`.
- The chip row sits on a hairline (`border-b border-line pb-4`) with the secondary links at its end.
- Period navigation (Previous · This week · Next) is `link-underline` text beside the period's `panel-section` title.

## Links and buttons

- A thing that goes somewhere is a link; a thing that changes something is a button.
- In-text and secondary navigation: `link-underline`. A navigation that should look like a call to action:
  `ButtonLink` (or `ExternalButtonLink` for the live site, previews, mail).
- `Button` (`packages/shared/src/ui/panel/button.tsx`), two sizes, three variants:

| Variant | Look | Use |
|---|---|---|
| `primary` | `bg-ink text-paper`, hover `accent-deep` | The one main action of a form or card |
| `secondary` | `border-line bg-card text-ink` | Save beside a field, Go, Add a line, Cancel booking |
| `quiet` | `text-ink-soft`, hover `ink` | Archive, Restore, small row actions |

| Size | Padding |
|---|---|
| `sm` | `px-5 py-2.5 text-sm` (most panel forms) |
| `md` | `px-7 py-3.5 text-sm` (auth, next-step card) |

- `SubmitButton` shows its `pendingLabel` ("Saving…", "Opening…") and `aria-busy` while the action runs.
- Disabled buttons fade to 55%; disabled controls are exempt from the contrast rule, but never fade anything that
  still works.
- Destructive text actions use `text-accent-deep hover:bg-accent-pale` on a secondary/quiet button.

## Forms

- `usePanelForm(action)` from `components/panel/form/panel-form.tsx`: an error beside the field it is about with
  focus moved there, "Saved." after a write, typed values echoed back after a refusal (`valueOf`), and
  `fieldStatus(name)` for `aria-invalid` + `aria-describedby`. Wrap many small forms on one page in
  `PanelFormGroup` so only the last one says "Saved.".
- `PanelFormStatus` is the one live region per form: `text-sm`, `ink-soft` for "Saved.", `accent-deep` for errors.
- Field classes: `FIELD_CLASSES` (panel forms, 14px) and `STEP_FIELD_CLASSES` (onboarding, 16px). Both:
  `rounded-control border-ink-soft/65 bg-paper`, `tabular-nums`, `placeholder:text-ink-soft/80`,
  `focus:border-accent`, `aria-[invalid=true]:border-accent-deep`. New inputs use one of these, not a new string.
- Labels above the field. Clinic screens: `text-[0.8125rem] font-medium text-ink-soft`. Settings, Details,
  Onboarding: `text-sm font-medium` in ink with "(optional)" in `ink-soft`. New screens use the clinic form.
- Phones: `PhoneField` (shared), country + number in one framed control.
- Counters under a field: `text-xs tabular-nums text-ink-soft`, `accent-deep` once over the limit.
- One primary button per form. Refusals from onboarding forms show as an `accent-pale` notice with a link to fix.

## Lists

- `divide-y divide-line` hairline rows. Each row is one link with a `-mx-2 px-2 rounded-control` hover fill in
  `paper-deep/60`.
- A serial on the left (`text-xs tabular-nums text-ink-soft`, 1..N running on across pages), the primary line
  (15px medium), then one secondary line (13–14px `ink-soft`), status at the end.
- Every row's `aria-label` reads the whole row in visible order.
- On phones the columns stack; nothing scrolls sideways except a week grid inside its own container.
- Column headers: `text-xs font-medium text-ink-soft`, sentence case.

## Pagination

- 25 per page. "Showing 26–50 of 212" above; Previous · 1 … 4 5 6 … 12 · Next below, on a hairline. Current page
  `bg-ink text-paper` + `aria-current="page"`. `tabular-nums` throughout.
- Filters and search are kept; changing them goes back to page 1. Billing pages the same way client-side
  (Newer/Older, "Page 1 of 3").

## Detail panels

- Open under the list, `mt-8 border-t border-line pt-6`, titled with `panel-section` that takes focus on open.
- Facts as a short `dl`: label in `ink-soft`, value in `ink`, phone numbers `tabular-nums`.
- Close is a `link-underline` top right.

## Confirm steps

- Destructive actions (Cancel booking, Delete patient, Merge) open an inline confirm: one plain sentence and
  "Yes, …" / "Keep …". Never a modal. (Blog's Delete post still uses the browser's `confirm()`; see "Known
  exceptions".)
- After the action removes the focused button, focus returns to the section heading and the result is announced in
  a `role="status"` line.
- Pause and Cancel on an add-on follow this in the row itself (`components/panel/add-ons/add-on-end-confirm.tsx`):
  the two buttons swap for one sentence that says what will happen and the date, then "Yes, …" and "Keep it".
  Focus moves to the sentence, and "Keep it" puts it back on the button that opened the question. When the action
  goes through, focus lands on the add-on's heading and the state line under its price announces the result.
- One exception is a purchase panel, which is not a confirmation. Get it, Resume, Pay now and Keep it on the Services
  page open a native `<dialog>` (`components/panel/add-ons/add-on-checkout-dialog.tsx`, opened with `showModal`)
  that builds the price line by line before anything is charged. Opening it puts focus on its heading and Escape
  closes it. This and the image cropper are the only dialogs in the app; do not add a third for a confirmation.

## Empty, loading and not-found states

- **Empty list:** one short line in `ink-soft` ("No bookings on this day.", "None."). A feature's first-use empty
  (Blog, Billing) uses `EmptyState`: icon in a pale circle, `panel-section` title, one sentence, one action.
- **Loading:** `loading.tsx` per route from `packages/shared/src/ui/panel/skeleton.tsx`: `SkeletonHeading`,
  `SkeletonStatRow`, `SkeletonSection`, `SkeletonPage`, and `SkeletonLine` for a route with its own shape
  (Appointments, Details, Doctors, Settings). Pulsing `bg-ink/[0.07]` bars on hairlines and whitespace only; no
  bordered boxes; `motion-safe:animate-pulse`; `aria-hidden`.
- **Not found:** unknown URL → `PanelNotFound` ("Nothing here." + Back to home). Missing record inside a section →
  one line in place ("Patient not found." with a link back, "Booking not found.").
- **Error:** `app/app-host/error.tsx`: headline, one sentence, "Try again", and the reference digest in `ink-soft`.

## Status labels

| Where | Component | Rule |
|---|---|---|
| Bookings | `components/panel/appointments/status-label.tsx` | Word + mark. Booked (filled accent), Attended (filled ink-soft), No-show (hollow gold ring, ink text), Cancelled (hollow ink-soft ring). "New" accent pill before it for an unopened booking. Don't hand-roll booking status elsewhere |
| Billing lines | `StatusPill` in `billing/monthly-billing.tsx` | Paid (accent-pale + tick), To pay (ink fill), In review, Refunded, Failed; the detail goes in `title` and `sr-only` |
| Home tour | `StageChip` in `feature-preview.tsx` | Done (ink + tick), In progress / Ongoing (accent-pale + dot), Paused, "Live once you pay" (lock) |
| Home stats | `StatTile` dot | Green (live, sent), accent (needs you), ink-soft (neutral); the value always says it in words |
| Steps | Markers in `next-step-card.tsx`, `project-timeline.tsx`, `onboarding-step-list.tsx` | Done (ink + tick), current (accent), to do (outlined); an `sr-only` "(done)" / "(next)" |

Filled means "still matters"; hollow means "ended without a visit". Sentence case, 13px, never uppercase.

## Charts (Reports)

- Inline SVG, no chart library, no client JavaScript.
- Series: `accent` first, `gold-deep` second. Never more than two in one chart.
- Each chart is `role="img"` with a one-line summary, plus a visually hidden table of the same numbers; each column
  has a `<title>` tooltip.
- Fixed height, stretched to the width; axis labels are HTML (`text-xs tabular-nums`) so they don't shrink on phones.
- Zero data shows one line of text instead of an empty chart.

## Motion

- Default: `transition-colors duration-300 ease-calm` (`--ease-calm: cubic-bezier(0.22, 1, 0.36, 1)`).
- Progress bars grow their width over 500–700ms `ease-calm`. Arrows nudge `group-hover:translate-x-1`.
- Pulses (skeletons, the changelog dot) are `motion-safe:` only. `rise`, `reveal`, `ripple`, `drift` exist in the
  theme and switch off under reduced motion; the customer app does not use them. `ease-spring` is for the website.

## Icons

- `packages/shared/src/ui/icons.tsx`: 44 inline SVGs, 16px grid, 1.5 stroke, `currentColor`, `aria-hidden`.
- `size-4` in buttons and menus, `size-5` in the nav and row badges, `size-6` on Home cards.
- An icon-only button carries an `sr-only` label ("Account menu", "Notices, 2 need you").

## Responsive

- Must work at **390px wide with no horizontal page scroll** (checked on every main page). Allowed inner scrollers:
  the phone nav strip and the week grid.
- Tables become stacked lists below `lg` (Billing) or `md` (Patients). The Today view swaps doctor columns for a list.
- Chip rows and header links wrap (`flex-wrap`), never shrink below 11px.

## Accessibility checklist

- Text 4.5:1 or better; marks, field edges and focus rings 3:1.
- Focus ring: 2px `highlight-deep` with 3px offset on cream; paper inside `data-surface="dark"`.
- Every interactive row or card has an `aria-label` that reads the whole row in visible order.
- Active navigation and chips use `aria-current`, not only colour; steps use an `sr-only` state.
- Detail panels move focus to their heading on open; results announce in a `role="status"` line.
- Every form error is on the field (`aria-invalid`, `aria-describedby`) and in `PanelFormStatus`.
- Motion respects `prefers-reduced-motion`.
- 390px, no horizontal scroll.

## Not allowed

- Bordered boxes around sections or list rows on new or reworked screens.
- Opacity-faded text on cream (except `placeholder:text-ink-soft/80`).
- Uppercase letter-spaced statuses, tags, badges, headers, eyebrows or labels.
- Text smaller than 11px.
- `line` as a field edge (1.3:1).
- Colour as the only sign of a state.
- A faded row to mean "archived" or "off": say it in a word (see the Services list).
- Modals for confirmation. (The add-on purchase panel and the image cropper are dialogs, and neither is a confirmation.)
- Inter, Geist or any other font; new hex values.
- Medical fields or free-text clinical notes anywhere in the clinic screens (see
  `docs/superpowers/specs/2026-09-29-clinic-patients-design.md`).

## Known exceptions (to retire)

These screens still use bordered cards from before the no-boxes rule. They pass the readability rules above; the
boxes are a layout change for a later pass: Home stat tiles, next-step card and plan tour; Project cards; Billing
plan card and months table; Blog list, editor and settings cards; Settings sections (`Surface`); Changelog cards;
Onboarding review summary cards. Blog's Delete post confirms with the browser's `confirm()` instead of an inline
step.

## Section notes

| Section | Notes |
|---|---|
| **Home** | Greeting title with italic first name, one-line state lede. Four `StatTile`s (sentence-case 13px label, serif `tabular-nums` figure, one hint), the next-step card (13px accent eyebrow such as "Live", numbered markers), then the six-stage plan tour. The billing banner sits beside the greeting on dark-surface. |
| **Appointments** | Big "N new". View chips Today · Week · Month · Custom, doctor chips when there are several. Week grid: sticky `tabular-nums` time column, accent cards for booked, paper-deep for done/no-show, 24px initials badge at 11px. Cancelled bookings listed under a hairline. Settings: slots, online booking, services (archived = "Archived" word, filled field). Doctors: hairline rows, 40px initials avatar. Add booking: day picker, free times as pills, then the form. |
| **Patients** | Big "N patients", filter chips, search, Reports link. Rows: serial · name · phone · visits · last visit (`tabular-nums`), 25 per page. Profile: name as title, phones as `tel:` links, tags as `paper-deep` pills, Visits / No-shows / First seen figures, upcoming then history rows with `StatusLabel`, then Edit, Merge and Delete behind confirm steps. |
| **Reports** | Range chips (month / quarter / year) with the span on the right. Big numbers, then column and split-bar charts (accent + gold-deep), doctors table with an "Archived" word. |
| **Your project** | Title "Your *website*." with the live address and since-date. Four-stage timeline with numbered markers; blog and "something bigger?" side notes. |
| **Your details** | Announcement (message, counter, dates), holidays and closures (date ranges `tabular-nums`), opening hours editor. Hairline-separated, no cards. |
| **Onboarding** | Step list (numbered, `aria-current="step"`), step heading "Step 01 of 05" (13px accent, sentence case), `STEP_FIELD_CLASSES` fields, services editor ("Service 1" labels), review page with checklist and payment. |
| **Blog** | Post list, "N of M posts used" counter, editor (title, excerpt, category/author pickers, address field, rich text, cover, SEO with counters), taxonomy settings. |
| **Billing** | Plan card (serif price, days-used bar, next payment), months table (serial, item, date, status pill, amount, type, download; `tabular-nums`), stacked cards on phones, Newer/Older pager. Payment confirm pages: "Test checkout" pill in sentence case, serif amount. |
| **Add-ons** | One hairline row per service (Local SEO, Performance marketing, Press release): `panel-section` name, one line of what it does, the price with "+ GST", then a state line and the buttons. The state line is a `role="status"` region that is always in the page; it turns to the error colour only for a failing or failed payment or a broken row. Buttons are Get it, Pause, Cancel, Keep it, Resume and Pay now, never more than the state allows. Pause and Cancel confirm in the row; the rest open the purchase dialog. A customer's press releases list under the Press release row with a status word: "We'll contact you", "In progress", "Published". Every sentence on this page (state lines, button names and their `aria-label`s, the confirm question, the dialog text, press release statuses) comes from `lib/billing/add-on-copy.ts`; edit the words there, not in the components. |
| **Listing** | Status dot and serif headline, the listing's address and View/Copy buttons, then **Promotion**: with no tag running, three hairline radio rows (tag + "· Ad" in `ink-soft`, one-line hint), primary "Pay ₹352.82 for 7 days" (`SubmitButton`, "Opening…") and the "₹299 + ₹53.82 GST (18%) · 7 days, no auto-renew" line under it. While a tag runs: serif "Hot & New · Ad — until 6 Oct", "N days left" (and "next week paid, from …" once renewed), an `accent-pale` reminder in the last two days, an "On directory" hairline row with Shown / "Hidden, still paid for" and a secondary Hide/Show button, and "Renew for another week · ₹352.82" while no next week is booked. Refusals from a Pay press come back as an `accent-pale` notice (`?promotion=`). Then Your details and Set by us. |
| **Settings** | Account and business facts (13px `ink-soft` label over the value), signing-in note, Sign out. |
| **Sign-in / setup** | `AuthScreen`: centred headline, `SignInForm` on white fields with `ink-soft/65` edges, "or" rule in sentence case, footer line. Setup (`/setup/[token]`) uses the same screen and `SetupForm`. |
