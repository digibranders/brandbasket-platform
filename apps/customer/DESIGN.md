# apps/customer: design

The visual rules are plan 60, "Basket UI": `docs/customer-app-v4/60-customer-app-v4-design-system.md`. The approved mock is
`docs/customer-app-v4/mock/customer-app-v4-mock.html` (source in `mock/source/`, styles in `style.css`). Where this app and
the mock differ, the mock wins until plan 60 says otherwise. Change the system only by plan 60, section 18.

In code:

- Tokens: `src/styles/tokens.css`. Utilities: `bg-surface`, `text-ink-3`, `border-border-subtle`, `rounded-panel`,
  `shadow-pop`, `h-control`, `size-icon-button`, `max-w-page` and so on (`src/styles/globals.css`). Tailwind's own palette,
  radii, shadows and text sizes are removed.
- Type: only the `type-*` utilities (`type-title`, `type-section`, `type-sub`, `type-body`, `type-button`, `type-table`,
  `type-meta`, `type-label`, `type-metric`, `type-metric-sm`, `type-mono`, `type-kbd`). Geist and Geist Mono.
- Breakpoints: `sm` 521px, `md` 861px (desktop layout from here), `lg` 1101px. Controls are 44px on phones and 36px from
  `md` without extra classes: the size tokens change at the breakpoint.
- Motion: `motion-fade`, `motion-menu`, `motion-dialog`, `motion-sheet`, `motion-pulse`. Reduced motion turns all of it off.
- Primitives: `@/ui`, each with a test and an entry in `/design-system`. Icons only through `<Icon name="..." />`.
- Light theme only. No raw colours, no gradients, no shadows on resting elements beyond `shadow-button` and `shadow-primary`.
