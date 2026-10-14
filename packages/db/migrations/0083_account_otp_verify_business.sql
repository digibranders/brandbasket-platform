-- An owner proving their business's number to have it marked Verified is a third kind of account code, beside a
-- sign-up's and a password reset's (0073). Same rules: 6 digits, 10 minutes, 5 tries, used once. drizzle-kit's DDL,
-- unchanged.
ALTER TYPE "public"."account_otp_purpose" ADD VALUE 'verify_business';
