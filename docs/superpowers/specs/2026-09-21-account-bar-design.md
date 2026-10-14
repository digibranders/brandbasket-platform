# Sidebar account bar — design

**Date:** 2026-09-21
**Status:** implemented 2026-09-21
**Surfaces:** customer dashboard (`app-host`) and staff console (`admin-host`), via the shared `DashboardFrame`

## What this replaces

The sidebar footer currently renders two things stacked: an `AccountChip` (avatar, name,
detail line, chevron, linking to `/settings`) and a `SignOutButton` below it. On mobile the
sign-out button is duplicated into the sidebar header, and the account block is hidden
entirely (`hidden … lg:block`).

This replaces both with a single compact bar.

## The bar

One row at the bottom of the sidebar:

```
┌────────────────────────────────────────┐
│  (CC)  Curry Cook          ···    🔔•  │
└────────────────────────────────────────┘
```

- **Avatar** — initials, from `initialsOf(account.name)`, as today.
- **Name** — `account.name`, truncated. The secondary detail line is dropped; it moves into
  the `···` menu header, which has room for both name and business.
- **`···` button** — opens the account menu.
- **Bell** — opens the notices panel. Carries a dot when any notice is actionable.

Built once in `components/panel/dashboard-frame.tsx` so both surfaces get it. The existing
`variant` prop (`"light"` cream for customers, `"dark"` burgundy for staff) continues to
drive colour; no new theming concept is introduced.

**Mobile:** the bar moves into the sidebar header row, replacing the duplicated
`SignOutButton` there. Sign-out lives only in the `···` menu from now on, on every viewport.

## The `···` menu

In order:

| Item | Destination |
|---|---|
| Settings | A gear in the menu's header, to `/settings`. Omitted when `account.href` is undefined, which is how the staff console opts out |
| Feedback | `mailto:` to `siteConfig.email`, subject "Feedback on Fynix" |
| Home page | The business's own live website. Hidden until it launches |
| Changelog | `/changelog`, a hand-kept list of what changed for the customer. Customer surface only |
| Help | `mailto:` to `siteConfig.email`, subject "Help with my website" |
| Log out | Existing `SignOutButton` behaviour, moved inside |
| Docs | The marketing site's `/faq`, which is a separate app |

Because Settings now has a place in this menu, its sidebar nav entry was removed — it was the
same destination twice.

**Help is a stopgap.** Since customer content editing was retired on 2026-09-21, every
website change is a staff support request, and there is no in-app way to make one. A real
change-request feature — form, staff inbox, email, tied to change-hour pricing — is the
proper answer and is out of scope here. This `mailto:` is explicitly a placeholder for it.

### Contact email defect — fixed

`packages/shared/src/lib/site-config.ts` fell back to `hello@fynix.digital` when
`NEXT_PUBLIC_CONTACT_EMAIL` was unset. Fynix is a separate brand from Fynix, and the
address was already reaching customers on Settings, Project, Billing and Onboarding, not just
in this menu.

Changed to `hello@fynix.digital`, which is what the marketing site's own copy of this file
has always used — the platform had simply drifted. One line fixes every page that reads
`businessDetails.email`.

The two repos' `businessDetails` still differ in shape (the website carries `legalName` and a
structured `postalAddress`; the platform carries `gstNumber` and `phone`). Left alone: that is
a separate question from the address being wrong.

## The bell

No notification table, no read/unread state, no new schema. The panel derives its list on
each request from state the dashboard already computes.

### Sources

- `getBillingBanner()` → `BillingBannerModel | null`, kinds `pay` | `contact` | `notice`
- `getProjectOverview()` → project status, one of `onboarding`, `submitted`, `building`,
  `preview`, `revisions`, `approved`, `live`, `on_hold`, `cancelled`
- `nextStep()` → whether onboarding is unstarted or incomplete

### Notices

**Actionable — the customer must do something. These light the dot.**

| Condition | Text | Links to |
|---|---|---|
| banner kind `pay` | Payment due | `PAYMENT_STEP_HREF` — the first payment is made at the end of setup ("Pay and send"), not on the billing page |
| banner kind `contact` | Your plan has ended | `/billing` |
| status `preview` | Your preview is ready to review | `/project` |
| next step is start/continue onboarding | Finish setting up your website | `/onboarding` |

**Informational — we are doing something. Listed, but no dot.**

| Condition | Text |
|---|---|
| status `building` or `submitted` | We're building your website |
| status `revisions` | We're making your changes |
| status `on_hold` | Your build is paused |
| banner kind `notice` | Payment received |

Empty state: "Nothing needs you right now."

The staff console has no equivalent per-business state, so on `admin-host` the bell is not
rendered. The bar degrades to avatar, name and `···`.

### Why derived, not stored

Every notice above is a *current state*, not an event — it is true for as long as the
condition holds and false afterwards. Storing and marking these read would let the dot
disappear while the payment is still due. Deriving them means the dot is always honest.

The cost is that notices cannot be dismissed individually, which is correct for this set:
none of them should be dismissable while still true.

## Components

| File | Responsibility |
|---|---|
| `components/panel/account-bar.tsx` | The row and both popovers, sharing one `usePopover` hook. Client component |
| `lib/account-panel.ts` | Pure: notice mapping, actionable count, status line. Holds the `AccountPanel` type so the client component can import it without pulling in a server-only module |
| `lib/server/account-panel.ts` | Loads the inputs and assembles the panel. Server-only, `cache()`d |
| `app/app-host/(protected)/changelog/page.tsx` | The changelog list |
| `packages/shared/src/ui/icons.tsx` | Adds `BellIcon`, `EllipsisIcon`, `SmileIcon`, `BookIcon`, `PencilIcon`, `LifebuoyIcon` |

Both popovers are anchored to the bar (`inset-x-0`), not to the small icon button that opens
them — neither trigger's wrapper is positioned. Anchored to the button, a 17.5rem panel spilled
out of the 16rem sidebar and over the page. The sidebar also carries `relative z-20` so an open
menu paints above the main region, which is its own stacking context.

`dashboard-frame.tsx` swaps its footer block for `<AccountBar />` and stops rendering the
standalone `SignOutButton` in both the footer and the mobile header.

`AccountChip` is deleted rather than left unused.

## Accessibility

Both popovers are real menus, not hover cards:

- Trigger is a `<button>` with `aria-haspopup="menu"` and `aria-expanded`
- Open on click; close on Escape, outside click, and selection
- Focus moves into the popover on open and returns to the trigger on close
- Arrow keys move between items
- The bell's trigger carries an `aria-label` that includes the count, so a screen reader
  hears "Notices, 2 need you" rather than only seeing a coloured dot
- The dot is never the sole indicator — the label carries the same information

## Testing

`lib/account-panel.test.ts` covers the pure mapping: every project status and banner kind, the
empty case, the actionable/informational split, and that unfinished setup stops being chased
once the build starts. The payment notice asserts against `PAYMENT_STEP_HREF` rather than a
literal path, so it stays correct if that step moves.

The bar itself is verified by looking at it, on both variants and both viewports — there is no
logic in it worth a test that rendering does not already prove.

## Out of scope

- A real change-request feature (Help's eventual destination)
- A notification table with read state
- Changelog and Docs pages
- Any change to the sidebar's nav items
