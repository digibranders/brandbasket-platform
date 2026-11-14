# Master prompts with full context and the real brand (use these, not the short starters)

Why: the first starters had no brand colours or product context, so ChatGPT invented a grey monochrome UI with black buttons and its own navigation. The colours and navigation below are the real ones from the code (`apps/customer/src/styles/tokens.css`, `packages/shared/src/styles/theme.css`, `apps/customer/src/features/shell/rules.ts`).

How to use: open a NEW ChatGPT chat per app, paste the MASTER once, wait for "ready", then paste screen prompts from `02-PROMPTS-IN-ORDER.md` (they already say "Generate images now"). Re-paste the short REMINDER every 3 screens so it does not drift.

## BRAND UPDATE (owner, 2026-11-14): website brand accent overrides the colours and fonts in the customer master below

The website (brandbasket.in) and the brand guide use a warm palette: ink `#15161A`, rattan gold `#C48A47` (text `#A46C2F`, wash `#F4E6D3`, deep `#8A5524`), warm paper `#F6F5F2`, sunken `#EEECE7`, line `#E3E0D9`, sage `#4F7A63`, error `#B42318`, with Red Hat Display, Red Hat Text and Red Hat Mono. The customer app today uses blue `#1E65E3` and Geist, which does not match the website. For the redesign, use the website brand in the customer app: near-black primary buttons, rattan gold as the accent, Red Hat fonts. Source: `brand/guidelines/README.md`, website tokens `--b-*`. This is a design decision to confirm before Release 2 builds it (it changes the customer app tokens).

Paste this into the chat after the master (or instead of its COLOURS and TYPE sections):

```
BRAND UPDATE. Override the colours and fonts in my earlier message with the real BrandBasket website brand. Do not use blue anywhere. Palette: page background warm paper #F6F5F2; main surfaces and panels white #FFFFFF; soft chips and sunken areas #EEECE7; hairline borders #E3E0D9. Text near-black #15161A, secondary #4E5057. PRIMARY BUTTON: solid near-black #15161A with white text (hover #23242A). Secondary button: white with a thin #E3E0D9 border, or soft #EEECE7 fill. BRAND ACCENT: rattan gold #C48A47 (text on white #A46C2F, soft wash #F4E6D3, deep #8A5524). Use gold sparingly and consistently: the selected sidebar item gets a #F4E6D3 wash with a #C48A47 left marker, the "Next step" label and step numbers, progress and stepper fills, notification counts, the logo mark, and small highlight chips. Done and success: sage #4F7A63 on #E5EFE8. Waiting or attention: gold wash #F4E6D3 with text #8A5524. Late or failed: red #B42318 on #FDECEA. Links are near-black with a gold underline, never blue. Fonts: Red Hat Display for titles, Red Hat Text for body, Red Hat Mono for money, dates and ids. Keep everything else the same: the exact left navigation, 12px panels, plain words, Rs prices, no gradients, no em dashes. Redo your answer style from now on with this brand. Reply "ready".
```

## CUSTOMER APP MASTER

```
You are a senior product designer. Design screens for the BrandBasket customer dashboard. Follow EVERYTHING below exactly. Do not invent your own navigation, colours or style.

PRODUCT
BrandBasket (brandbasket.in) is a done-for-you digital presence service for small local businesses in India. The owner (a baker, physiotherapist, driving school owner) pays monthly and BrandBasket looks after three services: Website Management, Social Media Management, Paid Ads Management. Prices are Rs 2,999 a month each, GST included. Dedicated Expert Monitoring is Rs 6,000 a month, free when all three are bought. Social is first month Rs 1 then Rs 2,999. A Monthly or Yearly (Save 10%) switch exists. Billing is monthly by default. Paid Ads is only an information page for now ("Coming soon"). Users are non-technical, often on a phone. Tone: calm, plain words, reassuring. Prefer Indian English and Indian business content. Show "Rs", not the dollar sign.

SERVICES IN THE APP
Website: kickoff call, preview, approve, live. Social: automated; the customer connects Instagram, Facebook Pages, LinkedIn and Google, confirms the website, presses "Write my posts", keeps or drops topics, approves each picture (or turns on automatic posting per channel with consent), sees a calendar. The customer is told when a post fails or a connection expires. There is no setup call for Social.

LEFT NAVIGATION (use exactly these labels, in this order, with simple line icons)
Top: Home, Enquiries, Requests
Group "Services": Website, Social media, Paid Ads
Group "Business": Reports, Business profile
Bottom: Plan & billing, Settings, Help & calls
Top bar: business name switcher on the left, search with a keyboard hint, notification bell, round avatar. Do not add other menu items.

COLOURS (use only these)
Page background: #FFFFFF. Sidebar and soft panels: #F6F7F9 and #F1F3F6. Hover: #EFF1F4. Selected nav item and highlights: #EAF1FE (blue wash).
Text: #111418 main, #3F4650 secondary, #5B6370 tertiary, #8B93A0 muted. Borders: #E3E6EB and #ECEEF2, buttons border #D6DAE1.
PRIMARY BLUE: #1E65E3 (hover #1A56C4, link text #175AD0). Primary buttons are solid blue with white text. Secondary buttons are white with a thin #D6DAE1 border and dark text.
Warning: text #8A5300 on #FDF1DC. Info: text #2456A6 on #E9F0FB. Success green: #1F7A4D on #E1F2E8. Error red: #B42318 on #FDECEA.
Logo: the word BrandBasket in near-black #15161A with a small warm gold mark #C48A47 (use only for the logo).
No gradients, no glass, no 3D, no neon, no drop shadows on resting elements.

TYPE AND SHAPE
Typeface Geist (clean geometric sans); Geist Mono for money and dates. Sentence case. Title 28px semibold, section 18px, body 14 to 15px, meta 12px. 8px grid. Panels have 12px corners and 1px #E3E6EB borders. Buttons 36px high (44px on phone), 8px corners. Status chips are small rounded pills in the wash colours above.

LAYOUT
Desktop 1440 wide: 248px sidebar, content up to a comfortable width, 24 to 32px padding. One main action per screen. Phone 390 wide: bottom tab bar (Home, Enquiries, Services, Requests, More).

CONTENT RULES
Use realistic Indian small business content (Sweet Crust Bakery, a physiotherapy clinic, a driving school). Dates like "Tue 17 Nov". Never invent results, testimonials or logos. Use these exact words: "Book your kickoff call", "Needs your OK", "Approve and go live", "Ask for changes", "We have started on your Social", "Reconnect Instagram", "Pay now". No em dashes or en dashes anywhere in the image text.

OUTPUT RULES
When I say "Generate images now", produce 3 distinct options as separate images, desktop 1440 wide unless I say phone. If I ask for several states, stack them vertically in one tall image per option. Keep the same sidebar, colours and type in every image. Reply "ready" and wait.
```

