# Design notes: Social (/social)

- Area: Customer app, Social media management
- Status: Polish only per owner decision 5b
- Date: 2026-11-14

## 1. Scope and constraints
- Per owner decision (2026-11-14) and section 5b of RELEASE-2-PLAN.md: Steve designed the Social layouts and the owner wants them kept.
- Polish only: Token level refinement that brings Steve's layouts into the premium brand language:
  - Font switch to Red Hat Display, Red Hat Text, and Red Hat Mono.
  - Warm brown-black elevations (`0 1px 0 rgba(42,28,16,0.03)` resting, `0 12px 32px` hero).
  - Clean tokens: paper ground (`#F6F5F2`), surface (`#FFFFFF`), line (`#E3E0D9`), ink (`#15161A`).
  - No layout changes: channels column, tab structure (Calendar, Posts, Pictures, Analytics), post cards, and Settings Social tab remain structurally identical.
  - Zero rename of legacy-social.

## 2. States covered in mock-social.html
1. Active posts schedule:
   - Channels sidebar with connected accounts and to-do badge counts.
   - Activity ring with monthly quota progress in Red Hat Mono.
   - Posts grid with ThumbStrip showing scheduled posts and approval state rings.
2. Needs review state:
   - Gold ring around pending post card with "Review caption and creative" prompt.
3. Empty state:
   - Peaceful empty state with camera icon and "No posts scheduled yet".
4. Token expired error:
   - ErrorState banner with "Instagram connection expired: reconnect in Settings to continue automated publishing".

## 3. Punctuation and brand checks
- Zero em or en dashes.
- Rattan gold accent used 2 times in the viewport.
