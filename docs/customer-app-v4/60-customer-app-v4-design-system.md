# 60. Customer app v4: design system ("Basket UI")

Status: written 2026-11-03, after the owner approved the mock. Awaiting the owner's approval of this document.

Visual source of truth: the mock at https://claude.ai/artifact/EQWTapbw81EHHZCbwQiia6 (`docs/design/customer-app-v4-mock.html`, source in `docs/design/customer-app-v4/`).
Build plan: `docs/plans/61-customer-app-v4-implementation-plan.md`.

This system replaces every earlier customer design rule: `apps/platform/DESIGN.md` (v3), the "Ledger" direction (plans 27 to 29) and the portal revamp language. It applies only to the new `apps/customer`. The website, CMS and staff console keep their own systems.

## 1. Character

A calm, precise workspace for a business owner whose marketing is run for them. It looks like a professional instrument and speaks like a helpful person.

Reference: idraft (`/Users/a12345/Desktop/AI/idraft/platform/DESIGN_SYSTEM.md`). The rules below say what is kept and what changes.

| Topic | idraft | Basket UI | Why it differs |
|---|---|---|---|
| Reader | Analyst, hours a day | Owner, minutes a day, often on a phone | Sets every difference in this table |
| Accent | Cobalt `#1E65E3` | Same | Owner chose it, 2026-11-03 |
| Type | Geist, 14px | Same | Same finish |
| Default table row | 32px | 44px, 52px on phones | Fewer rows, easier to tap and scan |
| Density | Maximum data per screen | One question per screen, summary first | The owner did not come to analyse |
| Words | Analytical terms | Plain words, a glossary bans jargon (section 12) | Non-technical readers |
| Theme | Light and dark | Light only | Owner rule |
| Icons | Lucide | Phosphor, light weight | Already a dependency of the repo |
| Charts | ECharts | Small in-house SVG components | Three chart types do not justify the library |
| Inspector | Floating card | Docked right panel with a scrim | Simpler on phones, becomes a bottom sheet |

Kept from idraft without change: named tokens only, tonal layers and hairlines in place of shadows, tables for records, one metric strip for summaries, a right panel for record detail, neutral by default with colour only when it means something, every number honest, and every screen shipped with loading, empty and error states.

## 2. Principles

1. **One question per screen.** Each page answers one question for the owner (the list is in plan 61, section 4). Anything that does not help answer it leaves the page.
2. **What needs me comes first.** Anything waiting on the customer sits at the top of Home, with a due date and one action.
3. **One primary button per screen state.** Everything else is secondary, ghost or a link.
4. **Show the work.** A managed service is invisible unless the app shows it. Every staff action that affects a customer leaves a dated line in "What we did".
5. **Never fake a number.** A figure we cannot measure is left out. Unknown is never shown as zero. A panel with no real data does not render until it has data.
6. **Say where an input goes.** Each form section says where it appears ("Updates your website in about a minute").
7. **No dead ends.** Every state has a next step or a date.
8. **Same product everywhere.** Same header, table, badge and state on every screen, with the same words in the app and in email.
9. **Calm under load.** No full-page spinners and no layout jump. Motion only confirms a change of state.

## 3. Colour tokens

Every colour comes from a token. Hex, `rgb()` and Tailwind palette classes are refused by lint outside the token file. Values match the Release 2 premium design language (`docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md`).

### Surfaces

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F6F5F2` | Page background (warm paper) |
| `sidebar` | `#FFFFFF` | Left navigation |
| `surface` | `#FFFFFF` | Panels, top bar, inputs, overlays |
| `surface-subtle` | `#F6F5F2` | Table headers, wells |
| `surface-hover` | `#EEECE7` | Row and item hover (sunken) |
| `surface-selected` | `#F4E6D3` | Current nav item, selected row (gold wash) |
| `surface-disabled` | `#EEECE7` | Disabled control fill |

### Text

