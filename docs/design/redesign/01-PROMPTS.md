# ChatGPT prompt pack

Paste STARTER first in a new chat, then one SCREEN prompt at a time. Keep the same chat for the same app so the style stays consistent. Never paste secrets or real customer data.

## STARTER (customer app)

```
You are a senior product designer. We are redesigning the customer dashboard of BrandBasket, a done-for-you website, social media and ads service for small local businesses in India (shop, clinic and school owners, mostly on phones, not technical).

Style rules for every image I ask for:
- Light theme, calm, lots of white space, soft grey surfaces, one dark primary button per screen, rounded 12px panels, thin hairline borders, no gradients, no glassmorphism, no 3D, no stock photos, no decorative illustrations.
- Typeface similar to Geist (clean geometric sans). Sentence case. Plain friendly words.
- One main action per screen. Clear status words. Rupee prices with GST included, for example "₹2,999 a month".
- Use realistic Indian small business content (a bakery, a physiotherapy clinic, a driving school). Never invent results or logos.
- No em dashes or en dashes in any text.
- Give me 3 distinct options per screen as separate images, desktop 1440 wide unless I say phone 390 wide.
Reply "ready" and wait for my first screen.
```

## STARTER (staff console)

```
You are a senior product designer. We are redesigning the staff console for BrandBasket. One person runs everything from it: customer requests, kickoff calls, website builds, payments and compliance.

Style rules:
- Light page with a dark left navigation rail (logo, search with a keyboard shortcut hint, items with live count badges). Content up to 1400px wide, inset with rounded corners.
- Dense but calm. One dark primary button per screen, one raised white surface for the main list or form, everything else on the page with hairline dividers. Soft grey chips, no outlined buttons, no shadows except the raised surface, no gradients.
- Typeface similar to Red Hat Display for titles and Red Hat Text for body, monospace for money, dates and ids. Sentence case.
- Red only means late or failed. Sage green means done.
- Realistic content: Indian small businesses, rupee amounts, dates like "Sat 14 Nov".
- No em dashes or en dashes in any text.
- Give me 3 distinct options per screen, desktop only.
Reply "ready" and wait for my first screen.
```

## SCREEN prompts: customer app

Replace nothing, paste as is. Add "phone 390 wide" for the mobile version.

1. **Sign up and intake**
```
Design the sign up screen (business name, name, email, state, mobile, password, terms) and the 3 to 5 short intake questions screen ("What kind of business do you run?" with option cards, progress bar, Skip for now). The side panel must change with the services chosen: for Social show "Connect your pages, we write and post for you", for Website show "Book a call, we build, you approve". 3 options.
```
2. **Basket and checkout**
```
Design the plan basket and checkout: services as selectable rows with price, the offer shown clearly ("First month ₹1, then ₹2,999 a month" for Social), a Monthly or Yearly switch ("Save 10%"), billing details, and one "Pay" button with a summary card showing GST. Also design the waiting state ("We are confirming your payment") and the failed state with a clear retry. 3 options.
```
3. **Home**
```
Design Home for a customer with Website and Social active. One big "Next step" card per service in priority order: Website "Book your kickoff call" with day and time picker, Social "Set up Social: connect your accounts". Below, a plain status line per service and a small "Needs your OK" area. Include a variant for a live customer showing status and the latest report. 3 options.
```
4. **Website**
```
Design the Website page in three states: kickoff booked ("Your kickoff call is booked for Tue 17 Nov, 3:00 pm"), preview ready (large preview image, "Approve and go live" primary, "Ask for changes" secondary, rounds left), and live (address, status, tabs Overview, Pages, Blog, Domain). Show a simple step timeline. 3 options.
```
5. **Social**
```
Design the Social page: a guided setup checklist (connect Instagram, Facebook Pages, LinkedIn, Google; confirm website; Write my posts), then the weekly calendar with scheduled posts, an approvals strip ("3 pictures waiting for your OK"), an automatic posting toggle per channel with a consent note, and a clear banner for "Reconnect Instagram". 3 options.
```
6. **Needs your OK and bell**
```
Design a "Needs your OK" list that collects website preview approval, post pictures, and a quote to accept, each row with age, one action, and the notification bell dropdown that links to it. 3 options.
```
7. **Requests and quote**
```
Design the Requests list and one request page: message thread, a quote card with "Accept and pay ₹X" and "Decline", status stepper (Sent, Quoted, In progress, Ready to check, Done). 3 options.
```
8. **Plan and billing**
```
Design Plan and billing: current services with price and next payment date, Add a service and Cancel a service actions with a clear confirmation, invoices table, a failed payment banner ("We could not take your last payment" with Pay now), and a lapsed state with Reactivate. Include Paid Ads as an information card marked "Coming soon". 3 options.
```
9. **Business, team, settings**
```
Design Business profile with brand kit upload, and Settings Team page to invite an editor or viewer with role explanations. 3 options.
```
10. **Delete and restore, help**
```
Design the Delete account flow (clear consequences, 30 day restore note, confirm), the Restore account screen, and the Help page with contact form and call booking. 3 options.
```
11. **Reports**
```
Design the monthly Reports list and one report page with Website visits and Social numbers, a PDF download, and an honest empty state when no report exists yet. 3 options.
```

## SCREEN prompts: staff console

1. **Today**
```
Design Today: a single list ordered by what is late first. Each row has a plain title, the customer, how late, and one action button. Row kinds: kickoff call to confirm, payment needs a look, preview approved to launch, domain move, past due, privacy request, started without call confirmation, new enquiry. Top strip of 4 figures. Right side small "Systems" health block. 3 options.
```
2. **Kickoff popup**
```
Design a popup in the console that appears when a kickoff call time has passed: "Did the kickoff call with Meera's Bakery happen?" with three actions: Call completed (optional notes box), They did not join, Reschedule. Also design the matching notification and how it looks on Today. 3 options.
```
3. **Client workspace**
```
Design the client page: header with business and services bought, tabs per service (Overview, Website, Social, Billing, Messages, People), a "What the customer sees" panel mirroring their status, a next step card, activity timeline. 3 options.
```
4. **Website tab**
```
Design the client Website tab: project stage stepper, preview versions, send preview, launch checks list with eight ticks, Mark live, and a confirmation dialog for dangerous actions (Cancel build, Put on hold). 3 options.
```
5. **Requests and thread**
```
Design the Requests list with clocks (soon, late) and a thread page with reply box, quote form, and what email the customer will receive. 3 options.
```
6. **Payments and refund**
```
Design Payments with a "Needs a look" section and a payment detail with a Refund action: choose full or partial amount, shows the credit note and the customer email preview, and a clear confirmation. Also a second action "Record a refund made outside BrandBasket". 3 options.
```
7. **Reports, Calls, Enquiries**
```
Design the Reports review (draft, held, approved, sent), the Calls list, and the Enquiries list on one consistent pattern. 3 options.
```
8. **Compliance and System**
```
Design Compliance (privacy requests with due dates, breaches with 6 and 72 hour timers, access log with filters) and System (app errors, emails and webhooks with retry state). 3 options.
```
9. **Sign in**
```
Design the staff sign in page with a second factor step. 3 options.
```

## Consistency pass

```
Take the winners we picked for Home, Website, Plan and billing and show them side by side at the same scale. List every inconsistency in spacing, button style, headings, status words and icons, then redraw the three screens fixed.
```
