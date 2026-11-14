# Final user flow and journey diagrams (both apps)

The target journey from `19`, drawn. Decisions applied: one staff account, offers kept, Social automated by social-auto, Paid Ads display only, "Call completed" kickoff prompt, customer told when work starts. Boxes marked NEW are in the Release 1 or 2 packages, the rest exists today. Diagrams are Mermaid: open this file in a viewer that renders it.

## 1. The whole lifecycle across both apps

```mermaid
flowchart TD
    A[Marketing site: choose services] --> B[/signup/]
    B --> C[Email code]
    C --> D[/start intake questions/]
    D --> E[/checkout: basket, offers, billing details/]
    E --> F{Payment}
    F -- paid --> G[Home: one next task per service]
    F -- pending --> F1[Waiting screen]
    F1 --> F
    F -- failed --> E
    F -- webhook lost --> F2[NEW job recovers within minutes]
    F2 --> G
    G --> W[Website track]
    G --> S[Social track]
    G --> P[Paid Ads: display page only]
    W --> M[Ongoing month]
    S --> M
    P --> M
    M --> R{Renewal}
    R -- ok --> M
    R -- fails --> X[Failed payment: Pay now, self serve card change]
    X --> R
    X -- not fixed --> L[Lapsed: read only, reactivate]
    L -- reactivate --> M
    M --> Z[Cancel a service or close account]
    Z --> Y[30 day restore window]
    Y -- restore --> M
    Y -- 30 days pass --> Q[Erased]
    C1[Staff console: Today] -.-> G
    C1 -.-> W
    C1 -.-> M
    C1 -.-> L
```

## 2. Customer app: every page and where it leads

```mermaid
flowchart LR
    subgraph Public
      signup[/signup/] --> start
      login[/login/] --> home
      forgot[/forgot-password/] --> reset[/reset-password/token/]
      invite[/invite/token/] --> login
      setup[/setup/token/]
    end
    subgraph Before_paying
      start[/start questions/] --> checkout[/checkout/]
      checkout --> confirm[Payment window] --> home
    end
    subgraph Workspace
      home[/ Home/] --> checklist[/checklist/]
      home --> website[/website/]
      home --> social[/social/]
      home --> ads[/ads/]
      home --> enq[/enquiries/]
      home --> req[/requests/]
      home --> rep[/reports/]
      home --> biz[/business/]
      home --> bill[/billing/]
      home --> set[/settings/]
      home --> help[/help/]
      website --> wp[/website/pages/]
      website --> wd[/website/domain/]
      website --> wb[/website/blog/]
      social --> sr[/social/review/]
      social --> sa[/social/analytics/]
      req --> reqd[/requests/id/]
      rep --> repm[/reports/month/]
      biz --> brand[/business/brand/]
      bill --> inv[/billing/invoices/]
      bill --> pay[/billing/payment/]
      bill --> addpay[/billing/services/pay/]
      set --> sec[/settings/security/]
      set --> notif[/settings/notifications/]
      set --> team[/settings/team/]
      set --> priv[/settings/privacy/]
      set --> del[/settings/delete/] --> restore[/restore-account/]
      help --> hc[/help/contact/]
    end
    bell((Bell)) --> reqd
    bell --> website
    bell --> social
    bell --> bill
```

What each page is for (customer):