| Token | Value | Contrast | Use |
|---|---|---|---|
| `ink` | `#15161A` | 18.08 on surface | Primary text, values |
| `ink-2` | `#4E5057` | 8.05 on surface | Nav labels, secondary values |
| `ink-3` | `#5F626A` | 6.10 on surface, 5.66 on canvas, 4.97 on wash | Meta, labels, table headers |
| `ink-muted` | `#8A8D95` | Non-text only | Inactive icons and separators |
| `ink-disabled` | `#B4B7BD` | Exempt | Disabled text |
| `on-primary` | `#FFFFFF` | 18.08 on primary, 14.54 on hover | Text on primary fill |

### Lines

| Token | Value | Use |
|---|---|---|
| `border` | `#E3E0D9` | Panel and overlay outlines |
| `border-subtle` | `#EEECE7` | Row dividers |
| `border-button` / `-hover` | `#E3E0D9` / `#CFCBC2` | Secondary button outlines |
| `border-control` | `#8A8D95` | Inputs, selects, checkboxes, 3.32 on surface (WCAG 1.4.11) |

### Accent and meaning

| Token | Value | Use |
|---|---|---|
| `primary` / `-hover` | `#15161A` / `#2A2B31` | Primary button (near-black), checked controls |
| `accent-text` | `#8A5524` | Links and active labels (gold deep), 6.17 on surface, 5.02 on wash |
| `accent-wash` / `-border` | `#F4E6D3` / `#C48A47` | Tints and gold borders |
| `ring` | `#15161A` | Focus ring (2px ink with 2px offset), 18.08 on surface |
| `pos-text` / `-wash` / `-border` | `#2F5A43` / `#E5EFE8` / `#B2D0C0` | Done, live, paid, up, 7.88 |
| `neg-text` / `-wash` / `-border` | `#B42318` / `#FDECEA` / `#F4C3BE` | Failed, destructive, down, 6.57 |
| `warn-text` / `-wash` / `-border` | `#8A5524` / `#F4E6D3` / `#E0C7A8` | Waiting for the customer, due soon, 6.17 |
| `info-text` / `-wash` / `-border` | `#4E5057` / `#EEECE7` / `#E3E0D9` | In progress, 8.05 |
| `neutral-text` / `-wash` | `#4E5057` / `#EEECE7` | Neutral badges, 8.05 |

### Service marks and charts

| Token | Value | Use |
|---|---|---|
| `svc-site` | `#A8743C` | Website mark |
| `svc-social` | `#4F7A63` | Social media mark (sage) |
| `svc-search` | `#8A5524` | Search and ads mark |
| `c1` | `#A46C2F` | The customer's own series, always first |
| `c-ref` | `#8B93A0` | Previous period, dashed |
| `grid` | `#ECEEF2` | Chart gridlines |

A service mark is a small square beside the service's name, never a fill. Colour never carries meaning alone: every status has a word.

Contrast figures were computed on 2026-11-03. The token test (section 16) measures them on every build.

## 4. Typography

One family: **Geist** through the `geist` package, with Geist Mono only for technical values (invoice numbers, DNS records, URLs in tables). Money, dates and counts are never monospace. Every number uses tabular figures.

The website stays on Red Hat. The logo is outlined SVG and needs no font.

| Utility | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `type-title` | 22 / 28 | 600 | -0.022em | Page title |
| `type-section` | 14 / 20 | 600 | -0.006em | Panel and section titles |
| `type-sub` | 14 / 20 | 500 | | Row titles, sub-headings |
| `type-body` | 14 / 20 | 400 | -0.003em | Default text, buttons use 500 at 13.5 |
| `type-table` | 13.5 / 20 | 400 | | Table cells, first column 500 |
| `type-meta` | 13 / 18 | 400, `ink-3` | | Meta lines, labels, helper text |
| `type-label` | 12 / 16 | 500 | | Badges, table headers, nav group labels |
| `type-metric` | 24 / 30 | 600 | -0.025em | Metric strip values |
| `type-metric-sm` | 16 / 22 | 600 | -0.015em | Totals in panels |
| `type-mono` | 13 / 18 | 400 | | Technical values only |

