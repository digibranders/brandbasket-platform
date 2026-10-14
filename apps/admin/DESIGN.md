# Staff console design

How the staff console (`apps/admin`, admin host) looks and reads. Tokens live in
`packages/shared/src/styles/theme.css`; console-only surfaces (glass, Journey motion) in `app/console.css`; the
building blocks in `components/console/`. When a screen and this file disagree, fix one of them.

## Purpose

- One superadmin runs every client from here: leads coming in, clients being set up, built, previewed and launched,
  money that needs sorting, prices, referral codes, the website directory's enquiries, reviews and verified
  businesses, and the outbox.
- Direction "Centre stage": the home screen is the **Journey map**, every client placed on one path from lead to
  live. Anyone who needs the team is ringed. Everything else is a list or a record one click away.
- Cream paper for work, dark glass only for the things that float over it (dock, account pill, focus strip, menus,
  hover cards).

## Principles

1. **Whitespace and hairlines, not boxes.** Lists are hairline rows; record pages are titled sections separated by
   one rule. No card grids, no bordered panels, no shadows on content (shadows belong to floating glass only).
2. **Visuals over words.** Big serif numbers, rings, dots and the stage track carry state. Labels are one to three
   words. Helper text only where a form needs it.
3. **Never colour alone.** Every ring, dot and track has a word beside it or an `aria-label`.
4. **Readable all day.** Text ≥ 4.5:1, marks ≥ 3:1, nothing read below 11px, sentence case everywhere.
5. **One primary action per screen.** Ink on paper, gold in glass.

## Palette

Ratios are WCAG 2.x, measured with the real blended ground (opacity composited; glass over pure white as the worst
case), in the 2026-09-29 readability pass.

| Token | Hex | Job in the console | Measured |
|---|---|---|---|
| `paper` | #f6efe6 | Page ground; active dock item; text on ink and glass | ink on it 15.8 |
| `card` | #fbf6ef | Form field fill | ink 16.8, ink-soft 9.1 |
| `paper-deep` | #efe4d6 | "+N" chips, icon discs, read-only values, token and plain-text blocks | ink 14.4, ink-soft 7.8 |
| `line` | #e2d2c1 | Hairlines, band dividers, the dotted path, button rings. **Never a mark or a field edge** | 1.3 (structural only) |
| `ink` | #2a0d10 | Titles, names, values; primary button fill; dense glass | 15.8 on paper |
| `ink-soft` | #5e3a40 | Meta, hints, labels, dates, quiet status labels | 8.5 paper, 8.1 row hover |
| `ink-soft/80` | — | Placeholders, filter counts, figure notes | 5.1 paper, 5.3 card |
| `ink-soft/65` | — | Field borders; quiet / to-come rings (status dot, mini track, stage track, setup steps) | 3.5 paper, 3.6 card |
| `ink-soft/60` | — | Row chevron icon only | 3.1 (mark) |
| `accent` | #63001e | Links hover, italic `<em>` in titles, problems, attention sections, "late" ring and tag, done stages | 11.9 paper |
| `accent-pale` | #f4dfe2 | "Late" ring on glass | 14.2 on ink |
| `gold` | #f2c572 | Glass only: gold buttons, Add lead, reasons in the focus strip and hover card, money ring on glass, focus ring in glass, needs-you dot | 6.1 on glass, 11.2 on ink. **1.4 on paper: never on cream** |
| `gold-deep` | #b27716 | Marks on cream: money ring, waiting dot, current stage dot, gold rules beside notes | 3.3 (mark). **Never text** |
| `gold-ink` | #6e4300 | Gold-family small text on cream (Journey "Payment" tag) | 7.5 paper |
| green `#3d7a4a` | — | Done dot, ok notice rule (inline hex, not a token) | 4.5 paper |
| `dark-surface` / `dark-raised` | #500018 / #5f1c2e | Not used by the console (customer app shell) | paper on them 13.6 / 10.9 |

Text on glass: paper 8.6, paper/70 (dock labels) 5.2, gold 6.1, paper and gold under a `white/10` hover 6.5 / 4.6,
search placeholder paper/80 on its `white/10` well 4.8. On dense glass (solid ink): paper/60 6.2, paper/65 7.1,
paper/70 8.1.

## Glass

- `.glass`: `ink` at **80%** + `backdrop-filter: blur(18px) saturate(1.3)` + `1px` border `white/14`, text `paper`.
  Without backdrop-filter support it goes to 92% ink.
