# Customer dashboard design (v2)

The owner chose direction B, "Ledger", on 2026-10-26: `docs/plans/28-platform-redesign-ux.md`, mock
`docs/design/platform-ledger.html`. This file is the rulebook for every new or reworked screen. The few pages not reworked
yet are listed at the end; they already take the v2 palette and type through theme.css `[data-app="customer"]`.

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
with the logo and search, a bottom tab bar, and a Menu sheet for the rest. Every page sits in `PageFrame`: fluid to
the edge of the content area, up to about 1560px, on the left, with 24px, 32px and 40px gutters (phones, md, xl). Task
on the left, things to read on the right (`PageColumns`); one column on phones. Must work at 390px with no sideways
scroll. The rules and an example are in `docs/page-frame.md`.

The rail (`lib/rail.ts`, drawn by `components/v2/rail.tsx`) has three groups. The first holds Overview, To do (paid
accounts) and Requests, with Calls under Requests (paid accounts). "Services" holds Website (with
Chatbot name, Authors and Categories under it), Social & Ads and Search, each shown only when the account has it.
"Account" holds Business profile, Your plan, Billing and Settings. The whole rail shows from the first day, before the kickoff
call: only Overview's content changes until the call has happened. The account menu in the rail footer (and the Menu sheet on phones) holds
Settings, Home page (when the site is live), What's new, Help (it opens Ask for a change), Docs and Sign out.

## Words

Plain words, one idea per line. Every state has a word as well as a colour. Dates sit next to the action that moves
them ("With this time, your website can be live by Thu 5 Nov"). New copy goes to the owner before it ships.

## Motion

`transition-colors` or `transition-transform` at 200ms; `active:translate-y-px` on buttons. Respect reduced motion.

## Accessibility

- Text 4.5:1 against its background, marks and field edges 3:1. `ink` and `ink-2` pass on `bg`, `surface` and `sunken`. `rattan-text` on `bg` is about 4.0:1: use it only for text 18px and up and for marks; small text in an accent uses `rattan-ink` (about 5:1 on `rattan-wash`).
- Field edges: `border-ink-2/65` at least; `line` is never a field edge.
- Focus: a 2px `rattan` ring with a 3px offset on light surfaces; on the dark rail (`data-surface="dark"`) the ring is white.
- `aria-current="page"` on the current rail link and tab; a word or an `aria-label` next to every icon that carries meaning.
- Form errors: the field gets `aria-invalid` and `aria-describedby` pointing at the message; page-level results use `role="status"` or `role="alert"`.
- Dialogs move focus inside on open and give it back on close (native `<dialog>` does both).

## Not allowed

- Bordered boxes around sections or rows.
- More than one raised surface, or more than one dark button, on a screen.
- Outlined secondary buttons or chips.
- Colour as the only sign of a state.
- Modals for confirmation. Dialogs are for search, the phone menu, the add-on checkout, the image cropper and the welcome after the first payment.
- Fonts other than Red Hat; hex values outside the palette above.
- Em or en dashes in any copy.

## Pages and pieces still on the older style

These still use class names from before the rework: `panel-title`, `panel-section`, and the `ink-soft`, `paper`,
`paper-deep`, `card`, `accent`, `rounded-control` and `link-underline` names. Build nothing new in that style. When one
is reworked it moves to the rules above, and its row leaves this table.

| Family | Where |
|---|---|
| Website content editors | Blog post, author and category editors, blog settings and the rich text editor (`content/*`; their lists are already on the page frame) |
| Account entry | Sign in, join, forgot and reset password, confirm email, restore account, setup links (`EntryScreen`, `AuthScreen`) |
| Before the first payment | Checkout (`plan`), `billing/pay`, `billing/confirm`, `billing/charges/*`, `restore-account/keep-plan`, `PaymentWaiting`, the billing banner |
| OyeChats | The leads table, its conversation dialog and pager (`components/panel/oyechats`) |
| Affiliate | `affiliate/*` |
| Smaller pieces | `PrepareChecklist`, and the inner fields of Change password and Delete account on Settings |

The older names resolve to the v2 values through theme.css (`[data-app="customer"]`), so these pages already match the
palette: `paper` and `bg` are #f6f5f2, `paper-deep` is `sunken`, `card` is `surface`, `ink-soft` is `ink-2`, and `accent`
is `ink`. Until a page is reworked it keeps three rules from the older guide:

- One `panel-title` a page, and no helper paragraphs on working screens.
- A form uses `usePanelForm` and `FIELD_CLASSES` (`components/panel/form/panel-form.tsx`), or `STEP_FIELD_CLASSES` in a
  setup step, so an error sits beside its field and "Saved." follows a write.
- A destructive action confirms inline in the row (one sentence, "Yes, ..." and "Keep ..."), never in a modal.
