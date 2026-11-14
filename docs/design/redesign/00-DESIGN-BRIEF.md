# Release 2 design brief (visual ideas, not final designs)

Purpose: collect visual ideas for every screen in both apps, using ChatGPT image generation, ready for Release 2. Images are inspiration. Final screens must still follow the real design systems: `apps/customer/DESIGN.md` (plan 60, Basket UI, Geist and Geist Mono, light theme, tokens only) and `apps/admin/DESIGN.md` (Red Hat family, dark rail, one raised surface, one dark button per screen). The journey they serve is `docs/product-architecture-audit/19-end-to-end-user-journey.md` and diagrams in `21`.

## Who and what

BrandBasket is a done-for-you digital presence service for small local businesses in India. Customers are shop owners and clinic owners, often on a phone, not technical. Staff is one person running everything from a console. Tone: calm, plain words, reassuring, no jargon, no hype.

## Rules for every generated image

- Light theme only for the customer app. Console: light page with the dark left rail.
- Clean, calm, lots of white space. One main action per screen. Sentence case.
- No gradients, no glassmorphism, no neon, no 3D, no stock people, no decorative illustrations.
- Real looking Indian small business content (a bakery, a physio clinic, a driving school). Prices in rupees with GST included, for example "₹2,999 a month". Never invent customer results or logos.
- Wording from the journey: "Call completed", "We have started", "Needs your OK", "Start my plan".
- No em dashes or en dashes in any text inside the images.
- Generate desktop (1440 wide) and phone (390 wide) versions for customer screens. Console is desktop only.
- Ask for 3 options per screen, then pick, and ask for one refinement round.

## Save convention

Save chosen images in `docs/design/redesign/customer/` or `docs/design/redesign/console/` as `NN-screen-name-option.png` (for example `03-home-b.png`). Keep a one line note per image in `docs/design/redesign/DECISIONS.md`: which option won and why.

## Screen list (what to design)

Customer app (about 25 screens): sign up, intake questions, basket and checkout, payment waiting and failed, Home (per service next actions), checklist, Website (kickoff booked, preview, live), Website pages and domain, Social (setup, connect accounts, writing posts, approve pictures, calendar), Paid Ads information page, Requests list and a request with a quote, Reports, Business profile and brand kit, Plan and billing (services, failed payment, add or cancel a service), Settings and Team, delete and restore account, Help.

Console (about 14 screens): sign in, Today (one list), kickoff "Call completed" popup, client workspace (tabs per service), Website tab, Requests and a thread, Enquiries, Payments (flagged payment, refund), Invoices, Reports review, Compliance (privacy requests, breaches, access log), System (errors, emails and webhooks), Calls.

## Process

1. Run the starter prompt in `01-PROMPTS.md` once to set the style in a new ChatGPT chat.
2. Run one screen prompt at a time. Pick the best of three, ask for one refinement.
3. Download the winner into the folder, add its line to `DECISIONS.md`.
4. When all screens have a winner, run a consistency pass: ask ChatGPT to show three screens side by side and fix mismatches.
5. Release 2 agents use the images plus the real design system. The images never override tokens or components.
