# Premium design language (Release 2)

Why this exists: the ChatGPT images are clean but generic: flat white cards, uniform borders, small type, no depth. Premium comes from restraint plus craft in a few places: type scale, spacing rhythm, surface layering, one disciplined accent, considered motion, and honest content. This file defines those so every agent builds the same product. It builds on the website brand and does not replace it.

Brand constants (unchanged): paper `#F6F5F2`, surface `#FFFFFF`, sunken `#EEECE7`, line `#E3E0D9`, ink `#15161A`, ink-2 `#4E5057`, rattan gold `#C48A47` (text `#A46C2F`, wash `#F4E6D3`, deep `#8A5524`), sage `#4F7A63`, error `#B42318`. Fonts: Red Hat Display, Text, Mono. Light theme only.

## 1. Principles

1. **One focal point per screen.** The next thing the customer should do is the biggest, darkest, warmest element. Everything else steps back.
2. **Quiet surfaces, confident type.** Fewer boxes, larger and better-set text. Use whitespace and hairlines before borders and cards.
3. **Gold is rare.** It marks "now" and "yours to act on" only. If gold appears more than 3 times in a viewport, remove some.
4. **Warm, not cold.** Every grey carries a warm tint. Shadows are warm brown-black, never pure black.
5. **Real over decorative.** Show the customer's own business: their site preview, their post pictures, their numbers. No stock art, no illustrations.
6. **Calm motion.** Short, soft, purposeful. Nothing loops.
7. **Plain words.** Sentence case, short verbs, no jargon, no em or en dashes.

## 2. Tokens

**Type scale (Red Hat Display for display, Text for body, Mono for figures)**
| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Page title | 36 / 40 | 700 | -0.02em |
| Card hero task | 26 / 32 | 600 | -0.015em |
| Section title | 20 / 28 | 600 | -0.01em |
| Body | 15 / 24 | 400 | 0 |
| Small | 13 / 20 | 500 | 0 |
| Label (not uppercase) | 12 / 16 | 600 | 0.01em |
| Figure (Mono) | 32 / 36 big, 15 / 20 inline | 500 | -0.01em |
Use tabular numbers for money, dates and counts. Phone: page title 28 / 34, hero task 22 / 28.

**Spacing:** 4px base. Card padding 28 desktop, 20 phone. Space between cards 24. Page padding 40 desktop, 16 phone. Section gap 32. Content max width 1240 inside the app frame.

**Radius:** 8 controls, 14 cards, 20 hero cards and dialogs, full for chips. One scale only.

**Elevation (warm):**
- Resting card: 1px `#E3E0D9` border and `0 1px 0 rgba(42,28,16,.03)`. No blur.
- Hero card and popovers: border plus `0 1px 2px rgba(42,28,16,.05), 0 12px 32px -12px rgba(42,28,16,.14)`.
- Dialog: `0 24px 64px -16px rgba(42,28,16,.28)` over a `rgba(21,22,26,.40)` scrim.

**Surfaces:** page paper `#F6F5F2`; cards white; sunken `#EEECE7`. The hero card on a screen gets a very soft gold wash header strip `#FBF4EA` (not a gradient), and a 3px gold top edge only on the single primary "Next step" card.

**Buttons (36 desktop, 44 phone):** primary near-black with white text, inner top highlight `inset 0 1px 0 rgba(255,255,255,.08)`, hover `#2A2B31`, pressed 1px down. Secondary white with `#E3E0D9` border. Quiet text button with a gold underline for links. Never more than one primary per card.

**Chips:** 12px, full radius, 4px 12px padding. Active sage, Next step gold wash, Waiting gold wash, Idle sunken, Failed red wash. No dots unless the chip is a live status.

