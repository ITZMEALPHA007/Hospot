# Order fulfilment

## Checkout contract

`POST /api/orders` checks out the authenticated patient's cart. The patient ID,
medicine names, unit prices, stock and totals come from server-side state. Client
fields such as `userId`, `items`, `totalAmount` and `deliveryFee` are ignored.
The existing `paymentMethod` is recorded only; no payment is processed.

The request supports two `fulfillmentMethod` values:

```json
{
  "fulfillmentMethod": "PICKUP",
  "pickupLocationId": "<active hospital id>",
  "paymentMethod": "cash_on_delivery"
}
```

```json
{
  "fulfillmentMethod": "HOME_DELIVERY",
  "deliveryAddress": "12 Example Road, Bengaluru",
  "contactNumber": "+91-9000000000",
  "paymentMethod": "cash_on_delivery"
}
```

If `fulfillmentMethod` is omitted, it defaults to `HOME_DELIVERY` for existing
checkout clients. Home delivery requires both address and contact number. Pickup
requires an active existing hospital ID. The hospital's ID, name, location,
address and phone are copied into `pickupLocation`, and the response includes a
generated `pickupReference`. `GET /api/orders` and `GET /api/orders/{order_id}`
return that snapshot and the current collection status to the owning patient.

Every new order contains `itemSubtotal`, `deliveryFee`, `totalAmount`, and
`currency`. Prices are INR; `itemSubtotal` is calculated from current catalog
prices. No delivery-fee policy exists, so `deliveryFee` is always `0.0` and
`totalAmount` equals `itemSubtotal`. A client-supplied fee is ignored. The legacy
`totalAmount` field remains present for existing clients.

The order also records `inventoryScope: "GLOBAL_UNALLOCATED"`. The selected
pickup location is an order snapshot only; this does not assert that its
physical pharmacy stock was checked or reserved. Courier fields
(`deliveryProvider`, `shipmentId`, `trackingNumber`, `trackingUrl`,
`shipmentStatus`, `dispatchedAt`, and `deliveredAt`) are initialized to `null`.
No courier IDs, tracking data, events, or delivery confirmations are generated.

## Status workflows

Platform administrators update a status using the existing endpoint:

```text
PUT /api/orders/{order_id}/status?status=<status>
```

Pickup:

```text
pending -> confirmed -> preparing -> ready_for_pickup -> picked_up
```

Home delivery:

```text
pending -> confirmed -> preparing -> ready_for_dispatch -> dispatched
         -> out_for_delivery -> delivered
```

Only the next transition in the selected workflow is accepted. `picked_up`,
`delivered`, and `cancelled` are terminal. The patient may cancel only their own
pending order. A platform administrator may cancel pending or confirmed orders.
Cancellation during later fulfillment statuses is rejected. The conditional
status update and inventory restoration remain in the same MongoDB transaction,
so a repeated cancellation cannot restore stock twice.

Orders created before this change have no `fulfillmentMethod`. Their response
uses null for newly added fulfillment, pricing-breakdown and courier fields, and
they retain the previous status graph:
`pending -> confirmed -> preparing -> out_for_delivery -> delivered`.
Legacy records are not rewritten.

## Inventory and location limitation

The current medicine model has one global `inStock` value per medicine, and
cart/order lines have no hospital stock-location key. Checkout continues to
decrement that global value transactionally for both fulfillment methods. A
pickup location can be selected and retained for operational coordination, but
the backend cannot confirm stock at that location. This is not reliable
location-specific pickup inventory.

The smallest next data-model step for reliable pickup is a per-location
inventory collection (hospital/location ID, medicine ID, quantity, and update
metadata), followed by checkout that atomically decrements the selected
location's inventory. Existing global stock should not be migrated or
reinterpreted without an approved inventory reconciliation plan. Transactions
still require a MongoDB replica set or sharded deployment; the current fake
database tests do not verify real MongoDB transactions or concurrency.
