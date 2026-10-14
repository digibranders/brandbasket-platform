# Webfold → Firstfold reference inventory

Audited 2026-10-10. This is an inventory only; application code, environment files and databases were not modified. Counts cover tracked text files at the start of the audit, before these planning documents existed. Matching lines and occurrences are separate counts. Case-insensitive literal search for `webfold`; generated builds, dependencies, Git internals and binary assets are excluded. Local configuration is listed separately with values redacted. No tracked path in either repository contains the old name.

## Repository totals

| Repository | Tracked files | Matching lines | Occurrences |
| --- | ---: | ---: | ---: |
| firstfold-platform | 123 | 857 | 964 |
| firstfold-website | 1 | 1 | 1 |

The website has one historical reference to the Vercel project `webfold-website-v1`. No tracked application code in the website matched the old name. The platform package names, package import scope and repository URLs already use Firstfold.

## Full file list

### firstfold-platform

#### Application/setup/CI

| File | Matching line numbers | Occurrences |
| --- | --- | ---: |
| [.github/workflows/ci.yml](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/.github/workflows/ci.yml:97) | 97, 124, 128, 129, 147 | 5 |
| [apps/platform/.env.example](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/apps/platform/.env.example:19) | 19, 23, 29, 128 | 6 |
| [apps/platform/lib/server/affiliate-access.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/apps/platform/lib/server/affiliate-access.ts:15) | 15 | 1 |
| [apps/platform/lib/server/public-db.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/apps/platform/lib/server/public-db.ts:13) | 13 | 1 |
| [apps/platform/lib/signed-in-hint.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/apps/platform/lib/signed-in-hint.ts:4) | 4 | 1 |
| [packages/db/scripts/import-directory-places.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/scripts/import-directory-places.ts:78) | 78 | 1 |
| [packages/db/scripts/import-india-pincodes.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/scripts/import-india-pincodes.ts:53) | 53 | 1 |
| [packages/db/src/local-env-template.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/local-env-template.ts:21) | 21, 22, 24, 55, 56, 57, 58, 59, 60, 61, 96 | 12 |
| [packages/db/src/queries/affiliates.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/affiliates.ts:26) | 26 | 1 |
| [packages/db/src/queries/appointments.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/appointments.ts:935) | 935 | 1 |
| [packages/db/src/queries/business-facts.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/business-facts.ts:158) | 158 | 1 |
| [packages/db/src/queries/leads.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/leads.ts:78) | 78 | 1 |
| [packages/db/src/queries/practitioners.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/practitioners.ts:75) | 75 | 1 |
| [packages/db/src/queries/projects.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/projects.ts:186) | 186, 187 | 2 |
| [packages/db/src/queries/referrals.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/queries/referrals.ts:10) | 10 | 1 |
| [packages/db/src/roles.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/roles.ts:3) | 3, 4, 6 | 3 |
| [packages/db/src/schema/referrals.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/schema/referrals.ts:25) | 25, 103 | 2 |
| [packages/db/src/scope.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/scope.ts:18) | 18, 50, 58 | 4 |
| [packages/db/src/support-rls.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/support-rls.sql:2) | 2, 3, 4, 5, 6, 7, 8, 16, 17, 21, 22, 25, 29, 30, 34, 37, 45, 46, 47, 52, 86, 92, 95, 97, 134, 163, 186, 212, 213, 233, 234 | 41 |
| [packages/shared/src/ui/changelog-art.tsx](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/shared/src/ui/changelog-art.tsx:496) | 496 | 1 |
| [packages/shared/src/ui/icons.tsx](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/shared/src/ui/icons.tsx:232) | 232 | 1 |
| [scripts/cms-create-migration.mjs](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/scripts/cms-create-migration.mjs:6) | 6 | 1 |
| [scripts/cms-migrate.sh](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/scripts/cms-migrate.sh:2) | 2 | 1 |
| [scripts/server/firstfold-migrate](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/scripts/server/firstfold-migrate:36) | 36 | 1 |

#### Tests