| Page | Job | Main action | Staff counterpart |
|---|---|---|---|
| `/signup`, `/start`, `/checkout` | Create account, answer questions, pay | Pay | Payments, client Overview |
| `/` Home | One next action per service, status | Next task | Today, client workspace |
| `/checklist` | Setup items | Save item | client Overview setup answers |
| `/website` | Kickoff, preview, approve, live | Approve or ask for changes | client Website tab, Calls, Board |
| `/website/pages`, `/domain`, `/blog` | Edit pages, move domain, write posts | Save, request move | client Website tab |
| `/social` | Connect, write posts, approve pictures, calendar | Approve | read-only Social status, social-auto dashboard |
| `/social/review`, `/analytics` | Review posts, numbers | Approve | same |
| `/ads` | Paid Ads information | Add to plan | client Plan and billing |
| `/enquiries` | Leads from their site | View | none |
| `/requests`, `/requests/id` | Ask, quote, pay, approve | Send, accept quote | Requests |
| `/reports`, `/reports/month` | Monthly report | Download | Reports |
| `/business`, `/business/brand` | Business profile and brand | Save | client People and Website |
| `/billing` and children | Plan, services, invoices, card, add or cancel | Pay, add, cancel | Payments, Invoices, client billing |
| `/settings` and children | Profile, security, notifications, team, privacy, delete | Save, invite, delete | People, Compliance |
| `/help`, `/help/contact` | Help and calls | Send | Requests |
| `/restore-account` | Undo deletion | Restore | Leaving, Compliance |

## 3. Staff console: every page and where it leads (one staff account)

```mermaid
flowchart LR
    login[/login/] --> today
    today[/ Today: one list, late first/] --> clients[/clients/]
    today --> calls[/calls/]
    today --> sup[/support requests/]
    today --> leads[/leads enquiries/]
    today --> pay[/payments/]
    today --> comp[/compliance/]
    clients --> cw[/clients/id workspace/]
    cw --> ov[Overview]
    cw --> wt[Website tab]
    cw --> pb[Plan and billing tab]
    cw --> ms[Messages tab]
    cw --> pe[People tab]
    clients --> board[Board]
    clients --> reps[Reports review]
    clients --> leave[Leaving]
    sup --> supd[/support/id/] 
    sup --> supn[/support/new/]
    leads --> leadd[/leads/id/]
    pay --> inv[/invoices/]
    pay --> pr[/pricing/]
    pay --> co[/coupons/]
    pay --> af[/affiliates/]
    comp --> pv[/privacy-requests/]
    comp --> br[/breaches/]
    comp --> al[/access-log/]
    comp --> st[/staff/]
    today --> sys[System]
    sys --> err[/app errors/]
    sys --> dl[/emails and webhooks/]
    sys --> set[/settings/]
```

Staff console pages and what each does:

| Page | Job | Customer result |
|---|---|---|
| Today | Everything that needs action, late first | none, it points to the rest |
| Calls | Kickoff popup: Call completed, They did not join, Reschedule (NEW) | Customer status "Thanks for the call. We are getting your website started" |
| Clients, client workspace | One tab per service bought; Overview, Website, Plan and billing, Messages, People | Mirrors the customer's status |
| Board | Website projects by stage | Customer sees the stage headline |
| Reports | Review and send monthly reports | Report email and `/reports` |
| Requests (`/support`) | Reply, quote, close | Customer thread, emails |
| Enquiries (`/leads`) | BrandBasket's own sales enquiries | Setup link email |
| Payments, Invoices | Money, flagged payments, refund (NEW real refund), credit note | Receipt, refund email |
| Pricing, Coupons, Affiliates | Prices and codes | Checkout |
| Compliance: privacy requests, breaches, access log, staff | Legal duties, audit trail, the one account | Confirmation emails |
| System: app errors, emails and webhooks, settings | Health, retries | none |

## 4. Website track (both sides)

```mermaid
stateDiagram-v2
    [*] --> Paid
    Paid --> KickoffBooked: customer books call
    KickoffBooked --> CallDue: call time passes
    CallDue --> Building: staff press Call completed
    CallDue --> Rebook: They did not join
    Rebook --> KickoffBooked
    CallDue --> Building: 24h fallback, labelled Started without call confirmation
    Building --> PreviewSent: staff send preview
    PreviewSent --> Revisions: customer asks for changes
    Revisions --> PreviewSent: staff send updated preview
    PreviewSent --> Approved: customer approves
    Approved --> Live: eight launch checks, Mark live
    Live --> [*]
    Building --> OnHold: staff put on hold
    OnHold --> Building
```