- `.glass-dense`: solid `ink`, for small glass over busy marks (hover cards, account menu).
- Inside glass the focus ring turns gold (`.glass :focus-visible`); the shared burgundy ring is under 2:1 there.
- Shadow: `0 24px 60px -24px rgba(42,13,16,.55–.6)` on floating glass only.
- May sit on glass: `paper` text (full or ≥ /60 on dense, ≥ /70 on plain), `gold` text and marks, `accent-pale`
  ring, `white/10` hover and input wells, `bg-paper` active pill with ink text, `bg-gold` button with ink text.
- Never on glass: `accent`, `gold-deep`, `ink-soft`, anything below paper/70 on plain glass, `white/15` or brighter
  washes behind text.

## Type

| Face | Use |
|---|---|
| Newsreader (`font-serif`) | Page titles (`heading-display`), section titles, big figures, stage counts, names in glass cards, quoted lead messages |
| Hanken Grotesk (`font-sans`) | Everything else: body, labels, buttons, rows, dock |
| Outfit (`font-brand`) | The Fynix wordmark only |

| Step | Size | Where |
|---|---|---|
| Greeting / quiet title | clamp(2.4–3.5rem) | Home "Hello, *Name.*", sign-in, 404, error |
| Page title | clamp(2.25rem, 5vw, 3.25rem), weight 400 | `PageHeader` |
| Figure | 2.75rem / 2.5rem | `Figures`, Need you / Paying |
| Stage count | 1.75rem (map), 1.5rem (phone rows) | Journey |
| Section title | 1.375rem serif | `Section`, Outbox "Text messages" |
| Sub-heading | 1.25rem serif (`text-xl`) | "Record a manual payment", "Add a charge" |
| Row title | 0.98rem semibold | `HairlineRow` |
| Body | 1rem | Facts, prose, fields |
| Meta / hints / labels | 0.875rem (`text-sm`) | Most secondary text |
| Glass small | 0.75rem (`text-xs`) | Focus-strip reason, hover card "Open" |
| Floor | **0.6875rem (11px)** | Dock labels, Journey tags (11.2px bold), phone-row names, small avatar initials |

Rules: sentence case for every status, label, button and tab. No uppercase letter-spaced text for anything read.
The only tracked text is a referral code, which is shown exactly as stored (capitals, 0.04–0.06em) because it is a
literal value to copy. `tabular-nums` on every number that sits in a column or changes: counts, money, dates in rows,
phone numbers, figures, status labels with counts, section asides, fact values, opening hours, price hints.

## Spacing and radii

- Frame: `max-w-[1400px]`, gutters `px-5 / sm:px-8 / lg:px-12`, `pt-10`, `pb-40` so the dock never covers the last row.
- Header to content `mt-10`–`mt-12`. Sections `py-8` with one `border-t`; on `lg` the title sits in a 13rem column.
- Radii: fields and blocks `rounded-2xl` (= `radius-control`), dock 1.6rem, focus strip and menus `rounded-3xl`,
  quiet frame 1.75rem (`radius-shell`), pills, avatars and buttons `rounded-full`.

## Shell, nav, search

- `StaffShell`: logo top left, glass `TopPill` top right (search + account initials), content, glass `Dock` fixed at
  the bottom. Skip link to `#main`.
- Dock: Journey, Leads, Clients, Coupons, Affiliates, Pricing, Invoices, Directory, Places, Ads, Deals, Leaving,
  Outbox, then gold **Add lead** (reads "Add" on phones). Active item is a paper pill with ink text; idle is paper/70
  (5.2:1), hover paper. Gold dot on Journey when something is urgent (money to sort, a paid add-on nobody has
  followed up, or a preview past its promise), with sr-only text.
- Search (≥ sm): `white/10` well, paper text, paper/80 placeholder and icon, gold focus ring, widens on focus. On
  phones it becomes a button to Leads, which has its own field.
- Account menu: dense glass, name in serif, email paper/65, Sign out paper/85.

## Page header

`PageHeader`: optional back link (ink-soft, chevron), optional large avatar, serif title (an `<em>` phrase for
italic burgundy on "Add a *lead.*" style titles), one meta line in ink-soft with tabular numbers, the one primary
action top right, and header-owned children such as the stage track.

## Journey map and stages

- Five bands (Leads, Setting up, Building, Preview, Live), dashed `line` dividers, serif count + label per band
  linking to its list. A dotted `line` path runs through; it is background texture, not a mark.
