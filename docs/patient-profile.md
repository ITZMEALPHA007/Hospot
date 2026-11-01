# Patient profile summary

The patient dashboard profile uses `GET /api/patient/profile/summary`. The endpoint requires a valid authenticated patient session. Its patient identity comes from the session; callers cannot provide a patient ID.

The response includes the account creation time and active status, all-time booking counts with the four supported booking statuses, all-time medicine-order count, the count of orders with `delivered` or `picked_up` status, and up to eight recent booking/order summaries. Recent activity is a compact view of those records, not a complete event or account activity feed.

`nonCancelledOrderValue` is the sum of stored `totalAmount` snapshots for orders whose status is not `cancelled`. Cancelled orders are excluded. The backend does not track payment settlement or refunds, so this value represents recorded order value, not confirmed paid spending. The response currency is INR.

The summary endpoint returns no patient ID, booking clinical fields, contact details, delivery address, password data, storage key, or session tokens. The authenticated `GET /api/auth/me` profile includes the account-level `phoneNumber` for patients, or `null` when none is saved. It is never inferred from a booking contact number.

`PATCH /api/auth/me` preserves name updates and also accepts `phoneNumber`. Send a valid number to add or replace it; send JSON `null` to remove it. Indian mobile numbers are accepted as 10 digits beginning with 6–9, optionally with a `+91` prefix. Spaces and hyphens are ignored for normalization. The stored and returned format is E.164-style `+91XXXXXXXXXX`. Other country prefixes and malformed numbers are rejected. Only patients may update this field; profile identity is taken from the authenticated session and mutations remain CSRF-protected. A saved number is **unverified**; this milestone does not confirm ownership. OTP verification is required before the product may treat it as verified or use it for sensitive communication.

Name changes and phone changes may be submitted separately or together in the same PATCH request. Account phone numbers are independent of booking contact numbers.

## Profile pictures

Patient picture management uses the authenticated session and never accepts an account ID:

- `POST /api/auth/me/profile-picture` accepts multipart form field `file` and returns the updated public profile, including `profilePictureUrl`.
- `GET /api/auth/me/profile-picture` returns the current user's image bytes. It requires the session cookie and returns private no-store content with `X-Content-Type-Options: nosniff`.
- `DELETE /api/auth/me/profile-picture` removes the current user's picture and returns the updated public profile.

Only decoded JPEG, PNG, and WebP images are accepted. The compressed upload is limited to 5 MB; width and height are limited to 4096 pixels and total decoded pixels to 16 million. Animated images are rejected. Pillow decodes and re-encodes the image before storage, removing original metadata and trailing/polyglot content. Filenames supplied by clients are ignored. MongoDB stores only a random storage key, detected media type, and cache version; image bytes remain in the storage adapter.

The current adapter is private local filesystem storage. It uses `HOSPOT_PROFILE_PICTURE_DIR` when set, otherwise `backend/uploads/profile-pictures`. It is suitable for local development or a persistent shared volume only. Container-local or ephemeral disk is not durable, shared, or a production object-storage solution. No S3 bucket, credentials, or storage configuration were found in the repository, although `boto3` is already a dependency.

Before production use, configure a durable private object-storage adapter with access restricted to the application, update `create_app` to inject it, preserve authenticated retrieval (or use short-lived signed URLs with an explicit access policy), configure lifecycle cleanup for orphaned objects, and verify backup, retention, encryption, and deployment permissions. Do not expose the local upload directory as a static public directory. A persistent-volume deployment should set `HOSPOT_PROFILE_PICTURE_DIR` to a protected writable path shared by every backend worker.

## Patient email changes

The current email address remains active until ownership of the replacement address is verified. Patient identity for request, resend, and status operations comes only from the authenticated session. Email changes do not invalidate existing sessions; the browser refreshes its own `/api/auth/me` profile after confirmation. Other active browser sessions retain their cached display value until they refresh, while their server sessions remain valid.

### API

