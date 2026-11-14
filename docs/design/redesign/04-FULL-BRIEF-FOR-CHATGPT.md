# BrandBasket UI redesign: full brief for ChatGPT

You are a senior product designer. This document is everything you need. Read all of it, then work in batches. Do not invent your own navigation, colours, fonts or copy. If something is missing, make the simplest choice that fits this brief and list it under "Assumptions" with each batch.

## 1. Product

BrandBasket (brandbasket.in) is a done-for-you digital presence service for small local businesses in India. Customers are shop, clinic and school owners (a baker, a physiotherapist, a driving school owner), often on a phone, not technical. They pay monthly and BrandBasket looks after up to three services:

- **Website Management**: BrandBasket builds the website. The customer books a kickoff call, reviews a preview, approves it, and it goes live.
- **Social Media Management**: fully automated. The customer connects Instagram, Facebook Pages, LinkedIn and Google, confirms their website, presses "Write my posts", keeps or drops topics, approves each picture (or turns on automatic posting per channel with consent), and sees a calendar of scheduled posts. They are told when a post fails or a connection expires ("Reconnect Instagram"). No setup call.
- **Paid Ads Management**: an information page only for now, marked "Coming soon".

Prices: Rs 2,999 a month each, GST included. Dedicated Expert Monitoring Rs 6,000 a month, free when all three are bought. Social first month Rs 1, then Rs 2,999. A Monthly or Yearly ("Save 10%") switch exists at checkout. Show "Rs", never a dollar sign. Tone: calm, plain, reassuring. Sentence case.

There are two apps: the **customer app** and the **staff console** (one staff person runs everything). Design both.

## 2. Brand (use only these)

Source: the real BrandBasket website and brand guide.

- Page background warm paper `#F6F5F2`. Panels and surfaces white `#FFFFFF`. Sunken areas and soft chips `#EEECE7`. Hairline borders `#E3E0D9`.
- Text near-black `#15161A`; secondary `#4E5057`; muted `#8B93A0`.
- **Primary button**: solid near-black `#15161A`, white text (hover `#23242A`). Secondary button: white with a thin `#E3E0D9` border, or a soft `#EEECE7` fill. Never outlined heavy borders.
- **Brand accent, rattan gold** `#C48A47` (text on white `#A46C2F`, soft wash `#F4E6D3`, deep `#8A5524`). Use sparingly and consistently: selected sidebar item (gold wash with a gold left marker), the "Next step" label, step numbers, stepper and progress fills, notification counts, the logo mark, small highlight chips.
- Done and success: sage `#4F7A63` on `#E5EFE8`. Waiting or attention: gold wash `#F4E6D3` with text `#8A5524`. Late or failed: red `#B42318` on `#FDECEA`.
- Links: near-black with a gold underline. **No blue anywhere.**
- Logo: the word BrandBasket in near-black with a small gold mark.
- Fonts: **Red Hat Display** for titles, **Red Hat Text** for body, **Red Hat Mono** for money, dates, ids and counts. Title 28px semibold, section 18px, body 14 to 15px, meta 12px. Nothing below 11px.
- Shape: 8px grid, panels 12px corners with 1px borders, buttons 36px high (44px on phone) with 8px corners, status chips are small pills.
- Never: gradients, glass, 3D, neon, stock photos, decorative illustrations, shadows on resting elements. No em dashes or en dashes in any text in the images.

## 3. Customer app rules

- **Left navigation, exactly these labels in this order, simple line icons:** Home, Enquiries, Requests. Group "Services": Website, Social media, Paid Ads. Group "Business": Reports, Business profile. Bottom: Plan & billing, Settings, Help & calls. Add no other items.
- Top bar: business name switcher on the left, search with a keyboard hint, notification bell, round avatar.
- Desktop 1440 wide with a 248px sidebar, content up to a comfortable width. One main action per screen.
- Phone 390 wide: bottom tab bar (Home, Enquiries, Services, Requests, More).
- Content: Indian small businesses (Sweet Crust Bakery, a physiotherapy clinic, a driving school), dates like "Tue 17 Nov". Never invent results or logos.
- Use these exact words: "Book your kickoff call", "Needs your OK", "Approve and go live", "Ask for changes", "We have started on your Social", "Reconnect Instagram", "Pay now".

## 4. Staff console rules

- Dark left rail `#23242A` with light text: logo, "Search everything" with a command K hint, then items with live count badges (a red badge means late or failed): Today, Clients, Inbox (Requests, Enquiries), Calls, Money (Payments, Invoices, Prices, Coupons, Affiliates), Compliance (Privacy requests, Breaches, Access log, Staff account), System (App errors, Emails and webhooks, Settings). Signed-in staff at the bottom.
- The page sits inset 8px with a 14px radius next to the rail, content up to 1400px, desktop only.
- One raised white panel per screen for the main list or form; everything else on the page with a section title and hairline dividers. One primary button per screen (near-black). Secondary buttons are soft `#EEECE7` fills. Gold marks counts and waiting; sage marks done; red marks late.
- Content: the same Indian businesses, amounts in Rs, dates like "Sat 14 Nov". Say "Call completed", "They did not join", "Reschedule", "Started without call confirmation", "Needs a look", "Refund". Never use the word "held" for calls.

