-- Staff can no longer reject or revoke a claim, so none is left rejected: each one goes back to waiting for approval,
-- which lets its owner edit again and lets staff approve it from the Claims list.
UPDATE "directory_claims" SET "status" = 'pending', "decided_at" = NULL, "decided_by_user_id" = NULL WHERE "status" = 'rejected';