- `GET /api/auth/email-change` — patient-only status. Returns `{ "pending": false }`, or `pending`, destination `email`, `expiresAt`, and `resendAvailableAt`. It never returns a token.
- `POST /api/auth/email-change/request` — patient-only, CSRF-protected JSON body `{ "email": "new@example.com" }`. Returns HTTP 202 with the same generic message for a current or already-used address to avoid account-address enumeration. If eligible, the API sends a verification message.
- `POST /api/auth/email-change/resend` — patient-only and CSRF-protected. Sends a new token for the current pending address when eligible. The old token becomes invalid. The response is generic and does not contain the token.
- `POST /api/auth/email-change/confirm` — JSON body `{ "token": "..." }`. This narrowly scoped confirmation does not require a login session; the high-entropy token is its authorization. The normal API CSRF middleware still requires an allowed Origin and matching CSRF cookie/header for the browser POST. GET requests never consume a token, which avoids mail-link scanners confirming a change automatically. The email link places its token in the URL fragment; browser requests, frontend-server access logs, and Referer headers do not receive URL fragments.

Successful confirmation changes `email` and `emailNormalized` atomically on the patient document and marks the embedded challenge as consumed. The existing unique `users.emailNormalized` index is the final concurrency guard; a duplicate-key result is handled as an unavailable address. Used links return 409, expired links 410, and invalid or superseded links a generic 400. The current address is unchanged for all failures.

Tokens contain 48 bytes of cryptographically secure randomness. MongoDB stores only a SHA-256 hash, the associated account ID (through the containing user document), normalized proposed address, creation/expiry/send timestamps, resend count, and used timestamp. Tokens expire after 15 minutes and cannot be replayed. Newer requests supersede older challenges, guarded by the challenge creation timestamp. Patients are limited to five request/resend operations per hour, with a 60-second resend cooldown and at most three resends for one challenge.

### Email delivery and configuration

The backend has a provider-independent `EmailDelivery` interface. Resend's official Python SDK is the default provider; SMTP remains available only when explicitly selected. There is no automatic fallback, console, preview, or fake-success behavior. Missing provider configuration returns HTTP 503 before creating or changing a pending challenge. Provider rejection, timeout, or network failure also returns HTTP 503, leaves the account email unchanged, and conditionally clears only the failed challenge. Logs omit recipient addresses, provider response details, message contents, and tokens. A successful API response means the provider accepted the send request; it does not prove inbox delivery.

Configure these backend-only settings in the local backend environment or deployment secret manager (never in frontend settings or source control):

- `RESEND_API_KEY` (a newly rotated Resend API key; never reuse a key exposed in chat or source control)
- `HOSPOT_EMAIL_FROM` (a bare sender address on a domain verified in Resend)
- `HOSPOT_PUBLIC_FRONTEND_URL` (the trusted frontend base URL; HTTPS is required except for localhost development, and its origin must also be listed in `CORS_ORIGINS`)
- Optional `EMAIL_DELIVERY_PROVIDER` (`resend` by default; set to `smtp` only to explicitly select the SMTP alternative)

Resend requires a verified sending domain before production use. Configure the DNS records Resend provides (including SPF and DKIM; publish DMARC appropriate to the organization’s mail policy). Use a restricted, rotated API key and keep it only in the backend runtime secret store. Restart the backend after changing backend environment settings. SMTP selection requires `HOSPOT_SMTP_HOST`, `HOSPOT_SMTP_PORT` (465 uses implicit TLS; other supported ports use mandatory STARTTLS), `HOSPOT_SMTP_USERNAME`, and `HOSPOT_SMTP_PASSWORD`; it is never selected as a fallback.

The verification origin is built only from `HOSPOT_PUBLIC_FRONTEND_URL`, never from a request Host header. Production must use an HTTPS frontend and a provider-verified sender domain. An operator must configure the Resend account, domain DNS and backend secrets; this repository does not create accounts or contain credentials.

### Local testing

Run `.venv\\Scripts\\python.exe -m pytest -q tests/test_email_change.py` from the repository root. Tests mock the Resend SDK boundary and inject an isolated in-memory database; they do not call Resend, send mail, or connect to MongoDB. For a manual delivery check, configure the backend variables above and use only an address you control. Do not use production patient data for testing.
