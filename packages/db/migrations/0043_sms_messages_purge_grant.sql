-- purgeExpiredBookingData (packages/db) deletes sms_messages rows older than 7 days on the staff connection, the
-- same patient-data-retention cleanup 0042 already granted DELETE for on booking_otps. sms_messages itself only
-- ever got SELECT, INSERT there -- nothing needed to delete from it existed yet -- so this closes that gap rather
-- than touching 0042 (whose own edit, for the appointments_guard_customer_transition trigger, is unrelated).
GRANT DELETE ON sms_messages TO bb_staff;
