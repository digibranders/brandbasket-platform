CREATE TABLE "india_pincodes" (
	"pincode" text PRIMARY KEY NOT NULL,
	"state_code" text NOT NULL,
	"district_slug" text NOT NULL,
	"district_name" text NOT NULL,
	"localities" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "india_pincodes_pincode_check" CHECK ("india_pincodes"."pincode" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "india_pincodes_state_code_check" CHECK ("india_pincodes"."state_code" ~ '^[a-z]{2}$'),
	CONSTRAINT "india_pincodes_district_slug_check" CHECK ("india_pincodes"."district_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "india_pincodes_localities_check" CHECK (jsonb_typeof("india_pincodes"."localities") = 'array' and jsonb_array_length("india_pincodes"."localities") > 0)
);
