-- Staff pictures on ads: the staff connection reads, adds and updates them, never deletes (a picture is marked removed).
-- 0155 created the table's policy; this makes sure of the grant.
GRANT SELECT, INSERT, UPDATE ON directory_staff_ad_pictures TO bb_staff;
