-- Staff may delete a referral code that nobody has ever paid on: a typo, or one created by mistake. A code any
-- subscription points at cannot be deleted at all, and not only by convention: subscriptions.referral_code_id is
-- a foreign key, so the database refuses it outright. That is deliberate. A redeemed code is part of the billing
-- record of everyone paying on it, and the frozen discount on their subscription would lose the row explaining
-- where it came from. Turn such a code off instead.
GRANT DELETE ON referral_codes TO webfold_staff;