- Avatars (8 muted tones, white initials ≥ 4.5:1) sit on the path with a paper halo. Rings: `accent` = late,
  `gold-deep` = money (a payment to sort, or a paid add-on nobody has followed up); under the avatar a 11.2px bold
  tag in `accent` or `gold-ink` ("Payment", "Add-on", or the lateness). Overflow folds into a "+N" chip.
- Hover or focus opens a dense-glass card: name, status (paper/70), reason (gold), "Open ›".
- "Need you" switch: dims everyone else to 22% and opens a glass strip above the dock, most urgent first (payments to
  sort, then new add-on purchases oldest first, then late previews); Esc closes. An add-on item reads "New add-on to
  set up: Local SEO" or "Press release to start" and links to that client's Add-ons section.
  A dimmed avatar returns to full strength on hover or focus so its card and name stay readable.
- Phones: the map becomes one row per stage, avatars scroll sideways, 8 shown then "+N".
- `StageTrack` (record pages) and `MiniTrack` (list rows): done `accent`, now `gold-deep` with a `gold/30` halo,
  to come an open `ink-soft/65` ring. Paused is written in `accent`.

## Lists

- `HairlineList` / `HairlineRow`: whole-row link, top rule, one rule per row, avatar or icon disc, title, one
  ink-soft sub line, status (≥ sm), trailing date or figure (≥ md), chevron. Hover warms to `ink/3` and nudges right.
- `FilterPills`: links, current is ink with paper text, counts ride along (paper/60 current, ink-soft/80 idle).
- No tables. When a list grows columns, keep hairline rows and a grid.

## Detail pages

- Header, then any `Notice`s, then `Section`s. At most one section uses `tone="attention"` (accent rule and title):
  the thing to deal with first (payments needing attention, a late preview).
- `FactList`: ink-soft label over the value, two columns ≥ sm, a dash for missing values.
- Long-form customer text (their message) in serif 1.25rem.

## Forms and buttons

- Fields (`fieldClasses`): card fill, `ink-soft/65` border (3.5:1), `rounded-2xl`, 16px text, `ink-soft/80`
  placeholder, accent border + `accent/10` glow on focus, accent border when invalid. Labels ink `text-sm` medium;
  hints ink-soft `text-sm`. Read-only values sit on `paper-deep`.
- Errors: one line with an accent left rule, `role="alert"`, focused; the failing field is `aria-invalid`.
- Buttons (`buttons.ts`, sentence case, pill): **primary** ink → accent on hover; **secondary** ink text with a
  `line` ring; **danger** accent text, accent/40 ring, fills on hover; **gold** for the primary action inside glass.
  Disabled is 60% opacity (still 4.6:1).
- Segmented choices (Amount / Percentage): paper pill track, ink selected.

## Status and badges

- `StatusDot`: an 8px mark + a short word, `text-sm`, tabular. done green, moving accent, waiting gold-deep,
  problem accent with halo (label in accent), quiet an open ink-soft/65 ring. No pills, no uppercase badges.
- Lead statuses: new = waiting; call booked … invite sent = moving; account created, paid = done; lost = quiet.
- Payment: paid done, lapsed problem, checkout started waiting, not paid quiet.

## Money

- `formatMoney` always, with currency symbol; `tabular-nums`; serif `text-lg` for the amount at the end of a charge
  row; big figures in `Figures`. Old → new prices: old ink-soft struck through, new semibold.
- Say whether GST is in: "charged ₹3,539 with GST", "before 18% GST".

## Confirm steps

- Anything that moves money or can't be undone needs a required checkbox sentence in the first person ("I've checked
  that $69 has arrived.", "Yes, delete this code. This cannot be undone.") and names the amount or thing.
- Actions with side effects on the customer's site say so on the button ("Replace with a new token") and in the hint.

## Empty, loading, not found

- Empty: `EmptyLine`, one ink-soft sentence under a rule; in a section, `Quiet`. Say what to do next when there is
  something to do.
- Loading: the console has no `loading.tsx`; pages stream as server components. If one is added it must be
  hairline rows and whitespace, never bordered or filled boxes, and no text.
- Not found, sign-in, error: `QuietFrame` (logo, faint path, one centred column, one action). Error shows only the
  digest.

## Motion

- `ease-calm` 300ms for colour and hover lifts (`-translate-y-0.5`); Journey avatars rise in 0.6s, 45ms apart,
  left to right; focus strip and menus rise 0.45s; focus dimming 400ms.
