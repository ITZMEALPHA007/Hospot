# Medicine catalog and inventory

## Existing inventory model

The existing collection stores one `inStock` integer on each medicine document. Cart items and order items contain a medicine ID but no hospital or stock-location field. This milestone therefore keeps inventory **global**. Only platform administrators can change the global catalog or its inventory; hospital administrators and doctors do not receive that permission.

Stock adjustments are signed deltas. Negative adjustments use a conditional MongoDB update requiring `inStock >= abs(adjustment)` and `$inc` on the same document. The update is atomic for that medicine record and cannot reduce stock below zero. The low-stock flag uses a temporary threshold of 10 units (`inStock <= 10`); product owners should confirm the threshold before operational use.

Adding and updating a cart line checks current stock and rejects inactive or expired medicines. Cart entries use the catalog's current name and price; client-supplied names and prices are ignored. A cart does not reserve stock. Checkout revalidates each cart line and decrements global stock only inside the checkout transaction.

Expiry dates use the existing `YYYY-MM-DD` string field. Patient catalog listing, detail, cart operations, and checkout treat a date before the current date as expired and unavailable; malformed legacy expiry values fail closed. Administrators can still inspect and adjust stock for expired items. The 23 legacy seed entries retain their existing expiry dates; as of 2026-10-31, 22 of those are past expiry. Twelve separately marked demo entries have 2028 expiry dates. Only unexpired items appear to patients until legacy seed data is corrected through an authorized catalog update.

## API

- `GET /api/medicines` — active, unexpired catalog; supports `search`, `category`, and `prescription_required` filters.
- `GET /api/medicines/categories` — existing category list.
- `GET /api/medicines/{medicine_id}` — active, unexpired medicine detail.
- `GET /api/admin/medicines` — platform-admin catalog, including inactive and expired items; `lowStock=true|false` filters the computed low-stock flag.
- `GET /api/admin/medicines/{medicine_id}` — platform-admin detail.
- `POST /api/admin/medicines` — platform-admin creates a catalog record, including initial stock.
- `PATCH /api/admin/medicines/{medicine_id}` — platform-admin updates catalog information and optional image metadata. Stock and active status are excluded from this payload.
- `PATCH /api/admin/medicines/{medicine_id}/stock` — platform-admin adjusts global stock by a nonzero delta.
- `PATCH /api/admin/medicines/{medicine_id}/deactivate` — platform-admin deactivates without deleting the record or historical cart/order references.

## Cart and order management

Cart ownership is always taken from the authenticated patient session. The API accepts medicine IDs and quantities for cart additions; legacy name/price fields are ignored. Cart CRUD does not reserve stock. Checkout uses the authenticated patient's stored cart, the current medicine names/prices and current stock, and ignores submitted `userId`, `items`, `totalAmount`, and prescription ID lists. New order snapshots store unit prices in `items[].price`, an INR `itemSubtotal`, a separately represented `deliveryFee` (currently zero), `totalAmount`, and `currency: "INR"`. See [Order fulfilment](order-fulfilment.md) for fulfillment selection, status transitions, and the global-inventory location limitation. Payment method is recorded, but no payment is processed.

Cart and order endpoints:

- `GET /api/cart`, `POST /api/cart/add`, `PUT /api/cart/update?medicine_id=...&quantity=...`, `DELETE /api/cart/remove/{medicine_id}`, and `DELETE /api/cart/clear` are patient-only and session-scoped.
- `POST /api/orders` checks out the current cart; it creates an order only when every line is valid and in stock.
- `GET /api/orders` and `GET /api/orders/{order_id}` expose only the authenticated patient's orders.
- `POST /api/orders/{order_id}/cancel` lets the owner cancel a pending order.
- `GET /api/admin/orders` and `GET /api/admin/orders/{order_id}` are platform-admin only.
- `PUT /api/orders/{order_id}/status?status=...` is platform-admin only and applies a validated transition; it does not accept ownership, item, or total replacements.

Order lifecycle and cancellation rules differ by fulfillment method and are documented in [Order fulfilment](order-fulfilment.md). Legacy orders without a fulfillment method retain their previous transition sequence. Cancelling restores each ordered quantity to its catalog medicine in the same transaction as the status change. A conditional status update prevents a repeated cancellation from restoring stock twice.

Checkout and cancellation use MongoDB multi-document transactions spanning the cart, order, and medicine documents. If any stock decrement, order insert, cart clear, or cancellation restock fails, the transaction aborts. The database must support transactions (for example, a replica set); the API returns a service-unavailable response when transaction support is not available. Tests use the repository's transaction-shaped in-memory fake, which serializes and rolls back operations but does not prove real MongoDB transaction or concurrency behavior. No live MongoDB behavior was verified.