| File | Matching line numbers | Occurrences |
| --- | --- | ---: |
| [packages/db/src/appointments.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/appointments.integration.test.ts:217) | 217, 239, 251, 282, 288, 296, 301, 306, 311, 332, 598, 603, 621, 627, 644, 653, 662, 670, 678, 688, 697, 701, 710, 720, 734, 743, 751, 761, 771, 781, 784, 791, 807, 817 | 34 |
| [packages/db/src/business-modules.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/business-modules.integration.test.ts:305) | 305, 312 | 2 |
| [packages/db/src/directory-places.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/directory-places.integration.test.ts:361) | 361, 383, 385 | 4 |
| [packages/db/src/directory.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/directory.integration.test.ts:452) | 452 | 2 |
| [packages/db/src/funnel.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/funnel.integration.test.ts:120) | 120 | 1 |
| [packages/db/src/local-env-template.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/local-env-template.test.ts:19) | 19, 20, 24, 25, 26, 27, 30, 31, 46, 60, 70, 71 | 20 |
| [packages/db/src/onboarding.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/onboarding.integration.test.ts:827) | 827, 834, 840, 948 | 4 |
| [packages/db/src/patient-reports.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/patient-reports.integration.test.ts:75) | 75 | 1 |
| [packages/db/src/patients.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/patients.integration.test.ts:342) | 342, 349, 381, 395, 408, 418, 431 | 7 |
| [packages/db/src/payment-confirmation.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/payment-confirmation.integration.test.ts:191) | 191, 192, 193, 203, 368, 375 | 6 |
| [packages/db/src/practitioners.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/practitioners.integration.test.ts:57) | 57, 261, 328, 336 | 4 |
| [packages/db/src/projects.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/projects.integration.test.ts:153) | 153 | 1 |
| [packages/db/src/rls.integration.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/rls.integration.test.ts:53) | 53, 133, 136, 143 | 4 |
| [packages/db/src/testing/index.test.ts](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/src/testing/index.test.ts:6) | 6, 10, 11, 17, 22 | 6 |

#### Current docs

| File | Matching line numbers | Occurrences |
| --- | --- | ---: |
| [README.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/README.md:3) | 3, 14, 15, 16, 17, 24, 102 | 9 |
| [docs/deployment/vps.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/deployment/vps.md:13) | 13, 163 | 3 |

#### Historical migrations