- `prefers-reduced-motion` turns entrances and transitions off (`.console-motion`, `.journey-*`).

## Icons

- `@fynix/shared/ui/icons`, stroke 1.5, `size-4` inline, `size-5` in the dock and icon discs; the Journey icon
  is local to the dock. Always `aria-hidden`; the link or button carries the name.

## Responsive

- Checked at 390 and 1280 with no horizontal scroll.
- < md: Journey rows instead of the map; row trails hide (< md) and statuses hide (< sm); dock spans the width with
  equal items and "Add"; search becomes a button.
- Long values (`break-all` for emails, tokens, ids); names truncate in rows.

## Accessibility checklist

- [ ] Text ≥ 4.5:1 on its real ground (glass measured over white); large text (≥ 24px, or ≥ 18.66px bold) ≥ 3:1.
- [ ] Marks, rings, field edges and focus rings ≥ 3:1. Hairlines and the path are structural and exempt.
- [ ] Nothing read under 11px; no uppercase tracking outside referral codes.
- [ ] Every state has words; avatars are `aria-hidden` with the name on the link.
- [ ] Focus visible everywhere: burgundy on paper, gold in glass.
- [ ] Forms: labels tied to inputs, errors announced and focused, invalid fields marked.
- [ ] Reduced motion respected.

## Not allowed

- Gold (`#f2c572`) on cream, or `gold-deep` as text.
- `line` as a dot, ring, or field border; `accent` or `gold-deep` on glass.
- Opacity below the listed floors (ink-soft/80 for text on paper, paper/70 on plain glass, paper/60 on dense).
- Uppercase letter-spaced labels, badges or headers; text under 11px.
- Bordered cards, boxed skeletons, drop shadows on content, a second primary button.
- New hex values in components (the green and the gold hover `#f5d08a` are the existing exceptions).

## Per section

- **Home / Journey:** greeting, Need you (accent when > 0) and Paying figures, the map (phones: rows), "Paused · N"
  link under it. The focus switch is the one control.
- **Leads:** header with Add lead, search + newest/oldest toggle, status pills with counts, hairline rows (business,
  contact · phone, status dot, received date). Detail: stage track while in the pipeline, Contact facts, their
  message in serif, Send the setup link, Attach their account (attention, only when stranded), Update this lead.
  Add lead: one form, same validation as the website.
- **Clients:** stage pills (Setting up … Paused), rows with owner · project status · currency, mini track, and the
  attention reason or payment dot.
- **Client detail:** stage track, notices, then attention (flagged payments / late preview), the next step (Send a
  preview or Mark it live), Owner, Build, Setup progress (open ring = not done), Billing + manual payment,
  Billing details and Tax invoices (rupee clients only, below, straight after Billing), the plan upgrade when one is
  open, Extras (charges, mark paid, waive, add), Add-ons (below), Business details, Opening hours, Services, Domain,
  Their website (address, site token), Listing (address, then one line for a running paid tag: "Paid tag: Hot & New · Ad · until 6 Oct",
  "· switched off by the client" when hidden; staff never add a listing-tag charge, the client buys it), Features
  (time zone, Appointments on/off with confirm), Notes for the builder, Logo and photos.
- **Billing details** (rupee clients only): a fact list of what the customer or staff gave for GST invoices (billed to,
  GSTIN or "Not given", address, state by name, contact), or "Not given" with what invoices use instead. A native
  `details` disclosure, "Edit billing details", holds the form: the customer's own rules, one refusal at a time under
  its field (`role="alert"`, the field `aria-invalid`), "Saved." in a status region, and a line saying changes apply to
  invoices issued from now on. Never the attention section.
