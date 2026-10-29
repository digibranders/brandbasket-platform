# Customer portal design (v3)

The owner approved this direction on 2026-10-29: `docs/redesign-29-oct-2026/implementation-plan.md` (section 0) and the
design canvas it links to. It replaces the "Ledger" rules of v2 (dark rail, one raised surface, hairline sections). This
file is the rulebook for every new or reworked screen. Pages not rebuilt yet are listed at the end; they already take
the v3 palette and radii through theme.css `html[data-app="customer"]`, but keep their old layout until their phase.

The portal answers four questions on every page, in this order: what are we doing for you, what happens next, do we need
anything from you, and how do you reach us.

## Palette (theme.css `@theme`, customer values in `html[data-app="customer"]`)

| Token | Value | Use |
|---|---|---|
| `bg` | #f6f7f9 | Page |
| `surface` | #ffffff | Cards, the sidebar, menus |
| `sunken` | #f0f2f5 | Soft buttons, chips, the current sidebar link, empty markers |
| `line` | #e3e6eb | Card edges, dividers |
| `ink` | #111418 | Text, the primary button |
| `ink-2` | #4a5260 | Secondary text |
| `ink-3` | #646c79 | Small labels (4.9:1 on `bg`) |
| `rattan`, `rattan-text`, `rattan-ink`, `rattan-wash` | #c48a47, #9a6428, #7a4e1e, #fbf3e8 | The one brand accent: focus rings, the current step, brand moments |
| `ok`, `ok-wash` | #1e7a4c, #e6f4ec | Done, live, active |
| `warn`, `warn-wash` | #8a5300, #fdf1dc | Waiting for the customer, counts |
| `info`, `info-wash` | #2456a6, #e9f0fb | In progress |
| `error`, `error-wash` | #b42318, #fdecea | Problems |
| `c-site`, `c-growth`, `c-search` | #c48a47, #1f7a74, #3558a0 | Service marks: Website, Social & Ads, Local SEO + AEO |

A status colour always comes with a word. A service mark is a small square beside a service's name, never a fill. No
other hex values in new code. Light theme only.

## Type

Red Hat Display for titles (`font-display`), Red Hat Text for everything you read, Red Hat Mono for figures: money,
dates, times and counts (`font-figure`, plus `tabular-nums`).

| Role | Size |
|---|---|
| Page title | 30px / 600 |
| Card or section title | 17 to 19px / 600 |
| Body | 16px |
| Supporting text, table cells, sidebar links | 15px |
| Labels, helper text | 13px (the smallest) |

Sentence case. No uppercase letter-spaced labels. Buttons are at least 44px tall, and so is every phone tap target.

## Icons

Phosphor (`@phosphor-icons/react/dist/ssr`), regular weight; the current sidebar link is filled. 20px in the sidebar,
16 to 18px in rows. Never hand-drawn SVG. The older `@brandbasket/shared/ui/icons` set stays on pages not reworked yet.

## Surfaces

1. A page opens with one status card: where things stand in plain words, the next step, and the one dark button.
2. Cards group things that belong together (`bg-surface rounded-lift shadow-lift`; the shadow token draws the 1px line).
   Do not put every field or row in its own card. Rows inside a card split with `divide-y divide-line`.
3. Whitespace before borders: where hierarchy is already clear, no border.
4. One dark button per state of a screen: the task's main action. Everything else is a soft fill (`bg-sunken`), a
   quiet text link, or a line-edged secondary button.
5. Form inputs keep a visible edge (`border-ink-2/65` at least).
6. No shadows other than `shadow-lift`, no gradients, no glass.

## Layout

Desktop: a light sidebar (264px, white, a line on its right) and the page beside it. Phones: a top bar with the logo and
search, a bottom tab bar (Home, the first service, Requests, Business, More) and a More sheet for the rest. Every page
sits in `PageFrame` from `components/v2/page.tsx`: fluid, up to about 1560px, on the left, with 16px, 32px and 40px
gutters (phones, md, xl). Task on the left, things to read on the right (`PageColumns`); one column on phones. Must work
at 390px with no sideways scroll.

The sidebar (`lib/rail.ts`, drawn by `components/v2/rail.tsx`) has four groups:

