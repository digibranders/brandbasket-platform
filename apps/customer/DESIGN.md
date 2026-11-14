# apps/customer: design

The visual rules are plan 60 ("Basket UI") updated for Release 2 by `docs/design/redesign/05-PREMIUM-DESIGN-LANGUAGE.md`. The customer app runs on the BrandBasket website brand: near-black primary buttons, rattan gold as the singular accent, warm paper ground, and Red Hat fonts. Light theme only. Where this app and the approved mocks differ, the mock wins.

In code:

- Tokens: `src/styles/tokens.css`. Utilities: `bg-surface`, `bg-canvas`, `text-ink`, `text-ink-2`, `text-ink-3`, `text-accent-text`, `border-border`, `rounded-panel`, `rounded-overlay`, `shadow-card`, `shadow-hero`, `shadow-dialog`, `h-control`, `size-icon-button`, `max-w-page` and so on (`src/styles/globals.css`). Tailwind's default palette, radii, shadows and text sizes are removed.
- Palette: paper `#F6F5F2`, surface `#FFFFFF`, sunken `#EEECE7`, line `#E3E0D9`, ink `#15161A`, ink-2 `#4E5057`, ink-3 `#5F626A`, rattan gold `#C48A47` (text `#A46C2F`, wash `#F4E6D3`, deep `#8A5524`), sage `#4F7A63` (wash `#E5EFE8`), error `#B42318`.
- Type: only the `type-*` utilities (`type-title`, `type-hero-task`, `type-section`, `type-sub`, `type-body`, `type-small`, `type-button`, `type-table`, `type-meta`, `type-label`, `type-metric`, `type-metric-sm`, `type-mono`, `type-kbd`). Loaded via `next/font`: Red Hat Display (display), Red Hat Text (body), Red Hat Mono (figures).
- Breakpoints: `sm` 521px, `md` 861px (desktop layout from here), `lg` 1101px. Controls are 44px on phones and 36px from `md` without extra classes: the size tokens change at the breakpoint.
- Motion: `motion-enter`, `motion-fade`, `motion-menu`, `motion-dialog`, `motion-sheet`, `motion-pulse`. Reduced motion turns all of it off.
- Primitives: `@/ui` and `packages/shared/src/ui/patterns`, each with a test and an entry in `/design-system`. Icons only through `<Icon name="..." />` or inline SVG `<symbol>` defs.
- Light theme only. No raw colours, no gradients, warm brown-black shadows only (`rgba(42,28,16, ...)`), one focal element per screen, gold accent used 3 times or fewer per viewport.