Rules:
- **Weight is rationed.** 600 is for titles and big numbers. 500 is for row titles, active items and buttons. Everything else is 400. Bold is never used for emphasis in running text beyond one key phrase.
- **Sentence case everywhere.** No uppercase tracked labels.
- **Smallest text is 12px.** The only exception is the 10.5px shortcut hint.
- **Phones:** titles stay at 22px and inputs go to 16px so iOS does not zoom.
- Headings use `text-wrap: balance`; running text stays near 65 characters wide.

## 5. Spacing and sizes

4px scale. Allowed steps: 0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48.

| Element | Desktop | Phone (below 861px) |
|---|---|---|
| Sidebar width | 232 | Hidden, bottom tab bar instead |
| Top bar | 52 | 52 |
| Page gutter | 28 | 16 |
| Page max width | 1200 | Full |
| Gap between page blocks | 16 | 16 |
| Page title to first block | 16 | 16 |
| Control height | 36 | 44 |
| Small control | 30 | 36 |
| Large control (auth, first booking) | 40 | 48 |
| Icon button | 30 | 40 |
| Chip | 28 | 36 |
| Table header | 36 | 36 |
| Table row | 44 | 52 |
| Panel header | 44 | 44 |
| Panel padding | 16 | 16 |
| Sidebar item | 32 | Not shown |
| Tab bar item | Not shown | 48 |
| Inspector width | 440 | Full width, 92% height sheet |
| Dialog width | 560 | Full width minus 32 |
| Save bar | 56 | 56, above the tab bar |

Breakpoints: 520 (metric cells tighten), 860 (phone layout), 1100 (two columns become one, strip becomes 2 by 2).

## 6. Shape and depth

- **Radius:** panels 12, overlays 14, controls 8, chips 7, badges 6, marks 2, avatars full. Nothing else.
- **Panels** use a 1px `border` and no shadow.
- **Shadows** are for overlays only, plus two named button details: `shadow-button` (`0 1px 1px` at 4%) and `shadow-primary` (a 1px top inner highlight and a 1px cobalt shadow). These are the only shadows on resting elements.
- **No gradients, glass, glow or decorative illustration.** Chart area fill is a solid colour at 7% opacity.

## 7. Icons

Phosphor, `light` weight, through one `Icon` component that sets size and hides the icon from screen readers unless named. 18px default, 16px in rows and buttons, 24px in empty states. Direct imports from `@phosphor-icons/*` outside `Icon` are refused by lint.

An icon-only control needs an accessible name and a tooltip. Icons in row tiles sit in a 32px neutral square with a hairline. Tiles tint only when the row is in a meaningful state (done, or a problem), never to decorate.

## 8. Motion

| Moment | Motion | Time |
|---|---|---|
| Inspector opens | Slide 24px and fade | 220ms, `cubic-bezier(.2,.8,.2,1)` |
| Bottom sheet opens | Rise 24px and fade | 220ms, same curve |
| Dialog opens | Rise 8px, scale from .985, fade | 180ms, same curve |
| Scrim | Fade | 160ms |
| Menu | Fade | 100ms |
| Hover, focus | Colour and border | 80 to 120ms |
| Button press | Move down 1px | 60ms |
| Skeleton | Pulse only, no shimmer | 1400ms |

Nothing animates on page load. There is no count-up, parallax or scroll animation. `prefers-reduced-motion` removes all of the above. Motion plays once when an overlay opens and does not replay when its contents change.

## 9. Layout

**Shell.** Sticky sidebar on the left, sticky top bar, one scrolling page column. On phones: top bar, content and a five-item bottom tab bar.

**Sidebar**, in order:

| Group | Items | Shown when |
|---|---|---|
| Top | Logo, business switcher, search (`⌘K`) | Always |
| None | Home, Enquiries (count of new), Requests (count waiting on the customer) | Enquiries only after kickoff |
| Services | Website, Social & Ads, Local SEO + AEO | Only the services bought |
| Business | Reports, Business profile | Reports only after the first report month |
| Foot | Plan & billing, Settings, Help & calls, user menu | Always |

Before the kickoff call the sidebar is reduced to Home, Requests, Business profile and the foot.

**Phone tabs:** Home, Enquiries, Services (opens a menu of the services bought), Requests, More. Before kickoff: Home, Requests, Business, Billing, More.

