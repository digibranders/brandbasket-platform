# Staff console redesign — design

Date: 2026-09-25 · App: `apps/admin` · Branch: `feat/staff-console-redesign` (from `development` at f57c6c3)

## Goal

Give the staff console a new look: direction **C, "Centre stage"**, chosen from three clickable prototypes.

- The home screen is a **journey map**: every client is an avatar placed along a path from lead to live.
- Clients that need attention wear a ring.
- Navigation lives in a floating **glass dock**, like the marketing site's glass navbar.
- Screens separate content with whitespace and hairlines, not bordered cards. They show state visually, not in
  paragraphs.

This is a presentation change. Authentication, access checks, server actions, queries and business rules stay
exactly as they are.

## Decisions

| Decision | Choice |
| --- | --- |
| Direction | C · Centre stage: cream ground, journey map, dark glass dock and hover cards |
| Clicking a client | Opens their full page. No slide-over drawer, which would duplicate the page's five forms |
| Hover card actions | Only **Open**. Real actions (Send preview needs a URL; Mark live needs confirmation) stay on the client page |
| Crowding | Each stage shows a fixed number of avatars; the rest fold into a "+N" bubble. Anyone needing attention always gets a place |
| Phones | The map becomes vertical stage rows; the dock stays at the bottom |
| Revenue figures and chart | Deferred to the Money phase (they need new queries). Home shows **paying clients** instead |
| Money page | Deferred, a separate spec |
| Change requests | Not in the dock until the feature exists (plan in PR #14) |
| Customer dashboard | Untouched. The shared `DashboardFrame` stays for `apps/platform` |

## Visual system

- **Ground:** cream paper (`paper`, #f6efe6) on every page, with the existing paper-grain overlay.
- **Glass:** the dock, the top-right pill, hover cards and menus are dark glass:
  - background ink `#2a0d10` at about 72% (90% where `backdrop-filter` is unsupported);
  - 18px backdrop blur with saturate 1.3;
  - a 1px border in white at 14%;
  - paper text.
- **Colour tokens:** add three tokens to `packages/shared/src/styles/theme.css`, all additive and unused by the
  customer app today:
  - `--color-gold: #f2c572`: primary buttons, the active dock item's badge, the hover card's action;
  - `--color-gold-deep: #e6a93d`: the payment attention ring;
  - `--color-gold-ink: #6e4300`: gold-family text on cream.
- **Attention rings:** burgundy (`accent`) for late or overdue work, gold-deep for money, each with a tiny label
  under the avatar ("2 days late", "Payment").
- **Type:** Newsreader for headings and big numbers (regular weight, tight tracking, italic burgundy emphasis);
  Hanken Grotesk for everything else. Labels are sentence case — no uppercase kickers, per the brand rules.
- **Separation:** hairlines in `line` (#e2d2c1) on cream; dashed hairlines divide the stages on the map.
- **Buttons:** pill. Ink with paper text for the one primary action on a cream screen; gold inside glass.
- **Focus:** 2px `accent` outline on cream and 2px gold inside glass, 3px offset.
- **Motion:** 300–600ms `ease-calm`:
  - avatars fade up in a short stagger on load;
  - avatars scale up 1.15 on hover;
  - dock items lift 3px on hover;
  - the hover card fades and slides 6px.

  All of it is disabled under `prefers-reduced-motion`.
- **Avatars:** initials on one of eight muted colours, picked deterministically from the business or lead id, so
  a client keeps its colour on every screen.

## Screens

### 1. Frame (`StaffShell`, replaces `AdminShell`)

- **Dock**, a glass bar fixed at the bottom centre. Its items, each an icon with a small label:
  **Journey · Leads · Clients · Referrals · Outbox**, then a gold **Add lead**. The outbox is the only place to
  read the emails the platform writes until email delivery ships, so it stays one tap away.
  - The active item is a paper tile with ink text.
  - A small gold dot sits on Journey when anything needs attention.
- **Top-right glass pill:** search (it searches leads, `/leads?q=`, as the current top-bar search does) and the
  avatar menu (name, email, Sign out).
- **Top-left:** the logo, in ink on cream.
- **Layout:**
  - Page content scrolls, with 140px of bottom padding so the dock never covers the last row.
  - Pages are left-aligned, up to 1280px wide, with 48px side padding.
- **Phones (< 768px):**
  - The dock spans the full width at the bottom, with icons only plus labels at 10px.
  - The top-right pill shrinks to a search icon and the avatar.

### 2. Journey (`/`, replaces Overview)

1. **Header.** "Hello, *Siddique.*" (same wording as today) on the left. On the right, two big numbers:
   - **Need you:** a burgundy count. Clicking it toggles focus mode (see 5).
   - **Paying:** `countPayingClients`.
2. **Map**: five stage bands of equal width across the page, about 470px tall.
   - Each band has its count and label at the top-left, and a dashed divider between bands.
   - A dotted curved path runs through all five bands.
   - Stage mapping:
     - **Leads:** leads whose status is `new`, `call_booked`, `call_done`, `agreed` or `invite_sent`. Leads with
       a status of `lost`, `account_created` or `paid` are excluded: lost leads are gone, and the others already
       appear as clients.
     - **Setting up:** clients whose project is `onboarding`, or who have no project yet.
     - **Building:** `submitted`, `building`.
     - **Preview:** `preview`, `revisions`, `approved`.
     - **Live:** `live`.
   - `on_hold` and `cancelled` clients appear as a small "Paused · N" link under the map, not as a stage.
3. **Placing avatars.**
   - The path is one pure function, `pathY(x)`: a gentle climb from Leads up to Live with a soft wave. The SVG
     path and the avatar positions both come from it.
   - A lone avatar sits on the line; several alternate just above and below it (`ZIGZAG`), so six fit a band
     without overlapping.
   - Within a band, up to **6** avatars (`BAND_CAPACITY`) are spaced evenly along the band's slice of the path.
   - Attention items take the first places, then the most recent activity.
   - If a band has more than 6, the last place becomes a "+N" bubble linking to that stage's filtered list
     (`/clients?stage=` or `/leads`).
   - Avatars are positioned in percentages, so the map scales with the viewport.
4. **Hover card**, a glass card shown when an avatar is hovered or focused:
   - the name;
   - the stage label (`PROJECT_STATUS_LABELS` or the lead status label);
   - the reason or next date ("Preview due 27 Sep", "Payment to sort");
   - an "Open ›" hint.

   The card sits to the right of the avatar, or to the left in the Live band, and opens upwards for avatars low
   on the map. It is pure CSS with no controls of its own: the avatar is the link, and clicking it opens the
   client or lead page.
5. **Focus mode.** Clicking "Need you" dims every avatar that doesn't need attention to 25% and lists the
   attention items in a glass strip above the dock: avatar, name and reason, most urgent first. The strip
   scrolls sideways when there are more than fit, and each link opens that client or lead. Clicking the count again or pressing Esc exits.
   - Attention items, most urgent first:
     1. **Payment to sort:** from `listPaymentsNeedingAttention`.
     2. **Preview overdue:** from `clientsWaitingOnUs`, overdue entries only.
     3. **Waiting on us:** also from `clientsWaitingOnUs`, entries with a due date that is not overdue.
     4. **New lead:** leads with status `new`.
   - When nothing needs attention, the count reads 0 and the dock's Journey dot is hidden.
6. **Phones.** The map is replaced by five stage rows stacked vertically: label and count, then a horizontally
   scrollable row of avatars with their rings. Tapping an avatar opens the page, and the hover card is skipped.

### 3. Leads (`/leads`)

- Header: "Leads" plus an ink **+ Lead** button.
- Status filter as a pill group, one pill per status with its count; this replaces the six stat cards. The
  sort toggle (newest/oldest) stays.
- Rows separated by hairlines: avatar · business name over contact name and phone · status dot and label ·
  relative time · chevron.
  - The whole row is a link.
  - On hover, the row gets a faint ink wash and nudges right.
- Empty state: a single line.

### 4. Lead page (`/leads/[leadId]`)

- Top: avatar, business name, contact line, the lead's five-dot journey position, and the **next action** as the
  ink button: Send setup link or Attach account, whichever the page offers today.
- Below, hairline-separated sections: their message; lead details (the existing update form); setup link;
  attach account.
- Forms keep their current fields, actions and validation, restyled: card-colour fields with hairline borders and
  an accent focus ring.

### 5. Clients (`/clients`)

- Header: "Clients".
- Stage filter pills: All · Setting up · Building · Preview · Live · Paused, grouped the same way as the map.
  The filter is a new `?stage=` search param; the page reads all clients once, as today.
- Rows: avatar with its ring if it needs attention · business name over owner name and currency · a mini
  five-dot stage track · a billing status dot (paid, unpaid, or needs attention) · chevron.

### 6. Client page (`/clients/[businessId]`)

- **Header:** avatar, business name, owner line, then the five-stage track with the current stage in gold.
- **Needs attention:** the existing attention block, restyled as a ringed line with its action.
- **Next action**, as the ink button, chosen by project status: **Send preview** for `building`, **Mark live**
  for `approved`. Every other status has no primary button. Those two existing forms move up under the header.
- **Sections**, hairline-separated and in today's order: Owner, Build, Setup progress, Billing, Business details,
  Opening hours, Services, Domain, Their website, Notes for the builder, Logo and photos.
  - Each section title is Newsreader 22px.
  - Contents use two-column label/value rows.
  - Photos show as a plain thumbnail grid.
- The page's five forms keep their actions, fields and validation: rotate site API token, set website URL, record
  manual payment, send preview, mark live.

### 7. Referrals (`/referrals`, `/referrals/new`, `/referrals/[codeId]`)

- **List:** hairline rows showing the code, the discount and reward, the use count and a status dot. An ink
  **+ Code** button sits in the header.
- **Form and detail:** the existing `ReferralCodeForm` restyled. No field or behaviour changes.

### 8. Sign in (`/login`)

Cream page with the logo and a centred sign-in form, with a faint dotted journey curve behind it as the one
decorative element. Reuse the shared `SignInForm` logic; restyle only. There is no dock on this page.

### 9. Dev outbox, not found and error pages

Restyle to the cream frame: hairline list and a plain message. No behaviour change.

## Architecture

- New admin-local components in `apps/admin/components/console/`. Each file does one thing:
  - **Frame:** `staff-shell.tsx`, `dock.tsx`, `top-pill.tsx` (search and account menu)
  - **Avatars:** `avatar.tsx` (initials, deterministic colour, attention ring and label), `hover-card.tsx`
  - **Journey:** `journey-map.tsx` (bands, path SVG, placed avatars), `journey-rows.tsx` (the phone layout),
    `focus-strip.tsx`
  - **Pages:** `stage-track.tsx` (full and mini), `page-header.tsx`, `hairline-list.tsx` (list and row),
    `status-dot.tsx`, `filter-pills.tsx`, `section.tsx`
  - **Forms:** `field-styles.ts`, exported Tailwind class strings for inputs, selects, textareas and labels,
    applied to the existing native form elements
- The map is a server component; only the hover card and focus mode run as small client components. Positions
  are computed on the server.
- **Pure logic, unit-tested with Vitest:**
  - `apps/admin/lib/pipeline.ts`:
    - `pipelineStage(client)` and `leadInPipeline(lead)`;
    - `groupPipeline(clients, leads)`;
    - `attentionItems(flagged, waiting, newLeads, now)`, which returns the ordered list.
  - `apps/admin/lib/journey-layout.ts`:
    - `pathY(x)`;
    - `placeBand(items, bandIndex, capacity)`, which returns the visible avatars with `{ leftPct, topPct }` plus
      an overflow count.
  - `apps/admin/lib/avatar.ts`: `initials(name)`, `avatarColour(id)`.
- Pages keep their data loading and server actions. Only their JSX moves onto the new components.
- `AdminShell` and the admin's use of the shared `DashboardFrame`, `StatCard` and `SidebarNav` are removed.
  Those shared components stay, because the customer app uses them.
- Search params on `/leads` stay compatible, so existing links keep working. `/clients?stage=` is additive.

## Error handling and empty states

- Existing `error.tsx` and not-found pages are restyled, with the same behaviour.
- **An empty map** still draws the bands and the path, with counts of 0 and no avatars. The header reads
  "0 need you".
- **Other empty states:** one short line in secondary text, never an illustration or paragraph. Examples: "No
  leads yet." and "Nothing needs you."
- A client with no owner, project or billing renders as it does now, with em dashes, not errors.

## Testing and verification

- **Unit tests**, covering:
  - every project and lead status landing in the right stage, plus Paused and excluded statuses;
  - attention ordering and the 8-item cap;
  - `placeBand`: attention items first, capacity and "+N" overflow, positions staying inside the band, and
    `pathY` staying within bounds;
  - deterministic avatar colour.
- Existing admin tests stay green. No server action changes, so their tests are untouched.
- **Checks:** `pnpm --filter admin lint`, `typecheck`, `test` and `build`.
- **Browser verification:**
  - Run the admin dev server (`fynix-admin-dev`) against the local database.
  - Screenshot every page at 1440px and 390px, including an empty map, a crowded band (more than 6) and focus
    mode.
  - Check keyboard focus order: tabbing through the avatars must show their hover cards, and Esc must leave focus
    mode.
  - Check contrast inside the glass surfaces.

## Out of scope

- The Money page, revenue figures and the revenue chart (next spec, with the new read-only queries).
- Change requests (PR #14 plan).
- The customer dashboard (`apps/platform`).
- Any schema, query, action or permission change.
- Actions inside hover cards.
- A slide-over client drawer.
