# Payment welcome implementation plan

**Goal:** Implement the approved unboxing celebration in the existing confirmed-payment welcome dialog.

**Architecture:** Keep the payment landing, query parameter and service data unchanged. Update the dialog presentation, isolate decorative gift layers and animation CSS, and make the existing canvas effect use elapsed time and explicit cleanup. Use native dialog dismissal and the established design tokens.

**Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, CSS modules, Phosphor, Vitest.

1. Extend `components/first-look/payment-welcome.test.tsx` with explicit payment confirmation, accessible close action, query preservation, Escape dismissal, empty services and cleanup coverage. Add `fire-poppers.test.tsx` for elapsed duration, reduced motion and cancellation. Run the focused tests and confirm the new expectations fail.
2. Create a transparent gift illustration in `public/illustrations/`. Use one source with separated lid and body, animated independently. Implement the responsive dialog, service reveals, persistent action area and reduced-motion styles in `payment-welcome.tsx` and `payment-welcome.module.css`.
3. Update `fire-poppers.ts` to use fixed physics steps driven by elapsed time, scale for the viewport, read palette tokens and stop all work on close, reduced-motion changes or unmount. Keep the existing pure physics helpers and parameter helpers.
4. Run focused tests, app lint, TypeScript, the app unit suite and production build. Review the complete diff. Inspect the real dialog at desktop and mobile widths, including short viewports, dismissal and reduced motion.
5. Commit only the welcome implementation and its assets, push to development and update the existing PR with the implemented behavior and validation results.

## Concept fidelity revision

The owner requested matching the supplied concept directly. Replace the simplified gift with a transparent illustration derived from the concept, including its curled metallic ribbons and persistent paper. Use a 450px desktop card, a 48px bold display heading, warm 38px service icon tiles, solid green checks and the concept's vertical spacing. Keep the real payment data, native dialog controls, reduced motion and cleanup behavior. Initial focus goes to the heading so opening the card does not visually select the close button. Compare the implemented desktop and mobile popup directly with the supplied image, then rerun platform lint, TypeScript, unit tests and build before updating the PR.

## Independent motion revision

Replace the two flattened artwork halves with individually clipped source pieces. Derive geometry from the existing raster's alpha channel offline, preserve its appearance, and render the pieces with unique SVG clip IDs and a shared optimized texture. Animate the box entrance, lifting/hovering lid, swaying ribbons, turning paper and glinting star independently. Keep gentle motion after the original three-second particle burst. Gate the entrance on texture readiness, including cached loads before hydration, and clean up pending load listeners on unmount. Verify actual changing transforms in the browser, mobile layout and dismissal, then rerun the platform checks and update the PR.
