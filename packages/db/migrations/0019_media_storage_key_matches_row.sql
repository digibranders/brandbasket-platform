-- Ties each media row's storage key to the row itself. 0016 stopped fynix_app from changing a key after insert,
-- but said nothing about the key an INSERT supplies: a bug in the app could still record a row whose key names
-- another business's file, and serving that row would hand the other business's image to this tenant. The key is
-- always built as t/{business_id}/{id}/display (mediaStorageKey in apps/web), so any other value is refused here,
-- for every role. Rows already written by the app satisfy it; the dev database held no media rows when this was added.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_storage_key_check" CHECK ("media_assets"."storage_key" = 't/' || "media_assets"."business_id" || '/' || "media_assets"."id" || '/display');
