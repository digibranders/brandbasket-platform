# Staff console redesign (Centre stage) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every staff console screen (`apps/admin`) to direction C, "Centre stage", keeping every existing
feature working exactly as it does today.

**Architecture:**
- Pure, tested modules in `apps/admin/lib/` decide stages, attention items, map positions and avatar colours.
- Small presentational components in `apps/admin/components/console/` draw them.
- Pages keep their data loading and server actions; only their JSX changes.
- The shared `DashboardFrame` stays for the customer app.

**Tech stack:** Next.js 16 (app router, server components), React 19, Tailwind 4 (tokens in
`packages/shared/src/styles/theme.css`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-staff-console-redesign-design.md`

**House rules:**
- No commits unless the user asks.
- No AI-slop looks: no gradient blobs, no emoji, no uppercase eyebrows, no stat-card grids, no helper paragraphs
  on main screens.
- Every step keeps `lint`, `typecheck` and `test` green.

---

## Inventory: every existing feature and where it lands

| Today | New home | Behaviour change |
| --- | --- | --- |
| Overview: stat cards, flagged payments, waiting on us, new leads | Journey (`/`): map, "need you" focus strip | None. The same data sources |
| Top-bar lead search (`/leads?q=`) | Top-right glass pill, plus a search field on `/leads` | None |
| Add lead (`/leads/new`, `NewLeadForm`) | Dock "+ Lead" and the same page, restyled | None |
| Leads list: status filter, sort, search, table | Filter pills, hairline rows | None |
| Lead page: facts, attached note, message, update form, send setup link, attach account, View client | Header with journey dots, next action, sections | None |
| Clients list: stat cards, table | Stage filter pills (new `?stage=`), hairline rows | Adds a filter |
| Client page: 3 notices, attention block (mark as sorted), Owner, Build (send preview, mark live), Setup progress, Billing (manual payment), Business details, Hours, Services, Domain, Their website (URL, token), Notes, Logo and photos | Header, stage track, notices, attention, next action, hairline sections in the same order | None |
| Referrals: list, stat cards; New code; code page (figures, agreement, retire, delete, who used it) | Hairline rows, restyled forms and sections | None |
| Dev outbox: list and message (plain text and sandboxed HTML) | Dock item "Outbox", hairline list, message page | None |
| Login (`AuthScreen`, not-staff state) | Admin's own cream sign-in screen with a journey curve | None |
| `error.tsx`, `not-found.tsx`, `[...missing]` | Admin's own restyled pages | None |

## File map

**Create:**
- `apps/admin/lib/avatar.ts` and `avatar.test.ts`: initials and a deterministic palette colour.
- `apps/admin/lib/pipeline.ts` and `pipeline.test.ts`: the stage of each client and lead, grouping, attention items.
- `apps/admin/lib/journey-layout.ts` and `journey-layout.test.ts`: `pathY`, `pathD`, `placeBand`.
- `apps/admin/app/console.css`: glass surfaces, keyframes, reduced motion, form-field look.
- `apps/admin/components/console/` (one purpose per file):
  - `avatar.tsx`
  - `hover-card.tsx`
  - `journey-map.tsx`
  - `journey-rows.tsx`
  - `focus-mode.tsx` (client)
  - `staff-shell.tsx`
  - `dock.tsx` (client)
  - `top-pill.tsx` (client, account menu)
  - `page-header.tsx`
  - `hairline-list.tsx`
  - `status-dot.tsx`
  - `filter-pills.tsx`
  - `section.tsx`
  - `stage-track.tsx`
  - `notice.tsx`
  - `buttons.ts`
  - `field-styles.ts`
  - `not-found-view.tsx`
  - `back-link.tsx`

**Modify:** `packages/shared/src/styles/theme.css` (3 additive tokens); `apps/admin/app/layout.tsx` (import
`console.css`); every page under `apps/admin/app/`; `components/new-lead-form.tsx`,
`components/referral-code-form.tsx`, `components/payments-needing-attention.tsx` and
`components/received-date-input.tsx` (classes only).

**Delete once unused:** `components/admin-shell.tsx`, `components/lead-status-badge.tsx`,
`components/client-payment-summary.tsx`.

---

### Task 1: Tokens and console stylesheet

**Files:**
- Modify: `packages/shared/src/styles/theme.css` (inside the first `@theme` block, after `--color-highlight-soft`)
- Create: `apps/admin/app/console.css`
- Modify: `apps/admin/app/layout.tsx`

- [ ] Add the tokens:
  ```css
  /* Gold, for the staff console's primary actions and attention rings. Unused by the customer app. */
  --color-gold: #f2c572;
  --color-gold-deep: #e6a93d;
  --color-gold-ink: #6e4300;
  ```
- [ ] Create `console.css` with:
  - `.glass`: ink at 72%, an 18px blur with saturate 1.3, a 1px white/14% border, and a solid ink/92% fallback
    under `@supports not (backdrop-filter: …)`;
  - the `console-rise` and `console-fade` keyframes;
  - `.journey-dim` rules;
  - a `@media (prefers-reduced-motion: reduce)` block that switches every console animation and transition off.
- [ ] Import it in `app/layout.tsx`: `import "./console.css";`
- [ ] Run `pnpm --filter admin typecheck`. Expected: pass.

### Task 2: `avatar.ts` (TDD)

- [ ] Write the tests: `initials` delegates to the shared `initialsOf`; `avatarTone(id)` is stable for the same
  id, returns one of the 8 tones, and spreads 50 uuids over at least 5 tones.
- [ ] Run them and confirm they fail. Implement an FNV-1a hash of the id, modulo 8, as an index into `AVATAR_TONES`
  (8 muted hex pairs `{ bg, fg }`). Run them again and confirm they pass.

### Task 3: `pipeline.ts` (TDD)

```ts
export type JourneyStage = "lead" | "setup" | "building" | "preview" | "live";
export const JOURNEY_STAGES: readonly JourneyStage[];
export const JOURNEY_STAGE_LABELS: Readonly<Record<JourneyStage, string>>;
export function clientStage(client: Pick<ClientSummary, "project">): JourneyStage | "paused";
export function isLeadInPipeline(lead: Pick<Lead, "status">): boolean; // new…invite_sent
export type AttentionKind = "payment" | "overdue" | "due" | "new-lead";
export interface AttentionItem { kind; id; href; name; reason; dueAt: Date | null }
export function attentionItems(input: { flagged; waiting; newLeads; now }): AttentionItem[];
```

- [ ] Write the tests:
  - each project status maps to the right stage (a client with no project is `setup`; `on_hold` and `cancelled`
    are `paused`);
  - each lead status gives the right yes or no for the pipeline;
  - attention items are ordered payment, then overdue (most late first), then due (soonest first), then new leads
    (newest first);
  - a business with both a flagged payment and an overdue preview produces two items;
  - waiting entries without a due date are left out ("submitted" with no SLA is shown on the map, not in the
    strip).
- [ ] Run them and confirm they fail. Implement, reusing `PAYMENT_ATTENTION_LABELS[reason].title` for payment
  reasons, "Preview N days late" and "Preview due", and `LEAD_STATUS_LABELS.new`. Run them again and confirm they
  pass.

### Task 4: `journey-layout.ts` (TDD)

```ts
export const BAND_CAPACITY = 6;
export function pathY(x: number): number;        // x∈[0,1] → y∈[0.28,0.72], smooth, one wave per two bands
export function pathD(width: number, height: number, steps?: number): string; // SVG path sampled from pathY
export interface Placed<T> { item: T; leftPct: number; topPct: number }
export function placeBand<T>(items: readonly T[], band: number, bands: number, capacity?: number):
  { placed: Placed<T>[]; overflow: number; overflowAt: { leftPct: number; topPct: number } | null };
```

- [ ] Write the tests:
  - `pathY` stays within [0.28, 0.72] for 101 samples;
  - `placeBand` places at most `capacity` items, reserving the last place for "+N" when it overflows;
  - positions stay inside the band's horizontal slice, with 8% padding on each side;
  - `topPct` equals `pathY(leftPct / 100) × 100`;
  - input order is kept (the caller sorts attention first).
- [ ] Run them and confirm they fail. Implement: `pathY(x) = 0.5 + 0.2 * Math.sin(x * Math.PI * 2.5 + 0.6)`. Run
  them again and confirm they pass.

### Task 5: Console primitives

- [ ] `buttons.ts`: `buttonPrimary` (an ink pill with paper text that shifts to accent on hover and lifts 2px),
  `buttonSecondary` (a hairline ring), `buttonGold` (for glass), `buttonDanger` (an accent ring). All are sentence
  case, `text-sm font-semibold`, no uppercase.
- [ ] `field-styles.ts`: `fieldClasses` (the card background, hairline border, rounded 2xl and an accent focus
  ring), `labelClasses`, `hintClasses`.
- [ ] `avatar.tsx`:
  - props `{ id, name, size: "sm" | "md" | "lg", ring?: "late" | "money" | null }`;
  - `aria-hidden`, because the name is always printed next to it or given by an `aria-label` on the link.
- [ ] `status-dot.tsx`: `{ tone: "live" | "active" | "waiting" | "late" | "money" | "quiet", label }`.
- [ ] `page-header.tsx`: a Newsreader h1 with an italic emphasis slot, optional `action` and `back` link.
- [ ] `hairline-list.tsx`:
  - `HairlineList` is a `ul`;
  - `HairlineRow` is a `li` holding a `Link` grid with slots `lead`, `title`, `sub`, `meta`, `trail`;
  - its hover state is a faint ink wash plus `translate-x-1`.
- [ ] `filter-pills.tsx`: `{ label, options: { href, label, count?, current }[] }`, rendered as a `nav` with
  `aria-current`.
- [ ] `section.tsx`: a hairline-topped section with a Newsreader 22px title and an optional `aside`; plus
  `FactList`, which renders two-column `dl` rows.
- [ ] `stage-track.tsx`: `StageTrack` (full, labelled) and `MiniTrack` (five dots), both driven by `JourneyStage`
  or `paused`.
- [ ] `notice.tsx`: a `role="status"` line with a tone of `ok` or `problem`, and no box: a coloured dot and text.
- [ ] `back-link.tsx`: a chevron-left link, `text-sm text-ink-soft`.

### Task 6: Frame

- [ ] `dock.tsx` (client, uses `usePathname`):
  - items Journey (`/`), Leads (`/leads`), Clients (`/clients`), Referrals (`/referrals`), Outbox (`/outbox`),
    then a gold "+ Lead" (`/leads/new`);
  - the active item is the longest matching prefix;
  - it carries a `needsYou: boolean` badge dot on Journey;
  - `nav aria-label="Staff console"`.
- [ ] `top-pill.tsx` (client):
  - a search `form` (GET `/leads`, input `q`), collapsing to an icon link to `/leads` below `sm`;
  - an avatar button that opens a menu showing the name, the email and Sign out (a `form` posting the `signOut`
    action);
  - the menu closes on Esc and on an outside click;
  - the button has `aria-expanded`.
- [ ] `staff-shell.tsx`: the logo top-left, the top pill top-right, `main#main` with `pb-40`, and the dock. It is
  a server component that works out `needsYou` itself (flagged count + overdue count > 0) using the staff DB.
- [ ] Swap `AdminShell` for `StaffShell` in `app/(protected)/layout.tsx`, then delete `components/admin-shell.tsx`.

### Task 7: Journey (`/`)

- [ ] `hover-card.tsx`:
  - a glass card, absolutely positioned;
  - shown by `group-hover` and `group-focus-visible` (CSS only);
  - it flips side with a `side` prop and flips vertically with `below`;
  - it contains the name, the stage label, the reason and "Open ›" text.
- [ ] `journey-map.tsx` (server):
  - five bands, each with its label and count;
  - the path SVG from `pathD`;
  - the avatars placed by `placeBand`, each a `Link` with an `aria-label` of "Name, stage, reason";
  - a "+N" bubble linking to the stage list;
  - attention avatars carry `data-attention`.
- [ ] `journey-rows.tsx`: the phone layout (`md:hidden`); the map is `hidden md:block`.
- [ ] `focus-mode.tsx` (client):
  - a toggle button showing "N / need you";
  - it sets `data-focus` on its wrapper, and the CSS dims `[data-focus] [data-attention="false"]`;
  - it renders the attention strip (a glass pill list above the dock) only when on;
  - Esc exits.
- [ ] Rewrite `app/(protected)/page.tsx`:
  - load the same data as today, plus `listLeads(db, {})`;
  - greeting: "Hello, *First name.*";
  - on the right, the focus toggle and the paying count;
  - then the map, the rows and the "Paused · N" link.

### Task 8: Leads

- [ ] `leads/page.tsx`:
  - a `PageHeader` with an "Add lead" primary button;
  - a search form (`q`, preserving `status` and `sort`);
  - `FilterPills` for All plus each status with its count;
  - a sort link;
  - "Showing matches…" as a `Notice` with Clear;
  - `HairlineList` rows: avatar, business name, contact name and phone, a status dot, the received time
    (`LocalDateTime`), a chevron;
  - an empty state of one line.
- [ ] `leads/[leadId]/page.tsx`:
  - back link, header (avatar, name, "View client" when attached), and the `MiniTrack` for lead or setup;
  - a `FactList` of the seven facts;
  - the attached note, then "Their message" as a section;
  - the update form as a section with `fieldClasses`;
  - send setup link and attach account as sections with their buttons.
- [ ] `leads/new/page.tsx` + `new-lead-form.tsx`: use `fieldClasses` and `buttonPrimary`, a back link and a
  `PageHeader`.

### Task 9: Clients

- [ ] `clients/page.tsx`:
  - `?stage=` parsed against `JOURNEY_STAGES` plus `paused`;
  - `FilterPills` with counts;
  - rows with an avatar (ringed if it needs attention), name, owner, currency, `MiniTrack`, a payment status dot
    from `clientPaymentState`, and a chevron.
- [ ] `clients/[businessId]/page.tsx`:
  - the same data and helpers;
  - a header with the avatar, name, owner line and `StageTrack`;
  - the notices as `Notice`s;
  - attention as an accent-ringed section using `PaymentsNeedingAttention` (restyled);
  - a "Next step" section holding `SendPreviewForm` or `MarkLiveForm` when it applies;
  - then the sections in today's order, with `Facts` swapped for `FactList`;
  - photos as a grid without borders;
  - all five forms kept, with `fieldClasses` and the button constants.
- [ ] `payments-needing-attention.tsx` and `received-date-input.tsx`: apply the button and field constants.
- [ ] Delete `client-payment-summary.tsx` and `lead-status-badge.tsx` once nothing imports them.

### Task 10: Referrals

- [ ] `referrals/page.tsx`: a header with "New code"; three big numbers in a row (Codes, Usable now, Customers
  referred) with no cards; hairline rows showing the code, its retired label, the discount, the referrer, the
  referrer's share, redemptions and the created date.
- [ ] `referrals/new/page.tsx`, `referrals/[codeId]/page.tsx` and `referral-code-form.tsx`: figures as big numbers
  (the referrer's share in accent), "The agreement" and "What you can change" as sections, delete as a sub-section,
  "Who used it" as a hairline list; forms get `fieldClasses` and the button constants.

### Task 11: Outbox, login, errors

- [ ] `outbox/page.tsx`: a header and hairline rows (subject, recipient, time).
- [ ] `outbox/[emailId]/page.tsx`: back link, header, meta line, a "Plain text" section (`pre` on paper-deep,
  no border) and an "HTML" section (a sandboxed iframe, rounded, hairline).
- [ ] `login/page.tsx`: the admin's own layout: logo top-left, a faint `pathD` curve behind, a centred Newsreader
  title, and the shared `SignInForm` with no card. The not-staff state uses the shared `SignOutButton`.
- [ ] `error.tsx`, `not-found.tsx` and `[...missing]/page.tsx`: `not-found-view.tsx` with the logo, "Nothing
  *here.*" and a link back to Journey; `error.tsx` restyled with the button constants.

### Task 12: Verify

- [ ] Run `pnpm --filter admin lint`, `pnpm --filter admin typecheck`, `pnpm --filter admin test` and
  `pnpm --filter admin build`. All must pass.
- [ ] Run `pnpm --filter @brandbasket/shared test`, and typecheck the platform (for the theme token change). Both
  must pass.
- [ ] Browser: start `fynix-admin-dev`, sign in with a local staff account and visit every route. Screenshot
  each at 1440px and at 390px: Journey, Journey focus mode, a crowded band, Leads, a lead, add lead, Clients, a
  client (each status), Referrals, a code, a new code, Outbox, a message, login, and the 404 page.
- [ ] Keyboard: tab through the dock, the avatars (their hover cards must show), the focus toggle (Esc exits) and
  the account menu (Esc closes).
