# @brandbasket/shared

Code used by both apps: `apps/website` (the marketing site) and `apps/platform` (the customer app, the staff admin
and their API routes).

- `src/ui/` React components (icons, logo, phone field, line drawings)
- `src/lib/` pure helpers: pricing, money, validation, business details, security headers
- `src/server/` server-only helpers (phone number defaults and display)
- `src/styles/theme.css` the palette, fonts, base styles and shared motion, imported by each app's `globals.css`

Import by path, e.g. `import { cn } from "@brandbasket/shared/lib/cn"`. Anything only one app uses belongs in that app.
