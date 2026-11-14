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
- **Tables:** 15px rows, 52px high, hairline between rows, header 12px muted, right-aligned figures in Mono, hover `#FAF9F6`.
- **Forms:** label above, 42px inputs, 8px radius, `#CFCBC2` border that darkens on hover and gets the ink focus ring; helper text 13px muted; errors in red with an icon and a fix.
- **Dialogs:** 20px radius, 28px padding, title 22px, consequence line in ink-2, primary on the right. Destructive confirm uses the red variant with the consequence stated.
- **Toasts:** bottom left, ink background, white text, 4 seconds, with an Undo where possible.
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

Same tokens. Dark rail `#23242A` with light text and gold count badges; page paper `#F6F5F2`; one raised white panel per screen; denser rows (44px). Red only for late or failed. One near-black primary per screen. Popup and prompt components use the dialog spec.

## 9. How to use the ChatGPT images

Inspiration for layout ideas only (two-column Home, channel rows, approval strips). Ignore their spacing, type size, flatness and wording. The reviewed mocks in `docs/design/redesign/mock-*.html` (built to this language) are the reference for the build.

## 10. Review checklist for every screen

- One focal element. Gold used 3 times or fewer.
- Type from the scale; numbers in Mono; sentence case.
- Spacing on the 4px base; cards 28 padding; 24 gaps.
- All states: loading, empty, error, permission, success.
- Warm shadows only; no pure black or pure grey.
- Keyboard and reduced motion pass; 390 wide pass.
