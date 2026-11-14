# Prompts in order (paste one at a time)

Done so far in the customer chat: Starter, Home, Website. Continue in the same chat with item 1. Tick each box when you have picked a winner and saved it to `docs/design/redesign/customer/` (or `console/`) as `NN-screen-option.png`, then add one line to `DECISIONS.md`.

Every prompt asks for 3 options as separate images. States are stacked in one tall image per option.

## Part A: customer app (same chat as the customer starter)

- [x] Starter
- [x] Home
- [x] Website

### 1. Social
```
Generate images now. Design the Social page: a guided setup checklist (connect Instagram, Facebook Pages, LinkedIn, Google; confirm website; Write my posts), then the weekly calendar with scheduled posts, an approvals strip ("3 pictures waiting for your OK"), an automatic posting toggle per channel with a consent note, and a clear banner for "Reconnect Instagram". Show it as two stacked states in one tall image: first-time setup, and running with posts scheduled. Give 3 options as separate images.
```

### 2. Plan and billing
```
Generate images now. Design Plan and billing as three stacked states in one tall image: normal (current services with price and next payment date, Add a service and Cancel a service actions, invoices table, a Paid Ads information card marked "Coming soon"), failed payment (banner "We could not take your last payment" with a "Pay now" button and "Change card"), and lapsed (read only notice with "Reactivate"). Show the confirmation dialog for cancelling a service as a small inset. Give 3 options as separate images.
```

### 3. Needs your OK and the bell
```
Generate images now. Design a "Needs your OK" list that collects a website preview to approve, three social pictures to approve, and a quote to accept, each row with age, what it is, and one action button. Also design the notification bell dropdown that lists the same items and links to them. Show an empty state ("Nothing needs your OK right now") as a small inset. Give 3 options as separate images.
```

### 4. Requests and quote
```
Generate images now. Design the Requests list and one request page stacked in one tall image: the list with status chips, then a request with a message thread, a quote card ("Accept and pay Rs 1,500" and "Decline"), and a status stepper (Sent, Quoted, In progress, Ready to check, Done). Give 3 options as separate images.
```

### 5. Sign up and intake
```
Generate images now. Design the sign up screen (business name, name, email, state, mobile, password, terms) and the 3 to 5 short intake question screen ("What kind of business do you run?" with option cards, progress bar, "Skip for now"), stacked in one tall image. The side panel changes with the chosen service: for Social show "Connect your pages, we write and post for you", for Website show "Book a call, we build, you approve". Give 3 options as separate images.
```

### 6. Basket and checkout
```
Generate images now. Design the plan basket and checkout stacked in one tall image: services as selectable rows with price, the offer shown clearly ("First month Rs 1, then Rs 2,999 a month" for Social), a Monthly or Yearly switch ("Save 10%"), billing details, one "Pay" button, and a summary card showing GST. Then the waiting state ("We are confirming your payment") and the failed state with a clear retry as two small insets. Give 3 options as separate images.
```

### 7. Business and Team
```
Generate images now. Design the Business profile page with a brand kit upload (logo, colours, photos), and the Settings Team page to invite an editor or viewer with a short explanation of each role, stacked in one tall image. Give 3 options as separate images.
```

### 8. Reports
```
Generate images now. Design the monthly Reports list and one report page with website visits and Social numbers, a PDF download button, and an honest empty state ("Your first report arrives after your first full month"), stacked in one tall image. Give 3 options as separate images.
```

### 9. Delete, restore and Help
```
Generate images now. Design the Delete account flow (clear consequences, a note that the account can be restored for 30 days, a confirm step), the Restore account screen, and the Help page with a contact form and call booking, stacked in one tall image. Give 3 options as separate images.
```

### 10. Paid Ads information page
```
Generate images now. Design the Paid Ads page for a customer who does not have it yet: what it will do (Meta ads on Facebook and Instagram), the price "Rs 2,999 a month", and an "Add to plan" button, with a calm "Ads reporting is coming soon" note. Give 3 options as separate images.
```