**Top bar:** breadcrumb showing the page and tab, search, notifications bell, and on phones the account button. No page actions in the top bar.

**Page templates.** Every page uses one of these. A new template needs an entry here first.

| Template | Structure | Used by |
|---|---|---|
| Overview | Header, attention panel if any, metric strip, two columns (work left, 340px rail right) | Home, Website, Social, Search |
| List | Header, metric strip if useful, panel with filter chips and a table, row opens inspector or page | Enquiries, Requests, Invoices, Rankings, Reports |
| Detail | Back link, header, two columns (work left, facts right) | Request, Report |
| Form | Header, tabs, panel of labelled sections (explanation left, fields right), save bar | Business, Settings, Billing details |
| Task | Header, the task left, "what happens next" right, one primary action | Welcome, preview approval, setup |
| Entry | Centred form, plain brand panel beside it | Sign in, sign up, reset |

## 10. Components

Primitives live in `apps/customer/src/ui/`, built on `@base-ui/react`. Application components live in `src/components/`. Each has a unit test, an axe test and a preview entry at `/design-system` (development only).

Every interactive component has these states: rest, hover, focus-visible, active, disabled, plus loading and error where they apply. No component ships without them.

### Primitives

| Component | Variants and rules |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger`; `sm`, `md`, `lg`; `pending` state keeps the width and shows a spinner in the label's place. Labels fit one line, three words at most |
| `IconButton` | Required `label`, optional tooltip |
| `LinkButton` | Renders a link styled as a button |
| `Field` | Label above, control, hint below, error below the hint. Never a placeholder as a label |
| `Input`, `Textarea`, `Select`, `Combobox` | `border-control`, cobalt ring on focus, `aria-invalid` when in error |
| `PhoneInput` | Indian format by default, wraps the existing validation rules |
| `Checkbox`, `Radio`, `Switch` | 18px, 18px, 40 by 24 |
| `RadioCards` | For choices with a sentence each, such as the request type |
| `Chips` | Single-select filter chips with counts, one row, scrolls on phones |
| `Segmented` | Two to four exclusive views |
| `Tabs` | Underline tabs, each tab is its own URL |
| `Badge` | `neutral`, `pos`, `neg`, `warn`, `info`, `accent`. No border, optional 14px icon, always a word |
| `ServiceTag` | Square mark plus the service's name |
| `Avatar` | Initials; business avatars are square with radius 7 and primary fill |
| `Kbd`, `Tooltip`, `Skeleton` | Tooltip for names of icon buttons and for truncated text only |
| `Menu` | 32px rows, one level only |
| `Dialog` | For one decision or a short form. Focus trapped, Escape closes, focus returns |
| `AlertDialog` | Destructive confirmations, states the consequence in words |
| `Sheet` | Inspector on desktop, bottom sheet on phones |
| `Toast` | Short confirmation of something that already happened. Never for errors that need action |
| `Banner` | `info`, `warn`, `neg`, `pos`. Inline, one sentence and one action |
| `Meter` | 6px, label above with both numbers. Never colour alone |
| `FileDrop` | Drag and choose, per-file progress, per-file error, size and type stated before upload |

### Application components

| Component | Purpose and rules |
|---|---|
| `AppShell`, `Sidebar`, `TopBar`, `TabBar` | Section 9 |
| `PageHeader` | Title, one meta line, actions on the right. No help paragraph |
| `Panel` | Title row with one control at most, then flush or padded body |
| `MetricStrip` | 2 to 5 cells in one panel. Label, value, optional delta, optional context line. Never separate KPI cards |
| `Delta` | Colour comes from a rule, never chosen by a screen. `+9`, `+12%`, `↑3` |
| `DataTable` | Real `<table>`. Column priority hides columns on phones. Row can open a sheet or a page. Row actions appear on hover and always on touch. Footer states the count |
| `FilterBar` | Chips above the table. State in the URL |
| `AttentionList` | "Needs you" rows: icon, title, service, due text, one action. First row may be primary |
| `ServiceRows` | Home's services with a one-line status, sparkline and word badge |
| `ActivityFeed` | Dated lines of work done, from `activity_events` |
| `Stepper` | Sent, Quoted, In progress, Ready to check, Done. Vertical on phones |
| `NextStep` | Accent box stating what happens next. Holds the page's primary action when waiting on the customer, with the date that action unlocks |
| `Thread`, `Composer` | Messages with attachments; the customer's own messages sit in a well |
| `TimelineSteps` | "What happens next" with dated steps |
| `SlotPicker` | Three days, More days, times in India, one Book button whose label states the choice |
| `ChecklistRow` | Item with a service tag and one action, saves as it goes |
| `PostCard` | Image, caption, format, date; Review and Approve |
| `MonthCalendar` | Posts and ads on a month grid. Phones show markers plus a day list |
| `RankCell` | Position and arrow. 1 is the top |
| `EngineStatus` | Cited, Mentioned, Not shown. Glyph and word |
| `Stars` | Rating with an accessible label |
| `InvoiceSummary`, `PriceBreakdown` | List price, package discount, total, GST. All from the shared pricing module |
| `SaveBar` | Appears on the first edit. Discard and Save |
| `LineChart`, `Sparkline`, `BarList` | Section 11 |
| `EmptyState`, `ErrorState`, `LoadingState` | Section 13 |

## 11. Charts

Three types only: `LineChart`, `Sparkline`, `BarList`. All SVG with one scale for marks, ticks and labels, and every shape has an explicit fill. Scales get a unit test.

- The customer's own series is always `c1`. The previous period is dashed `c-ref`.
- Line 1.75px, area fill at 7%, emphasised endpoint, dashed gridlines in `grid`.
- Hovering a point shows its date and value. Touch shows it on tap. A text alternative and a table view are required.
- No pie, donut or combined score. Rank charts plot 1 at the top.

## 12. Words and numbers

**Voice.** Plain, short, active. "We build, you approve." No exclamation marks, no hype and no em or en dashes (a test fails on them). Errors say what went wrong and how to fix it, without apologising.

**One glossary.** The same word in the app, in email and on the website.

| Do not say | Say |
|---|---|
| Ticket, support ticket | Request |
| Lead (in the nav) | Enquiry |
| OyeChats, Powered by OyeChats, Warmth, Hot/Warm/Cool | Website chat |
| Kickoff (alone, first use) | Kickoff call, with one sentence on what it is |
| DNS records, CNAME, TTL | Hidden behind "Technical details", with "Web address" in the main text |
| AEO (unexplained) | "AI answers", with Local SEO + AEO only as the service name |
| Included edits | "Small edits included this month" |
| GSTIN | GST number (GSTIN is shown in brackets on the form only) |
| Deliverable, project, onboarding | Post, website, setup |

**Statuses, the same everywhere.**

| Thing | Words |
|---|---|
| Request | Sent, Quoted, In progress, Ready to check, Done, plus the flag "Waiting for you" |
| Enquiry | New, Contacted, Won, Lost; "Counted" for taps with no details |
| Post | Planned, Needs approval, Approved, Published |
| Website | Being built, Preview ready, Changes in progress, Approved, Live, On hold |
| Service | Active, In setup, Ending on a date |
| Invoice | Paid, Failed, Refunded |

**Formats**, through `src/lib/format` only. Direct `Intl`, `toFixed` and `toLocaleString` in components are refused by lint.

| Value | Format |
|---|---|
| Money, INR | `₹30,398` with en-IN grouping, paise only where they are not zero. INR prices include GST and the screen says so once; nothing is added on top |
| Money, USD | `$350`. GST is never mentioned beside a dollar price |
| Date | `Tue 3 Nov`, with the year only if it is not this year |
| Time | `11:00`, India time, labelled once on the picker |
| Relative | `Today, 10:42`, `Yesterday`, then the date |
| Count with a total | `9 of 12` |
| Change | `+9`, `+12%`, `↑3`. Green or red only when the rule says the change is real; otherwise neutral |
| Unknown | Left out. Never `0` and never a dash |

**Locked copy.** Anything the owner has approved (see the workspace `CLAUDE.md`) changes only with the owner's yes. All new customer-facing copy goes to the owner in a table in each pull request before it ships.

## 13. States

Every data screen ships all of these. The mock's View switch shows them.

| State | Rule |
|---|---|
| Loading | Skeleton shaped like the content, under the real header and tabs. No full-page spinner. A refresh keeps the old data on screen |
| Empty | One sentence on why, one sentence on what will appear, and at most one action. Never "No data" |
| Error | Inline banner saying what failed, that the data is safe and a Try again action. Failed panels are never silently hidden. One failed panel does not take down the page |
| Partial | A panel without data is left out when it is not yet relevant (for example, a month one report), and explained when the customer would expect it |
| Stale | Shows when the number was last updated ("Last check Mon 23 Nov") |
| Not bought | Service pages show what the service does and its price with the package discount, and offer Add to plan |
| Waiting on payment, lapsed | A banner on every page and a task state on Home. Read access stays |

## 14. Forms

- Label above, helper text below, error below that, and focus moves to the first error on submit.
- Group fields in named sections. A form with more than six fields must be split into sections.
- Each section says where its data goes.
- Settings-style forms use the `SaveBar`. Setup checklists save per item. Short forms use one primary button.
- Actions return one shape: `{ ok: true } | { ok: false, fieldErrors, message }`. One form helper, no private input styles.
- Uploads state type and size limits up front and show per-file progress and errors.
- Destructive actions use `AlertDialog` with the consequence in words, and cancelling a service states the new total.

## 15. Responsive and accessibility

**Phones are a first-class layout,** not a shrunken desktop. Tables hide low-priority columns by the priority set on each column. Sheets rise from the bottom. Tap targets are at least 44px. There is no sideways page scroll at 360px. The Review bar in the mock is not part of the product.

**WCAG 2.2 AA is required.**
- Visible focus on everything, a skip link, one `h1` per page and landmarks.
- Full keyboard use, with focus trapped in dialogs and returned on close.
- Icon buttons named, status words beside colours and charts with text alternatives.
- `aria-busy` on loading regions, `role="alert"` on errors and `role="status"` on toasts.
- Single-key shortcuts are not used. `⌘K` is the only global shortcut.

## 16. Enforcement

Rules that only live in a document get broken, which is how the current app ended up with four button systems. These run in CI and fail the build.

| Check | What it refuses |
|---|---|
| ESLint boundaries | `apps/customer` importing `apps/platform`, `@brandbasket/shared/ui/*` or `@brandbasket/shared/styles/*`; `ui/` importing features; features importing other features' internals |
| ESLint Tailwind | Unknown classes, palette classes, arbitrary values (`p-[13px]`, `bg-[#...]`), off-scale spacing |
| ESLint restricted imports | Phosphor outside `Icon`, other icon or component libraries, chart libraries |
| ESLint format rule | `Intl`, `toFixed`, `toLocaleString` outside `src/lib/format` |
| `tokens.contrast.test.ts` | Any token pair below its required ratio |
| `copy.test.ts` | Em and en dashes, exclamation marks and banned glossary words in any visible string |
| Axe in Vitest and Playwright | Accessibility violations on every primitive and every screen |
| Playwright visual tests | Unreviewed change to a screen at 1440 and 390 |
| `/design-system` route | A component without a preview entry fails a registry test |

The approach is copied from idraft's `eslint.config.mjs` and `src/lib/design/`, then adjusted. Nothing is imported from idraft.

## 17. Prohibited

Oversized KPI cards, nested cards, record lists as cards (post approval cards are the one exception because they are visual), gradients, glass, glow, decorative shadows, radii outside section 6, a second accent colour, decorative dots, uppercase tracked labels, monospace money, more than one primary button in a state, placeholder as label, full-page spinners, count-up numbers, silent failure, invented numbers, invented testimonials, help paragraphs above data, em and en dashes.

## 18. Changing the system

1. Propose the change with a screenshot and the screens it touches.
2. Update this document, the tokens and the preview in the same pull request.
3. Update visual baselines in that pull request.

A pull request with a new visual pattern and no change here is rejected in review.