## 5. How to deliver (important)

Work in batches, one batch at a time. For each screen produce **3 distinct options** as separate images, desktop 1440 wide (customer) or desktop (console) unless the screen says phone. Where a screen lists several states, stack the states vertically in one tall image per option. Keep the same sidebar or rail, colours, fonts and spacing in every image so the set looks like one product.

After each batch, deliver **one zip file** containing all images of that batch, named like `Batch-1-Home-Website-Social-options.zip`, with files named `NN-screen-option-N.png` (for example `01-home-option-2.png`). Then list the files and any assumptions, and **stop and wait for me to say "next batch"**. If you cannot make a zip yourself, give me the images one by one with those file names. Do not start the next batch on your own.

## 6. Batches

### Customer app

**Batch 1: Home, Website, Social**
1. **Home**, two stacked states: a new customer with Website and Social active, and a live customer. One large "Next step" card per service in priority order (Website: "Book your kickoff call" with a day and time picker; Social: "Set up Social: connect your accounts"), then a plain status line per service and a small "Needs your OK" area. The live variant shows status and the latest report.
2. **Website**, three stacked states: kickoff booked ("Your kickoff call is booked for Tue 17 Nov, 3:00 pm"), preview ready (large bakery preview image, "Approve and go live" primary, "Ask for changes" secondary, rounds left), live (address, status, tabs Overview, Pages, Blog, Domain). A simple step timeline on each.
3. **Social**, two stacked states: first-time setup (guided checklist: connect Instagram, Facebook Pages, LinkedIn, Google; confirm website; "Write my posts"), and running (weekly calendar with scheduled posts, an approvals strip "3 pictures waiting for your OK", an automatic posting toggle per channel with a consent note, and a clear "Reconnect Instagram" banner).

**Batch 2: Plan and billing, Needs your OK, Requests**
4. **Plan and billing**, three stacked states: normal (current services with price and next payment date, "Add a service" and "Cancel a service", invoices table, a Paid Ads information card marked "Coming soon"), failed payment (banner "We could not take your last payment" with "Pay now" and "Change card"), lapsed (read only notice with "Reactivate"). Show the cancel service confirmation as a small inset.
5. **Needs your OK and the bell**: a list collecting a website preview to approve, three social pictures to approve and a quote to accept, each row with age, what it is and one action; the notification bell dropdown with the same items; an empty state "Nothing needs your OK right now" as an inset.
6. **Requests**, two stacked states: the list with status chips, and one request page with a message thread, a quote card ("Accept and pay Rs 1,500" and "Decline"), and a stepper (Sent, Quoted, In progress, Ready to check, Done).

**Batch 3: Sign up, Checkout, Business and Team**
7. **Sign up and intake**, two stacked states: sign up (business name, name, email, state, mobile, password, terms) and an intake question ("What kind of business do you run?" with option cards, progress bar, "Skip for now"). The side panel changes with the service: for Social "Connect your pages, we write and post for you", for Website "Book a call, we build, you approve".
8. **Basket and checkout**: services as selectable rows with price, the offer ("First month Rs 1, then Rs 2,999 a month" for Social), a Monthly or Yearly switch ("Save 10%"), billing details, one "Pay" button, a summary card with GST. Waiting ("We are confirming your payment") and failed (clear retry) as two small insets.
9. **Business profile and Team**, stacked: business profile with brand kit upload (logo, colours, photos), and Settings Team page to invite an editor or viewer with a short explanation of each role.

**Batch 4: Reports, Delete and Help, Paid Ads**
10. **Reports**: monthly list and one report page (website visits, Social numbers, PDF download) and an honest empty state ("Your first report arrives after your first full month").
11. **Delete account, Restore and Help**, stacked: delete flow (clear consequences, "your account can be restored for 30 days", confirm), the restore screen, and the Help page with a contact form and call booking.
12. **Paid Ads information page** for a customer who does not have it: what it will do (Meta ads on Facebook and Instagram), "Rs 2,999 a month", "Add to plan", and a calm "Ads reporting is coming soon" note.

**Batch 5: Phone versions (390 wide)**
13. Phone versions of Home, Social, Needs your OK, Plan and billing and checkout, each with the bottom tab bar. One image per screen, 3 options each.

**Batch 6: Consistency pass**
14. Show the chosen customer screens side by side at the same scale, list every inconsistency in spacing, buttons, headings, status words and icons, and redraw them fixed. (I will tell you which options won.)

### Staff console