### 11. Phone versions (do after you pick winners)
```
Take our chosen Home, Social and Plan and billing designs and redo each for phone, 390 wide, with a bottom tab bar (Home, Needs your OK, Services, Requests, More). Give one image per screen.
```

### 12. Consistency pass (customer)
```
Take the winners we picked for Home, Website, Social and Plan and billing and show them side by side at the same scale. List every inconsistency in spacing, button style, headings, status words and icons, then redraw the four screens fixed.
```

## Part B: staff console (start a NEW chat, paste this starter first)

```
You are a senior product designer. We are redesigning the staff console for BrandBasket. One person runs everything from it: customer requests, kickoff calls, website builds, payments and compliance.

Style rules:
- Light page with a dark left navigation rail (logo, search with a keyboard shortcut hint, items with live count badges). Content up to 1400px wide, inset with rounded corners.
- Dense but calm. One dark primary button per screen, one raised white surface for the main list or form, everything else on the page with hairline dividers. Soft grey chips, no outlined buttons, no shadows except the raised surface, no gradients.
- Typeface similar to Red Hat Display for titles and Red Hat Text for body, monospace for money, dates and ids. Sentence case.
- Red only means late or failed. Sage green means done.
- Realistic content: Indian small businesses, rupee amounts, dates like "Sat 14 Nov".
- No em dashes or en dashes in any text.
- Give me 3 distinct options per screen as separate images, desktop only.
Reply "ready" and wait for my first screen.
```

### C1. Today
```
Generate images now. Design Today: a single list ordered by what is late first. Each row has a plain title, the customer, how late, and one action button. Row kinds: kickoff call to confirm, payment needs a look, preview approved to launch, domain move, past due, privacy request, started without call confirmation, new enquiry. Top strip of 4 figures. Small "Systems" health block on the right. Give 3 options as separate images.
```

### C2. Kickoff popup
```
Generate images now. Design a popup in the console that appears when a kickoff call time has passed: "Did the kickoff call with Meera's Bakery happen?" with three actions: Call completed (with an optional notes box), They did not join, Reschedule. Also design the matching notification and how the same prompt looks on Today. Give 3 options as separate images.
```

### C3. Client workspace
```
Generate images now. Design the client page: header with the business and the services bought, tabs per service (Overview, Website, Social, Billing, Messages, People), a "What the customer sees" panel mirroring their status, a next step card, and an activity timeline. Give 3 options as separate images.
```

### C4. Website tab
```
Generate images now. Design the client Website tab: project stage stepper, preview versions, Send preview, a launch checks list with eight ticks, Mark live, and a confirmation dialog for dangerous actions (Cancel build, Put on hold). Give 3 options as separate images.
```

### C5. Payments and refund
```
Generate images now. Design Payments with a "Needs a look" section, and a payment detail with a Refund action: choose full or partial amount, shows the credit note and the customer email preview, and a clear confirmation. Add a second, smaller action "Record a refund made outside BrandBasket". Give 3 options as separate images.
```

### C6. Requests and thread
```
Generate images now. Design the Requests list with clocks (soon, late) and a request thread page with a reply box, a quote form, and a preview of the email the customer will receive. Give 3 options as separate images.
```

### C7. Reports, Calls and Enquiries
```
Generate images now. Design the Reports review (draft, held, approved, sent), the Calls list, and the Enquiries list on one consistent list pattern. Give 3 options as separate images.
```

### C8. Compliance and System
```
Generate images now. Design Compliance (privacy requests with due dates, breaches with 6 and 72 hour timers, access log with filters) and System (app errors, emails and webhooks with retry state) stacked in one tall image. Give 3 options as separate images.
```

### C9. Sign in
```
Generate images now. Design the staff sign in page with a second factor step (code from an authenticator app). Give 3 options as separate images.
```

### C10. Consistency pass (console)
```
Take the winners we picked for Today, Client workspace and Payments and show them side by side at the same scale. List every inconsistency in spacing, button style, headings, status words and icons, then redraw the three screens fixed.
```
