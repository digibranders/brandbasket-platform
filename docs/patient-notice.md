# Patient notice on a clinic's booking page

A clinic that takes bookings through Fynix is the one that decides why a patient's name, phone number and email address are collected. The email address is where the confirmation code goes; the phone number is how the clinic calls the patient, and is never verified: nothing is sent to it. DPDP Act 2023 s.5 and Rule 3 ask for a notice before they are. This is how a client site shows it and how Fynix keeps proof.

**On the client site**, above the booking button:

1. Render `patientNotice(clinicName, language)` from `@fynix/shared/lib/privacy/patient-notice` (`en`, `hi` or `mr`). Show it as plain text, not behind a link or a tick box: the patient is not asked to agree, they are told.
2. Send `noticeVersion: PATIENT_NOTICE_VERSION` (from the same module) with the booking request's `fields` (`SiteBookingFields.noticeVersion` in `lib/site-bookings.ts`, the file client sites keep a copy of).

**On the platform**, nothing else to do. The version is held with the pending booking, and once the code is confirmed and the slot is booked it is recorded in `consent_records` (purpose `patient_booking`, subject type `patient`, the patient's id). A request without it books as before and records nothing. An erased patient has no record to attach it to.

**Changing the text:** edit it in `patient-notice.ts` and change `PATIENT_NOTICE_VERSION` in the same commit; never reuse a label. The Hindi and Marathi texts are a first translation and need a native speaker and counsel to read them before a clinic relies on them.

**Not done yet:** the client site template that renders the notice and sends the version. Until a site does, its bookings carry no proof.