| File | Matching line numbers | Occurrences |
| --- | --- | ---: |
| [packages/db/migrations/0001_rls_and_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0001_rls_and_grants.sql:2) | 2, 3, 5, 20, 23, 27, 30, 43, 48, 58, 62, 66 | 15 |
| [packages/db/migrations/0004_funnel_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0004_funnel_grants.sql:1) | 1, 2, 5, 8, 11, 14, 17, 31, 35, 39, 43, 47 | 12 |
| [packages/db/migrations/0010_billing_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0010_billing_grants.sql:3) | 3, 6, 9, 22, 28, 33, 37, 40 | 10 |
| [packages/db/migrations/0014_onboarding_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0014_onboarding_grants.sql:4) | 4, 7, 12, 15, 18, 29, 30, 68, 73, 79, 85, 91, 97, 103, 109, 115, 120, 123, 126, 129, 132, 135, 138, 141 | 24 |
| [packages/db/migrations/0016_narrow_onboarding_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0016_narrow_onboarding_grants.sql:3) | 3, 7, 12, 16, 21, 31, 32 | 7 |
| [packages/db/migrations/0018_staff_submits_as_customer.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0018_staff_submits_as_customer.sql:2) | 2, 3, 5, 8, 9, 10, 11, 14, 17 | 10 |
| [packages/db/migrations/0019_media_storage_key_matches_row.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0019_media_storage_key_matches_row.sql:1) | 1 | 1 |
| [packages/db/migrations/0025_cms_foundation_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0025_cms_foundation_grants.sql:2) | 2, 7, 10, 13, 17, 21, 37, 40, 44, 47, 51, 54, 56, 60, 64, 67, 71, 74, 78, 81, 84 | 21 |
| [packages/db/migrations/0030_referral_codes.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0030_referral_codes.sql:43) | 43, 45, 49, 50, 56 | 5 |
| [packages/db/migrations/0033_referral_code_delete_grant.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0033_referral_code_delete_grant.sql:6) | 6 | 1 |
| [packages/db/migrations/0039_plans_69_and_2999.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0039_plans_69_and_2999.sql:2) | 2 | 1 |
| [packages/db/migrations/0042_business_modules_appointments_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0042_business_modules_appointments_grants.sql:3) | 3, 6, 12, 16, 21, 24, 30, 34, 37, 40, 46, 50, 57, 60, 62, 77, 85, 89, 92, 98, 103, 108, 111, 114, 120, 125, 129, 132, 135, 138, 141, 144, 172, 179, 183, 192, 193, 197, 201, 205, 206, 210, 215, 219, 223, 227, 228, 249, 254, 259, 260, 266, 272, 278 | 55 |
| [packages/db/migrations/0043_sms_messages_purge_grant.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0043_sms_messages_purge_grant.sql:5) | 5 | 1 |
| [packages/db/migrations/0045_clinic_practitioners_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0045_clinic_practitioners_grants.sql:3) | 3, 10, 13, 16, 22, 27, 34, 37, 43, 48, 51, 54, 60, 65, 71, 77, 82, 88, 92, 96, 100, 109, 110, 114, 118, 122, 123, 127, 132, 136, 140, 144, 145 | 34 |
| [packages/db/migrations/0048_charges.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0048_charges.sql:45) | 45, 48, 54, 58 | 4 |
| [packages/db/migrations/0049_plan_price_changes.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0049_plan_price_changes.sql:21) | 21, 24, 27, 30, 36 | 5 |
| [packages/db/migrations/0050_clinic_patients.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0050_clinic_patients.sql:53) | 53 | 2 |
| [packages/db/migrations/0051_clinic_patients_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0051_clinic_patients_grants.sql:10) | 10, 12, 15, 18, 20, 26, 31, 39, 60, 68, 76, 83, 90, 95, 102, 107, 117, 126, 134, 144, 183 | 21 |
| [packages/db/migrations/0053_directory_listings_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0053_directory_listings_grants.sql:5) | 5, 7, 10, 16, 20, 23, 28, 31, 37, 41, 46 | 11 |
| [packages/db/migrations/0055_directory_reviews_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0055_directory_reviews_grants.sql:4) | 4, 5, 9, 15, 20, 26, 30, 36 | 9 |
| [packages/db/migrations/0057_directory_verifications_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0057_directory_verifications_grants.sql:4) | 4, 9, 15 | 5 |
| [packages/db/migrations/0059_directory_daily_counts_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0059_directory_daily_counts_grants.sql:4) | 4, 8, 14 | 5 |
| [packages/db/migrations/0062_directory_promotions_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0062_directory_promotions_grants.sql:4) | 4, 8, 12, 15, 21, 25, 30 | 7 |
| [packages/db/migrations/0065_directory_ads_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0065_directory_ads_grants.sql:4) | 4, 10, 13, 19, 23, 27, 30, 36, 39, 43, 46, 52, 56, 59, 62, 68, 72 | 17 |
| [packages/db/migrations/0067_directory_staff_ads_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0067_directory_staff_ads_grants.sql:2) | 2, 4, 10 | 3 |
| [packages/db/migrations/0070_directory_pictures_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0070_directory_pictures_grants.sql:3) | 3, 9, 12, 18, 22 | 5 |
| [packages/db/migrations/0073_account_phone_otps_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0073_account_phone_otps_grants.sql:5) | 5, 11 | 2 |
| [packages/db/migrations/0076_directory_places_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0076_directory_places_grants.sql:3) | 3, 4, 8, 11, 14, 26, 29, 32 | 8 |
| [packages/db/migrations/0081_business_profiles_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0081_business_profiles_grants.sql:3) | 3, 7, 10, 16, 20 | 5 |
| [packages/db/migrations/0085_india_pincodes_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0085_india_pincodes_grants.sql:5) | 5, 8 | 2 |
| [packages/db/migrations/0087_business_profile_sections.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0087_business_profile_sections.sql:5) | 5, 81, 83, 89, 92, 95, 97 | 7 |
| [packages/db/migrations/0090_directory_open_listings_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0090_directory_open_listings_grants.sql:3) | 3, 5, 9 | 4 |
| [packages/db/migrations/0091_affiliates_coupons.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0091_affiliates_coupons.sql:123) | 123, 125, 127, 129, 131, 141, 143, 145, 147 | 9 |
| [packages/db/migrations/0094_business_extra_categories.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0094_business_extra_categories.sql:16) | 16, 18, 22, 25 | 4 |
| [packages/db/migrations/0095_directory_deals.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0095_directory_deals.sql:28) | 28, 30, 34, 37 | 4 |
| [packages/db/migrations/0096_account_closures.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0096_account_closures.sql:41) | 41, 44, 53, 56 | 4 |
| [packages/db/migrations/0097_account_erasure_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0097_account_erasure_grants.sql:4) | 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 | 15 |
| [packages/db/migrations/0101_directory_ad_spots_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0101_directory_ad_spots_grants.sql:2) | 2, 5, 11, 14, 20 | 5 |
| [packages/db/migrations/0104_plan_upgrades_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0104_plan_upgrades_grants.sql:4) | 4, 7, 10, 16, 20 | 5 |
| [packages/db/migrations/0106_directory_videos_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0106_directory_videos_grants.sql:3) | 3, 10, 13, 19, 23, 26 | 6 |
| [packages/db/migrations/0109_directory_review_comments_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0109_directory_review_comments_grants.sql:4) | 4, 9, 15 | 5 |
| [packages/db/migrations/0113_geo_catalog_guards.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0113_geo_catalog_guards.sql:48) | 48, 51 | 2 |
| [packages/db/migrations/0117_listing_tagline.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0117_listing_tagline.sql:14) | 14 | 1 |
| [packages/db/migrations/0118_directory_visitors.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0118_directory_visitors.sql:18) | 18, 24 | 2 |
| [packages/db/migrations/0122_tax_invoices_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0122_tax_invoices_grants.sql:6) | 6, 8, 11, 17, 21, 24, 27, 33, 37, 40, 43, 49 | 12 |
| [packages/db/migrations/0123_tax_invoice_paid_on.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0123_tax_invoice_paid_on.sql:15) | 15, 17 | 2 |
| [packages/db/migrations/0126_add_ons_grants.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0126_add_ons_grants.sql:4) | 4, 6, 9, 24, 28, 32, 36, 39, 42, 45 | 10 |
| [packages/db/migrations/0127_feedback_support_and_error_issues.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0127_feedback_support_and_error_issues.sql:172) | 172, 173, 174, 175, 176, 177, 178, 186, 187, 191, 192, 195, 199, 200, 204, 207, 215, 216, 217, 222, 256, 262, 265, 267, 304, 333, 356, 382, 383, 403, 404, 409, 410, 411, 412, 413 | 47 |
| [packages/db/migrations/0128_directory_business_faqs.sql](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/packages/db/migrations/0128_directory_business_faqs.sql:19) | 19, 21, 23, 27, 30 | 5 |