- **Tax invoices** (rupee clients only): above the issued list, one hairline row per payment with no invoice ("Invoice
  missing for the payment of ₹3,539 on 9 October 2026") with a secondary **Issue invoice** button named for its
  payment; it disables and reads "Issuing…" while it posts, and works without JavaScript. The section is the page's
  attention section only when a payment lacks its invoice and no earlier section (flagged payments, a late preview)
  has the mark. Below, each issued invoice: number, "Issued … · paid … · state", total, Download. Notices say the real
  reason in fixed words (English letters, GSTIN and state, date before payment, payment kind, figures).
- **Add-ons:** the section (`#add-ons`, which every notice and Journey item links to) sits after Extras. Its aside reads
  "Bought by the customer", or "N to follow up" when paid purchases are waiting. A notice (fixed words, `?addOns=`)
  shows first. Then hairline rows, one per add-on the customer actually bought, newest first (an unpaid checkout and
  a row cancelled before it was ever paid are left out): name, price before GST ("₹10,000 + GST a month", with
  ", Premium price" when discounted), a date line (Renews on, Ends on, Pauses on, Paused since, Starting on, or
  "Customer can pay until …"), who scheduled an end and when, and a `StatusDot` (Active done; Ending, Pausing and
  Starting waiting; Payment failing and Payment failed problem; Paused and Ended quiet). A row replaced by a newer one
  reads "Earlier" with no buttons. Buttons are secondary, small: **Mark contacted** for a paid purchase nobody has
  followed up, and **Pause** and **Cancel** on the running row only. Each of those two is a native `details` with the
  console's confirm rule (a required first-person box such as "I've told the customer. Local SEO will stop on 12
  November 2026.", then a danger button), and reads "Never mind" while open. Press releases follow as rows with a
  status dot and one button for the next step (**Mark in progress**, **Mark published**). Never the attention
  section; the Journey carries the urgency.
- **Dock:** 13 sections and Add lead do not fit a phone or a narrow desktop, so the glass bar scrolls sideways inside
  the screen (no scrollbar, items never narrower than 3.75rem) and centres the current section when the page changes,
  without smooth scrolling.
- **Pricing:** one section per currency: four price fields (before tax, charged-with-GST hint), a gold-deep rule
  explaining who a change affects, "Save INR prices". Then Price changes (old struck, new bold, who, when).
- **Invoices:** header with the one primary action, Download CSV (a plain link to `/invoices/export?month=`). A month row:
  previous month link, a native month field with "Show month" (works without JavaScript), next month link
  (read as "Previous month: September 2026"; years 2000 to 2999 only, so the first and last month have one link). When any
  payment has no invoice, "Missing invoices" comes first as the page's one attention section: hairline rows, one per
  payment across all clients, each a link to that client's Tax invoices section. Then figures (invoices, taxable value,
  invoiced with GST; money always shows paise), Tax (CGST, SGST, IGST, round off) and Customers (with a GSTIN, without)
  as fact lists, then the month's invoices as wrapping rows (number, customer, GSTIN or Unregistered, state, date,
  total, Download), never a table, so it holds at 375 px. Every total is the sum of the rows below it and of the CSV.
- **Referrals:** figures (codes, usable now, customers referred), rows with discount · currency · share and referrer,
  "N of M used". Detail: figures (customer pays, their discount, referrer earns), The agreement, What you can
  change, Who used it, Delete (confirm). New: form with a live gold-deep-ruled summary of the Razorpay offer.
- **Directory:** figures (new enquiries, accent when > 0; reviews showing; hidden; verified), Enquiries / Reviews /
  Verified pills with counts, then that section's filter pills (New / Handled; All / Showing / Hidden; Verified has
  none). Rows are hairline rows with the action inside, not links: enquiry = business (or "Top dentists in Thane" for
  a list request), service · area, name · phone (tel link), their message, date, **Mark handled** (secondary) or a
  green Handled dot. Review = business, listing key, stars (accent filled, ink-soft/65 empty, the number beside them),
  text, highlights, reviewer · phone, date, Showing / Hidden dot, **Hide** (danger) or **Restore** (secondary). 25 a
  page, "‹ Newer · Page N of M · Older ›". One-line notice after an action; "someone got there first" when the row
  had already moved.
- **Directory › Verified:** "Verify a business" sub-heading and form: the business's page address on the website
  (a full `https://…/in/<service>/mh/<city>/<area>/<slug>` address, the bare path, or the listing key; parsed to the
  key `<service>/<city>/<area>/<slug>` in `lib/directory-view.ts`), business name, and "Phone to show (optional)"
  (`PhoneField`; empty = "Don't show a number"), primary **Verify business**. Verifying one that already is updates
  its name, phone and date. Then "Verified businesses" with the pill search field (business name) and rows: name,
  listing key (plain text, since the console has no website origin to link to), phone (tel link) or "No number
  shown", verified date, "By <staff name>", and **Remove** (danger) as a disclosure that opens a required confirm box
  ("Yes, remove <name>'s verification. The website stops showing its tag and number.") and **Remove verification**;
  open, the summary reads "Keep it". Works without JavaScript.
- **Outbox:** email rows (subject, recipient, date), then Text messages (phone, body, date; OTPs are visible here
  only). Message: gold-deep note that it was kept, not sent; sandboxed HTML preview; plain text block.