Medicine image metadata is represented by `imageUrl`, `imageSource`, and `imageAlt`. The fields must be supplied or cleared together. Request validation checks URL shape and metadata completeness; it does not fetch external URLs. Do not add a URL until the resource and usage rights have been verified.

## Seed image review

The prior seed records used generic Unsplash stock photos rather than verified package images. The seed manufacturer labels do not identify a verified real product brand/package for these catalog records. New seed records leave the image fields empty. On startup, only matching seed name/manufacturer records that still have the legacy Unsplash URL are cleared; records with any other image URL are preserved. This update touches only the three image fields and does not insert duplicates or change IDs, stock, prices, or other data.

No external product image was added. Tata 1mg pages were reviewed as possible ingredient/strength references, including [Dolo 500](https://www.1mg.com/drugs/dolo-500mg-tablet-26676), [Brufen 400](https://www.1mg.com/drugs/brufen-400-tablet-1002088), and [Amox 500](https://www.1mg.com/drugs/amox-500mg-capsule-44812). Their product branding does not match the seed manufacturer labels, and [Tata 1mg's terms](https://www.1mg.com/tnc/) state that its content is protected and prohibit public/commercial reuse and hotlinking. The direct image assets could not be verified as reusable resources, so no direct URLs were stored.

The following seed records currently have no product image:

- Paracetamol 500mg
- Ibuprofen 400mg
- Amoxicillin 500mg
- Vitamin D3 1000 IU
- Metformin 500mg
- Amlodipine 5mg
- Omeprazole 20mg
- Salbutamol Inhaler
- Antiseptic Cream
- Sertraline 50mg
- Aspirin 325mg
- Tramadol 50mg
- Vitamin C 1000mg
- B-Complex
- Azithromycin 250mg
- Cetirizine 10mg
- Cough Syrup
- Probiotics
- Hydrocortisone Cream 1%
- Sunscreen SPF 50
- Artificial Tears
- Children's Fever Reducer
- Multivitamin Gummies for Kids

## Demo catalog expansion

The seed initializer now adds 12 additional example records, with stable IDs and an `isDemo: true` marker: Electral ORS Powder 21.8g, Digene Gel 200ml, Dabur Honitus Cough Syrup 100ml, Volini Pain Relief Gel 30g, Limcee Vitamin C 500mg, Zincovit Tablets, Dabur Chyawanprash 500g, ENO Fruit Salt Lemon 5g, Dabur Pudin Hara Pearls 10 Capsules, Betadine Ointment 5% 20g, Vicks VapoRub 25g, and Shelcal 500 Tablets. They use INR prices, positive illustrative stock counts, and expiry dates in 2028. These records are examples only; their stock is not verified commercial inventory and must not be used to fulfill real orders.

Seed insertion checks the stable ID or exact name/manufacturer before inserting. Re-running initialization does not update existing catalog fields or create duplicates. The 23 legacy records created by the original seed initializer are marked `isDemo: true` by an additive metadata-only update for their exact known name/manufacturer identities. Their IDs, prices, stock, expiry, and other catalog information are preserved. Admin-created records default to `isDemo: false`.

Product names/manufacturers and broad product forms were checked against official brand/manufacturer pages where available, including [Electral ORS by FDC](https://www.electral.in/ors.php), [Digene products](https://www.digeneindia.com/products/), [Dabur Honitus](https://www.dabur.com/honitus/product/cough-syrup), [Volini Gel](https://volini.com/volini-gel/), [Zincovit by Apex Laboratories](https://apexlab.com/products/nutraceuticals-and-food-supplements/), [Dabur Chyawanprash](https://www.dabur.com/our-brand/dabur-chyawanprash), [Dabur Pudin Hara Pearls](https://www.daburshop.com/products/pudin-hara-pearls), [ENO Lemon sachet](https://www.eno.co.in/products/eno-fruit-salt-sachet/), [Vicks VapoRub](https://vicks.co.in/en-in/browse-products/decongestion-category/vicks-vaporub), and [Shelcal 500](https://www.torrentpharma.com/pi/IN/products/). The Zincovit and Shelcal demo records are flagged prescription-required based on product listings that identify these specific tablets as Rx/Schedule H. Confirm exact package labeling and applicable requirements before using demo records as commercial inventory.

These identity sources do not establish a license for reuse of package imagery. Exact image reuse terms for these product assets were not verified, so no product image URL has been stored. All demo records use the local neutral placeholder on the detail page. The existing 23 catalog records also have no verified reusable product images.

The placeholder is `frontend/public/images/medicine-placeholder.svg`; it contains no brand/product claims. The details page uses a verified image URL and its `imageAlt` metadata when the API provides one, otherwise the local placeholder; an image load failure also falls back to the placeholder. The listing card component and its layout were not changed.

## Verification

Tests use the repository's in-memory database only. No real MongoDB connection, migration, index creation, stock adjustment, or account creation was run against application data.