#### Historical plans/specs

| File | Matching line numbers | Occurrences |
| --- | --- | ---: |
| [docs/superpowers/plans/2026-09-15-phase-1a-foundation.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-15-phase-1a-foundation.md:12) | 12, 65, 605, 606, 610, 611, 612, 614, 693, 694, 717, 718, 719, 720, 721, 821, 825, 1149, 1150, 1258, 1259, 1261, 1276, 1279, 1283, 1286, 1299, 1304, 1314, 1318, 1322, 1329, 1331, 1339, 1513, 1573, 1574, 1581, 4120, 4121, 4122 | 55 |
| [docs/superpowers/plans/2026-09-16-phase-1b-sales-funnel.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-16-phase-1b-sales-funnel.md:8) | 8, 30, 40, 221, 222, 224, 235, 236, 251, 252, 295, 296, 299, 302, 305, 308, 311, 325, 329, 333, 337, 341, 351, 807, 1552 | 27 |
| [docs/superpowers/plans/2026-09-16-phase-1c-payment-wall.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-16-phase-1c-payment-wall.md:20) | 20, 307, 308, 309, 315, 318, 322, 325, 326 | 11 |
| [docs/superpowers/plans/2026-09-16-phase-2-customer-dashboard.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-16-phase-2-customer-dashboard.md:19) | 19, 123, 124, 125, 126, 129 | 7 |
| [docs/superpowers/plans/2026-09-17-cms-foundation.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-17-cms-foundation.md:309) | 309, 314, 317, 320, 324, 328, 344, 347, 351, 354, 358, 361, 363, 367, 371, 374, 378, 381, 385, 388, 391 | 21 |
| [docs/superpowers/plans/2026-09-17-payload-cms-migration.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-17-payload-cms-migration.md:67) | 67, 84, 621 | 5 |
| [docs/superpowers/plans/2026-09-18-admin-app-split.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-18-admin-app-split.md:545) | 545, 546 | 2 |
| [docs/superpowers/plans/2026-09-18-admin-separate-repo-split.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-18-admin-separate-repo-split.md:822) | 822, 823, 824 | 3 |
| [docs/superpowers/plans/2026-09-21-tenant-site-renderer.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-21-tenant-site-renderer.md:67) | 67, 131, 954, 958, 959 | 6 |
| [docs/superpowers/plans/2026-09-22-referral-codes.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-22-referral-codes.md:151) | 151, 152, 153, 155, 170 | 5 |
| [docs/superpowers/plans/2026-09-23-change-requests.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-23-change-requests.md:9) | 9, 346, 347, 349, 350, 1358 | 6 |
| [docs/superpowers/plans/2026-09-25-business-modules-appointments.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-25-business-modules-appointments.md:35) | 35, 36, 37, 343, 344, 346, 348, 350, 351, 353, 355, 357, 358, 360, 362, 371, 373, 374, 375, 377, 380, 382, 383, 384, 386, 389, 391, 393, 394, 396, 399, 410, 524, 525, 533 | 39 |
| [docs/superpowers/plans/2026-09-25-slot-booking.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-25-slot-booking.md:4) | 4, 224, 283, 290 | 9 |
| [docs/superpowers/plans/2026-09-28-charges-and-blog-unlock.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-28-charges-and-blog-unlock.md:40) | 40 | 1 |
| [docs/superpowers/plans/2026-09-28-clinic-doctors.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-28-clinic-doctors.md:19) | 19, 137, 138, 152, 153, 154, 157, 159, 160 | 11 |
| [docs/superpowers/plans/2026-09-29-clinic-patients.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-29-clinic-patients.md:10) | 10, 19, 90, 162 | 6 |
| [docs/superpowers/plans/2026-09-29-customer-listing-tab.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-29-customer-listing-tab.md:87) | 87, 89, 617, 619, 622, 628, 632, 635, 640, 643, 649, 653, 658 | 13 |
| [docs/superpowers/plans/2026-09-30-blog-cms-editor.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-09-30-blog-cms-editor.md:8) | 8, 9 | 2 |
| [docs/superpowers/plans/2026-10-01-business-profile.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-01-business-profile.md:13) | 13, 103, 106 | 6 |
| [docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md:580) | 580, 582, 584, 586, 594, 596, 598, 601 | 9 |
| [docs/superpowers/plans/2026-10-06-affiliates-coupons.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-06-affiliates-coupons.md:17) | 17, 20, 21 | 6 |
| [docs/superpowers/plans/2026-10-06-directory-listings-in-database.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-06-directory-listings-in-database.md:352) | 352, 354, 358 | 4 |
| [docs/superpowers/plans/2026-10-06-india-wide-business-profiles.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-06-india-wide-business-profiles.md:540) | 540, 543 | 2 |
| [docs/superpowers/plans/2026-10-07-business-videos.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-07-business-videos.md:49) | 49 | 2 |
| [docs/superpowers/plans/2026-10-09-gst-tax-invoices.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-09-gst-tax-invoices.md:1512) | 1512, 1514, 1517, 1523, 1527, 1530, 1533, 1539, 1543, 1546, 1549, 1555, 3352, 3354, 5933, 5934 | 18 |
| [docs/superpowers/plans/2026-10-09-reactivation.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/plans/2026-10-09-reactivation.md:19) | 19 | 1 |
| [docs/superpowers/specs/2026-09-15-firstfold-platform-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-09-15-firstfold-platform-design.md:12) | 12, 516, 519, 520, 523, 536, 608, 639, 641 | 11 |
| [docs/superpowers/specs/2026-09-22-referral-codes-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-09-22-referral-codes-design.md:86) | 86, 87, 140, 217 | 4 |
| [docs/superpowers/specs/2026-09-25-business-modules-appointments-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-09-25-business-modules-appointments-design.md:92) | 92, 93, 99, 142, 293 | 5 |
| [docs/superpowers/specs/2026-09-29-clinic-patients-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-09-29-clinic-patients-design.md:55) | 55 | 1 |
| [docs/superpowers/specs/2026-09-29-customer-listing-tab-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-09-29-customer-listing-tab-design.md:115) | 115, 117 | 2 |
| [docs/superpowers/specs/2026-09-29-directory-reviews-enquiries-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-09-29-directory-reviews-enquiries-design.md:8) | 8, 75, 76, 85 | 5 |
| [docs/superpowers/specs/2026-10-01-business-profile-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-10-01-business-profile-design.md:131) | 131 | 1 |
| [docs/superpowers/specs/2026-10-06-affiliates-coupons-design.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-platform/docs/superpowers/specs/2026-10-06-affiliates-coupons-design.md:255) | 255 | 2 |