Customer sees: booked, "We will start your website right after your call", "Thanks for the call. We are getting your website started", "We are building", "Your preview is ready" (approve here, not by email reply), "We are making your changes", "You approved the preview", "Your website is live". Staff sees: Calls popup, Board column, Today rows (NEW: approved previews, revisions due, domain moves).

## 5. Social track (automated, no staff work)

```mermaid
flowchart TD
    a[Buy Social] --> b[Home: Set up Social]
    b --> c[Connect Instagram, Facebook, LinkedIn, Google]
    c --> d[Confirm website, Write my posts]
    d --> e[Facts and topics: keep or drop]
    e --> f[Pictures: approve each, or turn on automatic posting per channel]
    f --> g[Calendar: posts go out on chosen weekdays]
    g --> h[Edit, delete or send now before it goes out]
    g --> i[Analytics and monthly report]
    g --> j{Failure or connection expiring}
    j --> k[social-auto alerts the admin]
    j --> l[NEW: customer notified by bell and email, reconnect]
    m[Lapse or cancel] --> n[NEW: pause posting in social-auto, resume on reactivation]
```

## 6. Billing and subscription states

```mermaid
stateDiagram-v2
    [*] --> Unpaid
    Unpaid --> Active: first payment recorded
    Active --> Active: renewal ok
    Active --> PastDue: renewal fails
    PastDue --> Active: customer pays or changes card
    PastDue --> Lapsed: grace ends
    Lapsed --> Active: reactivate and pay
    Active --> Ending: cancel a service, runs to month end
    Active --> Closing: close account
    Closing --> Active: restore within 30 days
    Closing --> Erased: 30 days pass
    Erased --> [*]
```

## 7. Sign up and invite flows

```mermaid
flowchart TD
    s1[/signup/] --> s2[Email code] --> s3[/start/] --> s4[/checkout/]
    i1[Owner invites at Settings, Team] --> i2[Invite email]
    i2 --> i3[/invite/token/]
    i3 --> i4{Has account}
    i4 -- no --> i5[Create account with invite]
    i4 -- yes --> i6[Sign in]
    i5 --> i7[NEW: joins the inviter workspace, no personal business]
    i6 --> i7
    i7 --> i8[Invited dashboard with editor or viewer role]
    e1[Any app link when signed out] --> e2[Sign in] --> e3[NEW: returns to that link]
```

## 8. Feature checklist (customer and staff)

| Feature | Customer app | Staff console | Release |
|---|---|---|---|
| Sign up, email code, intake | yes | client Overview shows answers | exists, small fixes in 1 |
| Basket, offers, GST, checkout | yes | Payments, Invoices | exists |
| Lost payment recovery | transparent | Today row, job | 1 |
| Unpaid reach Help and Settings | yes | none | 1 |
| Abandoned sign-up reminder | email | Today row | 1 |
| Kickoff booking | Home | Calls | exists |
| Call completed prompt | status text | popup, notification, Today | 1 |
| Preview approve or ask changes | `/website` | Board, Requests | exists, email fix in 1 |
| Social setup and approvals | `/social` | read-only status | exists |
| Social failure notices | bell, email | none | 1c or 2 |
| Pause Social on lapse | none | none | 1c or 2 |
| Paid Ads | display only | generic row | deferred |
| Requests, quotes, pay | `/requests` | Requests | exists, acknowledgement in 1 |
| Return to link after sign in | yes | none | 1 |
| Reports | `/reports` | Reports review | exists, timer to enable |
| Team invites | Settings, Team | People | fix in 1 |
| Failed renewal and card change | Billing, email | Today row | 1 |
| Refund | refund email | Payments | 1 |
| Cancel service, close account, restore | Billing, Settings | Compliance, Leaving | exists, erase fix in 1 |
| Privacy requests, breaches | Settings, Privacy | Compliance, Today row | 2 |
| One staff account protection | none | Cloudflare Access, confirm dialogs | 1 |
| UI patterns, Home cards, console redesign | Release 2 | Release 2 | 2 |