## CUSTOMER REMINDER (paste every 3 screens)

```
Reminder: keep to the BrandBasket customer master. Primary blue #1E65E3 buttons, white page, #F6F7F9 sidebar, text #111418, Geist, 12px panels, 1px #E3E6EB borders, no gradients. Left navigation exactly: Home, Enquiries, Requests, then Services (Website, Social media, Paid Ads), then Business (Reports, Business profile), then Plan & billing, Settings, Help & calls. Do not use dark grey or black primary buttons. Sentence case, Rs prices, no em dashes.
```

## STAFF CONSOLE MASTER

```
You are a senior product designer. Design screens for the BrandBasket staff console. One person runs everything from it. Follow EVERYTHING below exactly.

PRODUCT
BrandBasket is a done-for-you website, social media and ads service for small local businesses in India. The single staff member handles kickoff calls, website builds, customer requests, payments and refunds, monthly reports, and compliance. Social posting is automated by a separate system, so there is no Social work in the console except a read-only status. Paid Ads is display only for now.

LEFT RAIL (dark, use exactly these items with live count badges, red badge means late or failed)
Logo, then "Search everything" with a command K hint, then: Today, Clients, Inbox (Requests, Enquiries), Calls, Money (Payments, Invoices, Prices, Coupons, Affiliates), Compliance (Privacy requests, Breaches, Access log, Staff account), System (App errors, Emails and webhooks, Settings). Signed-in staff member at the bottom.

COLOURS (use only these)
Page background #F6F5F2, raised surface #FFFFFF, sunken (chips, soft buttons) #EEECE7, hairlines #E4E1DA.
Text #15161A, secondary #4E5057. Rail background #23242A with light text.
Accent (counts, waiting): rattan gold #C48A47, text #A46C2F, wash #F4E6D3. Done: sage #4A745E on #E5EFE8. Late or failed: red #B42318 on #FDECEA.
The one primary button per screen is solid near-black #23242A with white text. Secondary buttons are soft #EEECE7 fills, never outlined.
No gradients, no 3D, no neon, no shadows except on the one raised surface.

TYPE AND SHAPE
Red Hat Display for titles, Red Hat Text for body, Red Hat Mono for money, dates, ids and counts. Sentence case. Nothing below 11px. The page sits inset 8px with a 14px corner radius next to the rail. Content up to 1400px. One raised white panel for the main list or form per screen; everything else sits on the page with hairline dividers and a section title.

CONTENT RULES
Realistic Indian small businesses (Sweet Crust Bakery, Kulkarni Physio, Reddy Driving School), amounts in Rs, dates like "Sat 14 Nov". Use these exact words: "Call completed", "They did not join", "Reschedule", "Started without call confirmation", "Needs a look", "Refund". Never use the word "held" for calls. No em dashes or en dashes in the image text.

OUTPUT RULES
When I say "Generate images now", produce 3 distinct options as separate images, desktop 1440 wide. If I ask for several states, stack them vertically in one tall image per option. Keep the same rail, colours and type in every image. Reply "ready" and wait.
```

## CONSOLE REMINDER (every 3 screens)

```
Reminder: keep to the BrandBasket console master. Dark rail #23242A, page #F6F5F2, white raised panel, one near-black #23242A primary button, soft grey secondary buttons, rattan gold #C48A47 for counts, sage green for done, red #B42318 for late. Red Hat fonts. Rail items exactly: Today, Clients, Inbox, Calls, Money, Compliance, System. No em dashes.
```