**Batch 7: Today, Kickoff popup, Client workspace**
15. **Today**: a single list ordered by what is late first. Each row has a plain title, the customer, how late, and one action. Row kinds: kickoff call to confirm, payment needs a look, preview approved to launch, domain move, past due, privacy request, started without call confirmation, new enquiry. A top strip of four figures and a small "Systems" health block.
16. **Kickoff popup**: a popup when a kickoff call time has passed: "Did the kickoff call with Meera's Bakery happen?" with three actions: Call completed (with an optional notes box), They did not join, Reschedule. Also the matching notification and how the same prompt looks on Today.
17. **Client workspace**: header with the business and services bought, tabs per service (Overview, Website, Social, Billing, Messages, People), a "What the customer sees" panel mirroring their status, a next step card, an activity timeline.

**Batch 8: Website tab, Payments, Requests**
18. **Website tab**: project stage stepper, preview versions, "Send preview", a launch checks list with eight ticks, "Mark live", and a confirmation dialog for dangerous actions (Cancel build, Put on hold).
19. **Payments and refund**: a "Needs a look" section and a payment detail with a Refund action (full or partial, shows the credit note and the customer email preview, clear confirmation), plus a smaller "Record a refund made outside BrandBasket".
20. **Requests**: list with clocks (soon, late) and a thread page with a reply box, a quote form and a preview of the email the customer will receive.

**Batch 9: Reports, Calls, Enquiries, Compliance, System, Sign in**
21. **Reports review, Calls and Enquiries** on one consistent list pattern.
22. **Compliance** (privacy requests with due dates, breaches with 6 and 72 hour timers, access log with filters) and **System** (app errors, emails and webhooks with retry state).
23. **Sign in** with a second factor step (code from an authenticator app).

**Batch 10: Console consistency pass**
24. Today, Client workspace and Payments side by side, inconsistencies listed, then redrawn fixed.

### Remaining pages (design each shared pattern once, in the same brand; the other pages reuse it)

**Batch 11: Account and access pages (customer, desktop and phone)**
25. **Sign in**, **Forgot password**, **Reset password** (link works once, signs out other devices), stacked in one tall image, with the split panel layout used for account pages.
26. **Invite page**: a signed-out visitor opening an invite ("You have been invited to join Sweet Crust Bakery as an editor"), with Sign in and Create an account; then the states shown BEFORE the Join button: invite expired, already used, wrong email address, signed in with the right email ("Join the team"). Also the **Setup link** page ("This link no longer works. Ask us for a new one") and the **Restore account** state.

**Batch 12: Settings family (one pattern, six tabs)**
26b. A Settings page with tabs Profile, Sign-in and security, Notifications, Team, Privacy and data, Delete account. Show the pattern once with Profile open, then small insets for each other tab's main block (change password and sessions, notification toggles per topic, team list with Invite someone, data export and privacy request, delete account with the 30 day restore note).

**Batch 13: Website and Social sub-pages**
27. **Website sub-pages**: Pages (list of site pages with edit), Domain (move to their own domain, with steps and status), Blog (posts list, a simple editor with categories and authors), all under the same Website tab strip.
28. **Social sub-pages**: Review (pictures to approve one by one, keep or drop topics, ask for a topic), Analytics (posts and reach per channel, last 30 days), and Setup checklist (the Home Checklist page: items with done, open and "Save" per item).
29. **Enquiries** (customer's leads from their website: list, one enquiry with call and WhatsApp buttons) and **Business profile detail** (brand kit: logo, colours, photos, business facts).

**Batch 14: Billing sub-pages and notifications**
30. **Invoices** (table, download all, receipts), **Payment method** (change card, secure hosted step), **Add a service** (price, what changes on the next bill, confirm and pay), **Cancel a service** and **Close account** confirmation with consequences. Stack as states of the Plan and billing family.
31. **What's new** (changelog list), **Notifications** page (the bell's full list with filters), and the **Affiliate area** (a simple earnings and codes page).

**Batch 15: States (design these for the screens above)**
32. The five shared states, shown as one reference sheet using a real screen (for example Requests): loading (skeleton), empty (with a clear action), error with a recovery action ("Something went wrong. Try again"), permission denied ("Ask your owner to do this", for a viewer), and expired or invalid link.
33. The **payment** states in one sheet: waiting for confirmation, payment failed, payment pending, money received but not applied (customer message "We received your payment and are sorting it out"), and a successful welcome.

**Batch 16: Console remaining pages (one list, detail and settings pattern)**
34. **Clients list and Board**: a searchable clients list with service chips and status, and a Board of website projects in columns by stage.
35. **Detail pages on one pattern**: Enquiry detail, New request, Invoices, Prices, Coupons and Affiliates, each as a list page with a right-hand detail panel or a simple form.
36. **Compliance detail and System detail**: Staff account (one account, protection status: Access check, second factor, recovery admin), Access log with filters, Breaches, App errors detail, Emails and webhooks detail with retry, Settings, Leaving (accounts being erased with days left).

## 7. Start

Reply "ready" and one line confirming the navigation, the primary button colour and the accent colour you will use. Then wait for me to say "start Batch 1".
