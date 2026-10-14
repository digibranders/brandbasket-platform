# Product photos

Owners of an owner-added business can give each product one photo from the Products tab of the Business profile. It shows on the product's card and in its popup on the public business page, in the column beside the page.

## Rules

- One photo per product, optional. The product must exist first: the photo is added from the product's **Edit** sheet, not from the Add form.
- Square. The browser cuts the chosen file to a square about its centre (so a phone photo is small enough to send); the server cuts it again to exactly 800 × 800 and re-encodes it as WebP, dropping all metadata. The smallest accepted source is 400 px across.
- It goes live at once, like a gallery photo: no staff check. Staff can still take a business down.
- Same gate as the listing's own pictures: a paid-up member with a listing; the Care plan has none. The upload shares the business's hourly image budget.
- Replacing a photo gives the product a new photo id and deletes the old file and its copies. Removing a photo, removing the product, and erasing the account delete the files too.

## Storage

Six nullable columns on `directory_business_products` (`photo_id`, `photo_mime`, `photo_bytes`, `photo_width`, `photo_height`, `photo_sha256`), all set or all null (migration 0135). The file is at `t/{businessId}/{photoId}/display`, with `w320` and `w640` copies like any picture. Writes run on the staff connection after the platform has checked the customer, like the rest of the catalogue.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `POST /api/product-photos?product=<id>` | the signed-in owner | the raw image bytes; answers 201 `{ photoId }` |
| `GET /product-photos/<photoId>` (app host) | the owner | their own photo, for the dashboard |
| `GET /api/directory/product-pictures/<photoId>[?w=320\|640]` | the website, with `LEADS_API_TOKEN` | a photo its product still has, for a business whose listing is approved |

The feed's product carries `photo` (the photo id) when it has one. The website serves it from its own origin at `/api/directory-product-picture/<id>`, because its content security policy allows images from nowhere else.
