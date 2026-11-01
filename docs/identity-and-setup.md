# HOSPOT identity foundation

## Local configuration

The backend reads `MONGO_URL` and `DB_NAME` from its environment or `backend/.env`. Set `CORS_ORIGINS` to a comma-separated list containing the exact frontend origins. When omitted, local development allows `http://localhost:3000` and `http://127.0.0.1:3000`; wildcard origins are discarded. `SESSION_COOKIE_SECURE` defaults to `true` and should remain enabled outside local HTTP development.

The frontend reads `REACT_APP_BACKEND_URL` from its environment. Do not put secrets in frontend environment variables; Create React App embeds them in the client bundle. The browser and API should be deployed on the same site so the `SameSite=Lax` session cookie works.

Install from the existing lockfiles only when setting up a new checkout. No application runtime dependency was added; `httpx` was added as the backend test client's test-only transport. Run the backend from `backend` with `uvicorn server:app --reload --port 8000`, then run the frontend from `frontend` with `npm start` or the repository's configured package manager.

The first platform administrator is provisioned interactively from `backend` with `python provision_platform_admin.py`. It reads the existing Mongo configuration, asks for the email and password without echoing the password, refuses to create an additional platform administrator, and does not expose a public bootstrap endpoint. Provisioning also refuses to run until the single-platform-admin unique index is present. Keep the backend environment file private. Platform administrators can create expiring, one-time invitations for doctors and hospital administrators through `POST /api/auth/invitations`; the invitation token must be delivered to the recipient through a trusted channel because outbound email is not configured. The frontend accepts a recipient link in the form `/login#invite=<token>&email=<url-encoded-email>` and submits the token only to the invitation redemption endpoint.

## Platform administrator concurrency constraint

Concurrent first-time provisioning is protected by this MongoDB index on the `users` collection:

```javascript
db.users.createIndex(
  { role: 1 },
  {
    name: "one_platform_admin",
    unique: true,
    partialFilterExpression: { role: "PLATFORM_ADMIN" }
  }
)
```

The partial filter leaves all non-platform-admin roles unrestricted by this constraint. The application startup path does not create this index. Provisioning verifies that the exact unique partial constraint already exists, and handles a MongoDB duplicate-key race as a safe provisioning conflict.

The migration script is read-only by default. From `backend`, run `python migrate_platform_admin_index.py` to report the current platform-admin count and whether the index exists. Review the result and obtain explicit operational approval before running `python migrate_platform_admin_index.py --apply`. The apply command rechecks the count and refuses to create the index if more than one platform-admin row exists. It does not repair or delete duplicates. A duplicate-key error during index creation also leaves the existing user rows untouched; investigate and resolve duplicates through a separately approved account-management procedure, then repeat preflight.

Rollback requires an approved maintenance window that stops platform-admin provisioning. Dropping `one_platform_admin` removes database-enforced protection and permits concurrent bootstrap attempts to create more than one platform admin. Do not drop it as a routine rollback; if removal is unavoidable, first disable provisioning and document the period without the constraint. Reapplying the index requires the same duplicate-count preflight.

## Authentication design

- Passwords are hashed with Python's built-in scrypt implementation and unique random salts. Plaintext passwords are not stored.
- Login creates a random 12-hour opaque session. Only its SHA-256 hash is stored in MongoDB; the browser receives the session in an HttpOnly, SameSite=Lax cookie.
- State-changing API requests require both an allowed `Origin` and a matching CSRF cookie/header pair. CORS uses explicit origins and only the required headers.
- `GET /api/auth/me` restores the profile after refresh. The frontend does not persist identity or credentials in local storage.
- User-specific API routes derive the account ID from the server session. The cart and order list routes no longer accept caller-supplied user IDs.
- Expired MongoDB sessions and invitations are removed with TTL indexes. Expiry is also checked when a session or invitation is used.

## Permission matrix

| Capability | Patient | Doctor | Hospital administrator | Platform administrator |
|---|---:|---:|---:|---:|
| Read public hospital and medicine listings | Yes | Yes | Yes | Yes |
| Read/update own profile | Yes | Yes | Yes | Yes |
| Read own prescriptions, cart, and orders | Yes | No | No | No |
| Update own hospital bed availability | No | No | Yes, assigned hospital only | Yes |
| Invite doctor or hospital administrator | No | No | No | Yes |
| Update medicine order status | No | No | No | Yes |
| Access clinical patient records | No | No clinical routes are enabled yet | No | No clinical routes are enabled yet |

`PATCH /api/auth/me` updates the caller's name only. Hospital administrators are assigned a hospital ID at invitation time. A hospital administrator updating another hospital receives a not-found response to avoid disclosing whether the resource exists. Doctors currently have no patient-record endpoint: a future clinical workflow must encode patient consent/assignment in the data model and enforce it in its service layer before access is enabled.

## Endpoints

- `GET /api/auth/csrf` — initialize the CSRF cookie/header token.
- `POST /api/auth/register` — patient self-registration; creates a session.
- `POST /api/auth/login`, `POST /api/auth/logout` — session login/revocation.
- `GET /api/auth/me`, `PATCH /api/auth/me` — current profile.
- `POST /api/auth/invitations` — platform-admin-only doctor or hospital-admin invitation.
- `POST /api/auth/register/invited` — redeem a one-time invitation.
- `PUT /api/admin/hospitals/{hospital_id}/beds` — assigned hospital admin or platform admin.
- Existing prescription/cart/order routes now require a patient session and use its account ID for ownership. `PUT /api/orders/{order_id}/status` is platform-admin-only.

## Current limitations

Patient email-change verification uses the official Resend Python SDK by default. Configure backend-only `RESEND_API_KEY`, `HOSPOT_EMAIL_FROM`, and `HOSPOT_PUBLIC_FRONTEND_URL` in the local backend environment or deployment secret manager; keep all credentials out of frontend configuration and version control. Verify the sender domain and required DNS records in Resend before delivery. `EMAIL_DELIVERY_PROVIDER=smtp` explicitly selects the optional SMTP adapter; no provider fallback occurs. For details and local mocked-test steps, see [Patient profile](patient-profile.md#patient-email-changes). This flow does not verify email at initial registration or deliver invitations. Provider acceptance is not a guarantee of inbox delivery. Password reset, MFA, login rate limiting, refresh-token flow, and audit logging are not implemented. Invitation tokens are still returned to an authorized platform administrator for manual delivery. The existing bed-booking form is still a local simulation and has no booking API or persistent booking record. Doctor access remains closed until an explicit clinical authorization model is implemented. These gaps must be addressed before production use with real patient data.

## Verification commands

- Backend: `pytest tests/test_auth.py`
- Frontend: `npm test -- --watchAll=false`
- Frontend production build: `npm run build`