**Icons:** one family (the app's Phosphor set), 1.5 stroke, 20px, ink-2 by default, gold-deep only on the selected nav item and the focal card icon. Service icons sit in a 40px rounded tile (`#F4E6D3` wash) on hero cards.

**Focus:** 2px ink ring with 2px offset on every interactive element.

## 3. Components with a premium finish

- **Sidebar:** white, 248px. Logo with gold basket mark. Selected item: gold wash, 3px gold marker on the left edge, semibold. Group labels 12px muted (not uppercase). A subtle "account" block at the bottom with the plan name and next payment date in Mono.
- **Top bar:** 64px, white, hairline bottom. Business switcher (avatar tile, name, plan), search with `Ctrl K`, bell with a gold count, account avatar.
- **Focal card ("Next step"):** 20px radius, gold top edge, service icon tile, title 26px, one short line, the controls, one primary button, then a quiet status line. Never two focal cards side by side; if two services need setup, stack the first (priority order) as focal and show the second as a standard card.
- **Standard service card:** 14px radius, icon tile, name, chip, one status sentence, one quiet action.
- **Needs your OK:** a list in a card; each row has a 40px tile, bold title, one-line context, age in Mono, one button. Empty state: a soft sage check, a plain sentence and what will appear here. It becomes the top element when it has items.
- **Preview card (Website):** a framed browser preview of the real site, 16:10, 14px radius, soft elevated shadow, with a caption row. This is the one place for real imagery.
- **Post picture strip (Social):** square thumbnails with 12px radius, status ribbon under each (Posted, Scheduled, Needs OK), a gold ring on items that need the customer.
- **Stepper:** numbered circles joined by a hairline; current is gold filled, done is sage with a check, upcoming is outlined. Fill the connecting line to the current step.
- **Stat tiles:** Mono numbers 32px, label above in 13px, a tiny delta in sage or muted. No charts unless data exists; a sparkline only on report pages.
- **Tables:** 15px rows, 52px high, hairline between rows, header 12px muted, right-aligned figures in Mono, hover `#FAF9F6`. The console uses 44px rows (section 8b).
- **Forms:** label above, 42px inputs, 8px radius, `#CFCBC2` border that darkens on hover and gets the ink focus ring; helper text 13px muted; errors in red with an icon and a fix.
- **Dialogs:** 20px radius, 28px padding, title 22px, consequence line in ink-2, primary on the right. Destructive confirm uses the red variant with the consequence stated.
- **Toasts:** bottom left, ink background, white text, 4 seconds, with an Undo where possible (10 seconds with Undo in the console, section 8b).
- **Skeletons:** warm `#EEECE7` blocks matching the final layout, a slow 1.6s opacity pulse; no spinners.

## 4. Motion (all disabled under `prefers-reduced-motion`)

- Page and card entrance: 8px rise and fade, 220ms, `cubic-bezier(.16,1,.3,1)`, staggered 40ms, once.
- Hover on buttons and rows: 120ms background change. Pressed: 1px translate.
- Stepper fill: 320ms. Chip change: crossfade 150ms.
- Dialog: scale from .98 and fade, 180ms. Sheet: slide 240ms.
- No parallax, no looping, no marquee, no custom cursors.

## 5. Page template

Header block: small muted label, page title 36px, one-line context, page actions on the right (max one primary). Then content in a 12 column grid: main (8) and aside (4) at 1100px and up; single column below. Aside carries "Needs your OK" and secondary info. Footer space 64px.

## 6. Content and voice

Calm, specific, in the customer's terms. "We have started on your Social" not "Onboarding initiated". Dates "Tue 17 Nov, 3:00 pm". Money "Rs 2,999 a month, GST included". Empty states say what will appear and when. Errors say what happened and the next step. No exclamation marks, no emoji, no em or en dashes.

## 7. Accessibility

AA contrast everywhere (gold text on white uses `#A46C2F` or darker; gold fills carry ink text). 44px touch targets on phone. Visible focus. Full keyboard operation. Status never by colour alone (chip text always). Reduced motion respected. Landmarks and headings in order.

## 8. Console variant

Same tokens. Dark rail `#23242A` with light text and gold count badges; page paper `#F6F5F2`; one raised white panel per screen; denser rows (44px, section 8b). Red only for late or failed. One near-black primary per screen. Popup and prompt components use the dialog spec.

## 8b. Console patterns

Settled by the owner on 2026-11-17 (`docs/implementation/CONSOLE-REDESIGN-RULINGS.md`). Living specimens: `mock-console-v2-patterns.html`, notes in `notes-console-v2-patterns.md`. These apply to the staff console only. Where this section and section 3 differ, this section wins in the console and section 3 wins in the customer app.

### Rules that settle the old conflicts

1. **Rows.** Console table rows are 44px, header 36px with 12px muted text. Read-only registers where staff scan and never act (Invoices, Access log) use 36px compact rows. Every other list is 44px. One density, no user setting. The customer app keeps 52px. On phone a row stays 44px.
2. **One raised surface, plus overlays.** The list or form the screen is for is the one raised white surface. Overlay layers (side panel, menu, toast, command bar, dialog) are not raised surfaces. They carry the popover shadow `0 1px 2px rgba(42,28,16,.05), 0 12px 32px -12px rgba(42,28,16,.14)` (token `--shadow-popover`; dialogs keep the dialog shadow). Only one overlay of each kind is open at once, and a panel never holds a second panel.
3. **One primary per screen.** One near-black primary on the page. When a side panel is open, the panel foot carries the only primary and the row verbs go secondary.
4. **Secondary buttons.** White with a `#E3E0D9` border on white surfaces; a sunken soft fill on paper. Never outlined on paper.
5. **Confirmation.** A native dialog is allowed only to confirm an action that emails the customer, moves or records money, or cannot be undone. Anything reversible and internal does the thing and shows a toast with Undo.
6. **Status vocabulary.** Late and failed: red (`--color-error`, wash `--color-error-wash`). Waiting and next step: gold wash. Done and active: sage (text `--color-sage-text` on `--color-sage-wash`). Idle: sunken. Every status has a word; colour is never the only sign. Clocks are Mono (`17d 08h remaining`, `5h 12m left`). Red appears only for late or failed.
7. **Gold budget.** Three accents per viewport: the rail mark, the Late card edge and one count. A selected row uses the soft wash `#FBF4EA` (`--color-rattan-soft`) and a 3px gold marker, which is one accent; do not add more.
8. **Rail.** `#23242A` with light text and gold count badges. Counts in red mean late or failed work.

### DataTable

Sticky header; first column is the object (bold name, small line below); figures and ages in Mono, right aligned; red only on a late age; last column holds the row's one verb and `RowActions`. Hover `#FAF9F6`. Selected row: soft gold wash and a 3px gold left marker. Optional money columns can be hidden; no column resize. States: loading (skeleton rows matching the layout), empty (`EmptyState`), error (`ErrorState` with Try again), selected, disabled row with the reason in text.

### RowActions

One visible verb and a three dot menu. The menu holds the less common actions as plain verbs, destructive last and red, never more than five. A disabled item stays focusable and shows its reason. The menu also opens on right click, only on the dots column and on rows with no text selected.

### SidePanel

480px from the right at 1100px and up, a full sheet below; slide 240ms. Scrim only on phone. Focus moves to the heading on open and returns to the opening row on close. `Esc` closes. The URL carries `?open=`. The header names the object; the primary button sits in a sticky foot. On wide screens it is a complementary region and focus may leave it; on phone focus is trapped.

### FilterBar

Pins under the page header while the list scrolls. Filter pills with counts, a search field, and active filters echoed as removable chips. The default filter shows work to do, never an empty list. A count that failed to read shows "?".

### InlineEdit

For names, notes, status, preview link and enquiry fields. Click or `Enter` edits, `Enter` saves, `Esc` cancels, `Tab` or blur saves, `Ctrl Enter` saves a multi-line note. Success is a toast with Undo. Errors stay in the field with the fix. Never for money or anything that emails the customer.

### Toast with Undo

Bottom left, ink background, white text (white focus ring). Plain toasts last 4 seconds. A toast with Undo lasts 10 seconds and the countdown pauses on hover and focus. Error toasts persist until dismissed. Polite live region for normal toasts, assertive for errors. At most three show. No Undo after a confirmed action, and no undo of an undo.

### BulkBar

Appears at the top of the list when rows are selected and replaces the filter bar: count, the permitted actions, Clear. Bulk follows the single-row rule (one toast, one confirm that states the count). A partial failure is stated with numbers and the failed rows stay selected. Anything that moves money is never bulk.

### CommandBar

`Ctrl K` or `Cmd K`, a native `<dialog>` with the combobox pattern. Empty term shows Recent (kept in the browser only) and Go to; results are grouped by kind; `>` shows actions only and `#` searches request references. Never shows an email body beyond the subject. No result says what was searched and offers the add actions.

### Keyboard

Single keys fire only when focus is not in a field and no dialog is open. No key deletes or sends on its own. Every shortcut has a visible button that does the same thing. `?` lists every shortcut that applies, built from the same registry the handlers use.

| Key | Does |
|---|---|
| `Ctrl K` / `Cmd K` | Command bar (works inside a field) |
| `?` | Shortcut help |
| `Esc` | Closes the top layer, one per press |
| `g` then `t` `c` `i` `m` `o` `s` | Go to Today, Clients, Inbox, Money, Compliance, System (second key within 1.2 seconds) |
| `/` | Focus the filter search |
| `u` | Undo the visible Undo toast |
| `j` `k` or arrows | Move the row cursor |
| `Enter` | Open the row in the side panel |
| `e` | Run the row verb everywhere (confirm first if it emails the customer) |
| `x` or `Space` (table focused) | Select the row |
| `Shift` with `j` `k`, `Ctrl A` | Extend the selection, select all in the filter |
| `.` or `Shift F10` | Row menu |

### Confirm and undo

| Action kind | Control |
|---|---|
| Reversible, internal, no email (enquiry status, ticket status, error status, internal note, rename, preview link) | Do it, toast with Undo (10 seconds) |
| Changes what the customer sees or emails them (send preview, mark live, send report, resend email, send setup link, cancel build, public reply) | Confirm dialog with a consequence line, then a plain toast |
| Irreversible, no email (close privacy request or breach, switch off staff, delete a coupon code, restore or extend a closure, extend by 30 days) | Confirm dialog with a consequence line |
| Moves or records money (refund, manual refund, add charge, waive) | Confirm dialog plus a required first-person tick box naming the amount, then a plain toast. Never bulk |
| A question the system asks (kickoff outcome) | `PromptPopup`, repeats until answered |

Confirm copy: the title is the act and its object, one consequence sentence in ink-2, the primary on the right named for the act (never "OK" or "Yes"), "Keep" as the cancel; the destructive variant is red and says what is lost. Errors keep the typed input.

## 9. How to use the ChatGPT images

Inspiration for layout ideas only (two-column Home, channel rows, approval strips). Ignore their spacing, type size, flatness and wording. The reviewed mocks in `docs/design/redesign/mock-*.html` (built to this language) are the reference for the build.

## 10. Review checklist for every screen

- One focal element. Gold used 3 times or fewer.
- Type from the scale; numbers in Mono; sentence case.
- Spacing on the 4px base; cards 28 padding; 24 gaps.
- All states: loading, empty, error, permission, success.
- Warm shadows only; no pure black or pure grey.
- Keyboard and reduced motion pass; 390 wide pass.
