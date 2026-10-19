-- An add-on added to a running plan raises the amount the next renewal must arrive at, so a pending add-on amount may now be
-- higher than the billed one as well as lower. And the system waives an add-on's open charge itself (a newer quote replaced
-- it, or it was paid after the month renewed), as it does a move up's.
ALTER TABLE "charges" DROP CONSTRAINT "charges_status_check";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_bundled_check";--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_status_check" CHECK (case "charges"."status"
        when 'open' then "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is null
        when 'paid' then "charges"."payment_id" is not null and "charges"."paid_at" is not null and "charges"."waived_at" is null
        else "charges"."payment_id" is null and "charges"."paid_at" is null and "charges"."waived_at" is not null and ("charges"."waived_by_staff_id" is not null or "charges"."kind" in ('directory_ad', 'plan_upgrade', 'add_on'))
      end);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_bundled_check" CHECK ("subscriptions"."bundled_add_on_net_cents" >= 0 and ("subscriptions"."pending_bundled_add_on_net_cents" is null or "subscriptions"."pending_bundled_add_on_net_cents" >= 0));