### firstfold-platform local configuration

- `apps/platform/.env.local.bak-20261009-131151`: DATABASE_URL_OWNER (line 4), DATABASE_URL_OWNER_TEST (line 5), (comment) (line 12), DATABASE_URL (line 13), DATABASE_URL_STAFF (line 14), DATABASE_URL_TEST (line 15), DATABASE_URL_STAFF_TEST (line 16), DATABASE_URL_PUBLIC (line 17), DATABASE_URL_PUBLIC_TEST (line 18), DATABASE_URL_PAYLOAD (line 24). Values intentionally omitted.
- `apps/platform/.env.local`: DATABASE_URL_OWNER (line 4), DATABASE_URL_OWNER_TEST (line 5), (comment) (line 12), DATABASE_URL (line 13), DATABASE_URL_STAFF (line 14), DATABASE_URL_TEST (line 15), DATABASE_URL_STAFF_TEST (line 16), DATABASE_URL_PUBLIC (line 17), DATABASE_URL_PUBLIC_TEST (line 18), DATABASE_URL_PAYLOAD (line 24). Values intentionally omitted.
- `apps/admin/.env.local.bak-20261009-131151`: DATABASE_URL_STAFF (line 4), DATABASE_URL_PAYLOAD (line 7). Values intentionally omitted.
- `apps/admin/.env.local`: DATABASE_URL_STAFF (line 4), DATABASE_URL_PAYLOAD (line 7). Values intentionally omitted.

