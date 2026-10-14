-- N14 in the privacy plan: a reviewer may tick "Let this business contact me about this review". Only then does the
-- business's owner see their number. Every existing review starts as false: none of those reviewers was asked.
ALTER TABLE "directory_reviews" ADD COLUMN "owner_may_contact" boolean DEFAULT false NOT NULL;