- **Home**
- **Services**: Website (tabs Overview, Pages, Enquiries), Blog (tabs Posts, Authors, Categories) right under it, Social & Ads,
  Local SEO + AEO. Website and Blog go together; each of the others only when the
  customer has it (`lib/server/active-services.ts`).
- **Manage**: Requests (with the number waiting on the customer), Business.
- **Account**: Plan & billing (tabs Your services, Billing), Affiliate for affiliates, Settings.

Pages with tabs use `SectionTabs` (`components/v2/section-tabs.tsx`) in the frame's `tabs` slot: `WebsiteFrame` for the
website, `BlogFrame` for every `/content/*` page (`lib/blog/tabs.ts`). Calls is reached from the Requests page.

## Words

Plain words, one idea per line. Every state has a word as well as a colour. "Nothing needed from you right now" is a
real state. Say "Local SEO + AEO", never "Search" (that is the search box). Say "Home", "Business", "Enquiries". Never
show a figure that was not measured as 0: say "Not measured yet". New copy goes to the owner before it ships.

## Motion

`transition-colors` or `transition-transform` at 200ms; `active:translate-y-px` on buttons. Respect reduced motion.

## Accessibility

- Text 4.5:1 against its background, marks and field edges 3:1. `ink`, `ink-2` and `ink-3` pass on `bg`, `surface` and `sunken`. `rattan` (#c48a47) is a mark colour only; small text in the accent uses `rattan-text` or `rattan-ink`.
- Field edges: `border-ink-2/65` at least; `line` is never a field edge.
- Focus: a 2px ring in `highlight-deep` (rattan-text) with a 3px offset.
- `aria-current="page"` on the current sidebar link and tab; a word or an `aria-label` next to every icon that carries meaning.
- Form errors: the field gets `aria-invalid` and `aria-describedby` pointing at the message; page-level results use `role="status"` or `role="alert"`.
- Dialogs move focus inside on open and give it back on close (native `<dialog>` does both).
- A countdown is a `role="timer"` with a text equivalent and never announces every tick.

## Not allowed

- A card around every field or row.
- More than one dark button on a screen state.
- Colour as the only sign of a state.
- Modals for confirmation. Dialogs are for search, the phone menu, the add-on checkout, the image cropper and the welcome after the first payment.
- Fonts other than Red Hat; hex values outside the palette above.
- Invented data: a team member, a health check, a metric or a date that nothing stored.
- Em or en dashes in any copy.

## Pages and pieces still on the older layout

These still use class names from before the rework: `panel-title`, `panel-section`, and the `ink-soft`, `paper`,
`paper-deep`, `card`, `accent`, `rounded-control` and `link-underline` names, and the hairline-only section style. Build
nothing new in that style. When one is rebuilt (the phases in the implementation plan) it moves to the rules above.

| Family | Where |
|---|---|
| Every page body | Home, Requests, Website, Business, Plan & billing, Settings, Social & Ads, Local SEO + AEO: titles and frames are v3, the sections inside are rebuilt phase by phase |
| Website content editors | Blog post, author and category editors, blog settings and the rich text editor (`content/*`) |
| Account entry | Sign in, join, forgot and reset password, confirm email, restore account, setup links (`EntryScreen`, `AuthScreen`) |
| Before the first payment | Checkout (`plan`), `billing/pay`, `billing/confirm`, `billing/charges/*`, `restore-account/keep-plan`, `PaymentWaiting`, the billing banner |
| OyeChats | The leads table, its conversation dialog and pager (`components/panel/oyechats`) |
| Affiliate | `affiliate/*` |
| Smaller pieces | `PrepareChecklist`, and the inner fields of Change password and Delete account on Settings |

The older names resolve to the v3 values through theme.css (`html[data-app="customer"]`): `paper` and `bg` are #f6f7f9,
`paper-deep` is `sunken`, `card` is `surface`, `ink-soft` is `ink-2`, and `accent` is `ink`. Until a page is rebuilt it
keeps three rules from the older guide:

- One `panel-title` a page, and no helper paragraphs on working screens.
- A form uses `usePanelForm` and `FIELD_CLASSES` (`components/panel/form/panel-form.tsx`), or `STEP_FIELD_CLASSES` in a
  setup step, so an error sits beside its field and "Saved." follows a write.
- A destructive action confirms inline in the row (one sentence, "Yes, ..." and "Keep ..."), never in a modal.