The dated `.bak` files are rollback snapshots, not active runtime configuration. Preserve them as historical backups; do not silently rewrite them.

### firstfold-website

#### Current docs

| File | Matching line numbers | Occurrences |
| --- | --- | ---: |
| [docs/performance-audit-2026-10-07.md](/Users/a12345/Desktop/AI/FirstFold/firstfold-website/docs/performance-audit-2026-10-07.md:3) | 3 | 1 |

### firstfold-website local configuration

No matches found in the inspected local `.env*` files or `.vercel/project.json`.

## Database findings (read-only local inspection)

- Main database: `webfold`; test database: `webfold_test`; Payload database: `webfold_payload`.
- Cluster-wide login roles: `webfold_app`, `webfold_staff`, `webfold_public`.
- The main database exposes application schemas `public` and `drizzle`. No old-brand schema name or table name was found by the catalog queries. `packages/db/src/schema/referrals.ts` contains old role names in comments, not branded table definitions.
- Five functions in the local main database contain old role names: `projects_guard_customer_transition()`, `domains_guard_customer_insert()`, `appointments_guard_customer_transition()`, `support_guard_message_identity()`, `support_deny_history_mutation()`.
- Additional local databases share this PostgreSQL cluster: `webfold_addons_test`, `webfold_gst`, `webfold_gst_payload`, `webfold_task17_test`, `firstfold_feedback`, `firstfold_feedback_cms`, `firstfold_feedback_test`, `firstfold_verify`. Their use of the roles must be audited before any cluster-wide rename. Their names and contents are outside the two-repository code change unless explicitly included in the cutover.
- Production database state was not inspected; repeat the catalog audit against a production clone before execution.

## Dependencies outside the two repositories

The sibling `vps-setup` directory still targets old database names in backups, restore checks, migration wrappers and cutover scripts. These are deployment dependencies; the two-repository refactor cannot safely go live until the active server copies are coordinated. Relevant files:

- `vps-setup/platform/firstfold-migrate` (also duplicated inside the platform repo).
- `vps-setup/backup/firstfold-backup` and `vps-setup/backup/firstfold-restore-test`.
- `vps-setup/cutover/1-freeze-and-copy.sh` and `vps-setup/cutover/2-restore-on-vps.sh`.
- `vps-setup/02-harden-and-tune.sh` and `vps-setup/README.md`.
- `vps-setup/cutover/source-counts.txt` is historical evidence; preserve it.

Historical Vercel project names refer to external resources. Editing a document does not rename the resource. The website audit should retain the accurate historical identifier, clearly labelled as legacy, until an actual resource rename is separately performed.
