# Hospital and doctor management

## Hospital routes

- `POST /api/admin/hospitals` — platform administrator creates a hospital.
- `GET /api/admin/hospitals` — platform administrator lists all hospitals, including inactive ones.
- `GET /api/admin/hospitals/{hospital_id}` — platform administrators can view any hospital; hospital administrators can view only their assigned hospital.
- `PATCH /api/admin/hospitals/{hospital_id}` — platform administrators or the assigned hospital administrator can update hospital information. Bed inventory, IDs, and active state are not accepted in this payload.
- `PATCH /api/admin/hospitals/{hospital_id}/deactivate` — platform administrator deactivates a hospital without deleting it.
- Existing `PUT /api/admin/hospitals/{hospital_id}/beds` remains the bed inventory operation.

The hospital record keeps the project's existing name, location, phone, address, bed categories, availability, reserved capacity, rating, distance, and emergency fields. New hospitals start with zero reserved beds and `active: true`. Legacy records without `active` continue to be treated as active. Deactivated hospitals are omitted from public hospital search/detail and cannot receive new bookings or invitations. Existing booking records and capacity data are retained; pending bookings are not automatically cancelled.

## Doctor routes and invitations

- `POST /api/auth/invitations` — platform administrators can invite doctors to an active hospital or hospital administrators to an active hospital. Hospital administrators can invite doctors only to their own assigned hospital.
- `POST /api/auth/register/invited` — redeems an invitation and associates the account with the invitation's hospital. Redemption fails if that hospital has since been deactivated.
- `GET /api/doctors/me` and `PATCH /api/doctors/me` — an active doctor can view or change their own name.
- `GET /api/admin/doctors` and `GET /api/admin/doctors/{doctor_id}` — platform administrators can view all doctors (optionally filtered by `hospitalId`); hospital administrators see only doctors assigned to their hospital.
- `PATCH /api/admin/doctors/{doctor_id}/deactivate` — platform administrators can deactivate any doctor; hospital administrators can deactivate only doctors assigned to their hospital.

Doctor management returns only basic account fields. The existing user model has no specialty, license, credentials, or other professional-profile fields, so this milestone does not invent or persist those fields. Role and hospital assignment are set by invitation and cannot be edited through profile or management payloads. Deactivation preserves the account record; authenticated requests stop working because authentication requires an active account.

## Verification

Run the isolated backend suite from the repository root with the existing project virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Tests use the in-memory database fixture. No live database, migration, index, or real account operation is part of this feature's test run.
