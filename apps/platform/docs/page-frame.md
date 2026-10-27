# The page frame

Every signed-in page sits in one frame, so the left edge, the width, the header and the spacing are the same on every
screen. The pieces are in `components/v2/page.tsx`; the class strings they share are in `components/v2/classes.ts`.
Look at `components/overview/month-overview.tsx` (columns), `components/requests/requests-view.tsx` (one card with two
panes) and `components/calls/calls-view.tsx` (sections and an empty state) before migrating a page.

## What the frame decides

| Thing | Rule |
|---|---|
| Gutters | The shell (`app-shell.tsx`) gives the content area 24px on phones, 32px from md, 40px from xl. A page never adds its own side padding. |
| Width | `PageFrame` fills the content area and stops at 97.5rem (about 1560px). It sits on the left (`mr-auto`), never centred. |
| Header | `title` (the h1), one line `lede`, `action` buttons on the right, optional `tabs` under them. No hairline under the header. |
| Rhythm | `STACK` (`components/v2/classes.ts`): 24px between blocks on phones, 32px from md. Inside a block: 16px (a section's title to its rows), 8px (a title to its line). Do not invent other gaps between blocks. |
| Columns | `PageColumns`: a main column and a right aside (360px, 400px when the frame is 64rem or wider). Below 56rem of frame width the aside drops under the main column. Sticky from xl. |
| Cards | One raised card: `LIFT` (white, `rounded-lift`, `shadow-lift`, no border). Use it for the screen's task, or one panel that holds a list and its detail. Everything else is a hairline section (`PageSection`). |
| Empty | `EmptyState`. Never a bare grey line. |

The columns follow the width of the frame, not the window (they use container queries: `@4xl`, `@5xl`). The rail takes
232px, so a 1024px window leaves about 720px, which is one column. Use `@` variants inside the frame, not `lg:`, for
anything that depends on how much room the page has.

## The pieces

```
PageFrame    { title, lede?, action?, tabs?, width?: "page" | "form", children }
PageHeader   { title, lede?, action?, tabs? }            (PageFrame draws it; use it alone only inside another frame)
PageColumns  { main, aside | null }                      (null aside: the main column takes the full width)
PageSection  { id, title, aside?, flush?, className?, children }   (flush: the rows pad themselves)
EmptyState   { icon, title, text?, action?, compact? }
FactRows     { items: { label, value }[] }
ActionRow    { title?, text, action }
```

`width="form"` is for a page that is one form: a 40rem column, still on the left.

`EmptyState` has two looks. The default is the page's own empty state: a centred raised card with a small Phosphor icon,
a one-line title, one sentence on what will appear and when, and one action. `compact` is a left-aligned line inside a
section. Rules for the words: the title says what is empty; the sentence says what will appear and when; the one action
is the thing to do about it, and it is the screen's dark button (`DARK_BUTTON`) when it is the main task. Leave `action`
out when there is nothing to do. Icons come from `@phosphor-icons/react/dist/ssr`, regular weight.

`EmptyState` titles and sentences are copy: show new ones to the owner before they ship.

## A page on the frame

```tsx
export default async function BillingPage(): Promise<ReactElement> {
  const { tenant } = await requireBillingAccess();
  const data = await loadBilling(tenant);
  return (
    <PageFrame title="Billing" lede="Your plan and each month's bill." action={<Link href="/upgrade" className={SOFT_BUTTON}>Change plan</Link>}>
      <PageColumns
        main={<PageSection id="bills" title="Bills" flush>{data.bills.length === 0 ? <EmptyState compact icon={Receipt} title="No bills yet" /> : <BillList bills={data.bills} />}</PageSection>}
        aside={<PageSection id="plan" title="Your plan"><FactRows items={planFacts(data)} /></PageSection>}
      />
    </PageFrame>
  );
}
```

## Migrating a page

1. Delete the page's own wrapper (`mx-auto`, `max-w-*`, `grid gap-*`) and its own h1 block. Pass the title, line and
   actions to `PageFrame`.
2. Put the page's blocks inside as children. For a main column and things to read beside it, use `PageColumns`.
3. Turn every box into a hairline `PageSection`, except the one task card (`LIFT`).
4. Replace every "Nothing here yet" line with an `EmptyState` (`compact` inside a section).
5. A page that is one form: `width="form"`.
6. A page with tabs (Website): pass the tab bar as `tabs`. Its layout renders the frame, so the pages inside it do not.
7. Update the tests that look at the markup, and check the page at 1440, 1024 and 390 wide: no sideways scroll.

Pages outside the rail (sign-in, the payment hand-off under `billing/`, the affiliate portal) do not use the frame.
