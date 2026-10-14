# Page tabs: the owner chooses the tabs on their business page

Date: 2026-10-09. Asked by the owner of Fynix in chat.

## What was asked

The row of tabs along the top of a business's public page (Overview, Services, Location, Reviews...) is the
business owner's to shape. Four tabs are always there: **Overview, Location, Reviews, Gallery**. The rest are
optional: the owner turns each on or off from the customer dashboard.

## Decisions

- Optional tabs: **Offers, Services, Products, Good to know** (the cards the page already had). Stored per business as
  `directory_business_profiles.page_tabs text[]`, checked against that list in the database.
- A new profile starts with **none** on. Migration 0116 turns all four on for profiles that already exist, so no live
  page loses a tab it shows today.
- An optional tab shows on the public page only when it is **on and has something in it**. The dashboard says what each
  one holds ("2 services", "No deal running") and links to where it is filled in (Services, Products, Trust tabs, Deals).
- **The first of a kind switches its tab on.** The first service, product, deal or trust detail an owner saves turns on
  Services, Products, Offers or Good to know, and the save message says so. After that the tab is the owner's to turn
  off: a second item never switches it back on. Done in one atomic statement (`turnOnPageTab`).
- A business with no choice to send (a paying client, an open-data listing, or a platform older than this change) shows
  every tab that has something in it, as before. An owner who turns every optional tab off is a choice, not the absence of one.
- **Gallery** is a fixed tab: a card with the featured photo and the owner's gallery photos (`gallery_1..6`), or a
  sample set on a demo page, or "No photos yet."

## Where it lives

- Dashboard: Business profile, **Page tabs** tab (between Trust and Review & publish). Plain checkboxes, saved by
  `savePageTabsAction`; the owner of a taken-down business can look but not change.
- Feed (`/api/directory/listings`, added businesses' `profile`): `pageTabs` (absent from an older platform) and
  `gallery` (approved gallery picture ids, in slot order).
- Website: `lib/page-tabs.ts` decides which tabs show and builds the row; `GalleryCard` is the new card. The website
  keeps its own copy of the tab ids, because it cannot import the platform's code.
