# Payment welcome implementation plan

**Goal:** Implement the approved unboxing celebration in the existing confirmed-payment welcome dialog.

**Architecture:** Keep the payment landing, query parameter and service data unchanged. Update the dialog presentation, isolate decorative gift layers and animation CSS, and make the existing canvas effect use elapsed time and explicit cleanup. Use native dialog dismissal and the established design tokens.

**Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, CSS modules, Phosphor, Vitest.

1. Extend `components/first-look/payment-welcome.test.tsx` with explicit payment confirmation, accessible close action, query preservation, Escape dismissal, empty services and cleanup coverage. Add `fire-poppers.test.tsx` for elapsed duration, reduced motion and cancellation. Run the focused tests and confirm the new expectations fail.
2. Create a transparent gift illustration in `public/illustrations/`. Use one source with separated lid and body, animated independently. Implement the responsive dialog, service reveals, persistent action area and reduced-motion styles in `payment-welcome.tsx` and `payment-welcome.module.css`.
3. Update `fire-poppers.ts` to use fixed physics steps driven by elapsed time, scale for the viewport, read palette tokens and stop all work on close, reduced-motion changes or unmount. Keep the existing pure physics helpers and parameter helpers.
4. Run focused tests, app lint, TypeScript, the app unit suite and production build. Review the complete diff. Inspect the real dialog at desktop and mobile widths, including short viewports, dismissal and reduced motion.
5. Commit only the welcome implementation and its assets, push to development and update the existing PR with the implemented behavior and validation results.
