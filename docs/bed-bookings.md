# Bed booking backend

## Existing capacity model

Hospitals store `availableBeds` for the existing `ICU`, `General`, and `Special` categories. The backend now also stores `reservedBeds` in the same per-category shape. Existing hospital documents without that field are returned with zero reserved counts and acquire the field when a reservation is made. The repository has no total-bed or occupied-bed data, so the API does not infer or report those counts.

## API

- `POST /api/bookings` — patient session required; accepts `hospitalId`, `bedType`, and the current booking form's patient/contact/admission fields. Patient identity comes from the session; caller-supplied identity fields are rejected.
- `GET /api/bookings` — patients receive their history; hospital administrators receive bookings for their assigned hospital only.
- `GET /api/bookings/{booking_id}` — returns a booking only to its patient or the administrator assigned to its hospital.
- `POST /api/bookings/{booking_id}/cancel` — patient may cancel `pending` or `confirmed` bookings. The status transition is conditional, and only the winning request restores capacity.
- `PATCH /api/admin/bookings/{booking_id}/status` — the assigned hospital administrator may change a `pending` booking to `confirmed` or `rejected`. Rejection restores capacity; confirmation keeps it reserved.

New reservations begin as `pending`. The hospital inventory update is a conditional atomic MongoDB update requiring the selected available count to be at least one. It decrements `availableBeds.<type>` and increments `reservedBeds.<type>` together, so concurrent reservations cannot drive availability below zero. Booking insertion and this capacity update run in one MongoDB transaction. Rejection and cancellation run their conditional booking status transition and capacity release in one transaction as well.

## Indexes

Application startup ensures these indexes on `bookings` using the existing backend index-initialization pattern:

- `id` unique, for booking lookups.
- `(patientId, createdAt descending)`, for patient history.
- `(hospitalId, createdAt descending)`, for hospital booking lists.

The backend tests use a fake database that records index requests; they do not create MongoDB indexes. No database connection or index operation was run while implementing this feature.

## Consistency and capacity limits

Multi-document booking operations require a MongoDB replica set or sharded cluster that supports transactions. Standalone MongoDB deployments cannot safely execute these operations; the API returns a generic service-unavailable response and does not fall back to non-transactional writes. The current database topology has not been verified in this repository-only test run.

The isolated tests emulate transaction rollback, including injected failures after a fake write, and exercise competing requests. They do not prove MongoDB server transaction behavior or topology support; verify those in an approved non-production MongoDB integration environment before rollout. The conditional `$gte` capacity update is atomic on the hospital document; the transaction makes it atomic with the associated booking status/record update.

Hospital administrators continue to set `availableBeds` through the existing inventory endpoint. Because the current schema has no total capacity, the backend cannot validate those values against physical totals or occupied beds. Administrators should use that endpoint to report current unreserved availability, not total bed inventory.
