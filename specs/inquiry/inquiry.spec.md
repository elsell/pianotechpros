# Buyer inquiries and dealer inbox

## Product contract

Implement IQ-01 through IQ-03 from the parity matrix. An anonymous visitor can
send a contact request about a currently published piano in a published showroom.
Success means the message is durably stored, not that an email was delivered.
The dealer inbox is the authoritative delivery surface; sending email is not
required for submission success. No live customer data or deployment integration
is introduced by this work.

Require a buyer name (1–120 Unicode code points), a bare email address (at most
254 bytes), and a message (1–4000 Unicode code points). Phone is optional (at most
40 code points). Contact preference is email (default), phone, or either; phone
preference requires a phone number. Trim outer whitespace. Reject invalid UTF-8,
control characters in single-line fields and controls other than newline/tab in
messages. Treat content as plain text; never interpret buyer HTML or interpolate
it into headers. Names and messages are private buyer information.

Capture the server-selected public piano snapshot plus dealer name/slug at the
same transaction/visibility linearization point as insertion. Captured dealer
names preserve the existing canonical dealer-profile contract, including internal
whitespace; buyer single-line fields have the stricter rules above. Never accept a
client-supplied snapshot, owner, dealer ID, publication revision, timestamp,
read state, or inquiry ID. Private inventory edits and subsequent republishing,
sale, or unpublish must not rewrite historical inquiry context. Historical photos
are references, not a grant to bypass current public media authorization.

## Submission and abuse boundary

Apply the coordinated source limiter before any lookup, CAPTCHA, or insertion,
including honeypot-filled requests. Source identity comes from trusted HTTP
bootstrap policy, never a body field; do not store the raw source in inquiries.
A nonempty bounded honeypot returns the same generic success as accepted input
without CAPTCHA/lookup/storage. All other input must validate before expensive
work. CAPTCHA is an injected verification port. Bootstrap must explicitly select
an enabled verifier or disabled policy; a missing verifier is never disabled.
When enabled, absent/invalid challenge or verifier outage fails closed. Tokens
are bounded, consumed only for verification, and never stored, audited or logged.

The HTTP submission route is `POST /v1/showrooms/{slug}/pianos/{id}/inquiries`.
It returns 204 with no response body after durable acceptance (or honeypot
suppression). It sets no-store and never reflects contact input in errors.
The request limiter attaches its normalized, trusted-proxy-aware source to a
server-owned context value only after allowing a request. Routes cannot derive
this identity from headers or JSON, and fail closed without that evidence.
Malformed input returns 400/422, hidden or missing publication returns 404,
exhausted source quota returns 429, rejected CAPTCHA returns 400 with stable
`inquiry_challenge_rejected` code, and dependency failure returns 503. Request
bodies are bounded to 32 KiB, including honeypot and challenge fields.

The enabled challenge adapter uses Cloudflare Turnstile Siteverify over HTTPS.
It requires exact configured hostname and `inquiry` action, a successful response
with no provider errors, and a challenge timestamp no more than five minutes old
(at most 30 seconds of future clock skew). It sends no buyer fields or source IP.
Verification has a five-second deadline, rejects redirects, bounds responses to
16 KiB, and hides provider/transport details. No automatic verification retry is
performed because tokens are single-use. Deployment credentials remain external.
Provider behavior follows the [Turnstile server validation contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Bootstrap reads `PIANOTECHPROS_INQUIRY_CHALLENGE_POLICY` (`enabled` or explicit
`disabled`), `PIANOTECHPROS_TURNSTILE_SECRET`, and
`PIANOTECHPROS_TURNSTILE_HOSTNAME`. An unset policy leaves submission unavailable;
it never bypasses verification. Invalid or partial configuration fails startup.
Enabled policy requires secret and exact lowercase hostname; disabled policy
rejects leftover verifier settings. Deployment acceptance requires an explicit
policy. A dedicated five-submissions-per-minute source budget uses the existing
coordinated PostgreSQL request scope with `inquiry:`-prefixed source identities,
separate from general request counters while sharing bounded source capacity.

The application repository command accepts validated contact input, server ID
and time plus exact showroom slug/piano lookup. The adapter must recheck current
publication and showroom visibility inside the insert transaction, so unpublish
cannot race a prior lookup. Storage failure returns failure, never success.
Anonymous responses contain no inquiry identifier or buyer data. No per-message
anonymous audit writes; source limiting bounds persistence. Authenticated inbox
operations retain principal limiting and mandatory structured audit events.

The PostgreSQL submission table is append-only for the runtime role. Its insert
guard independently checks current showroom/publication visibility and exact
snapshot content under the same lock order. A foreign key retains the published
snapshot context. Read acknowledgments belong in a separate append-only record;
they must not require update permission on buyer messages. Rollback refuses to
drop retained inquiries. Integration tests use a fresh isolated database.

## Authorized inbox

Dealer owner and editor may read and mark inquiries read; viewer
membership and platform invitation-administrator status do not grant access to
buyer contact information. Permission
checks require active persisted membership and a dedicated SpiceDB capability.
User-scoped reads must include actor and dealer scope, including repository
rechecks; inaccessible/missing identifiers have the same not-found result.
List newest first with bounded cursor pagination. Detail includes buyer contact,
message, received time and immutable submitted snapshot. Mark-read records the
first actor/time with optimistic revision and commits atomically with audit.
Repeated mark-read preserves the first acknowledgment. An acknowledgment cannot
precede receipt. Audit events contain identifiers/actions only, never contact,
message, CAPTCHA token or unrestricted metadata. Cross-user/dealer and revoked
membership tests are required for every inbox path.

Inbox preflight authenticates a rotating application session with `api:user`
scope, charges the configured principal audit limiter, and reads active persisted
dealer membership by actor and dealer. Both the local `manage_inquiries` role
capability (including fully applied grant revision) and SpiceDB's exact
`dealer:<id>#manage_inquiries` decision must allow access. An owner role must
match the persisted founding owner; editor access does not depend on email or
platform administrator status. Denied decisions emit a generic inquiry-boundary
audit event owned by the actor, without exposing a requested resource ID or PII.
Audit failure overrides a denied result. The returned access context is
request-local; repositories must still recheck persisted authority under locks.

Inbox lists default to 30 and accept 1–100 entries, ordered by received timestamp
then inquiry ID descending. A cursor binds the actor, dealer, initial snapshot
time and last `(receivedAt, id)` tuple using authenticated encryption and a
domain-specific key context. New submissions after the initial snapshot do not
enter later pages. Cursor tuples must be complete, valid and no later than the
snapshot; malformed or cross-actor/dealer cursors fail before a repository read.

Read acknowledgments use a separate append-only row keyed by inquiry ID, with
dealer ID, first reader, read time and audit ID. The insert guard requires current
active owner/editor membership, a matching successful update audit already in the
same transaction, and a read time at or after receipt. Audit ID is retained as a
reference without a foreign key so bounded audit retention remains independent.
Repeated mark-read at the current revision emits a read audit and preserves the
original acknowledgment; a stale expected revision returns conflict. Rollback
refuses to remove retained acknowledgments. Inbox reads remain available after
unpublishing the listing; historical public-photo references grant no extra access.

Authenticated HTTP routes are `GET /v1/dealers/{dealerID}/inquiries`,
`GET /v1/dealers/{dealerID}/inquiries/{id}` and
`POST /v1/dealers/{dealerID}/inquiries/{id}/read` with an expected `revision`.
They use the normal application-session boundary, no-store responses, the shared
data envelope and `meta.nextCursor` pagination. Private inquiry DTOs include
canonical contact fields, captured dealer name/slug/public piano, received time,
revision and optional first-reader/time. They never include source or CAPTCHA.

## Delivery and acceptance

The public web form uses shared localized copy, persistent input on retryable
failure, clear delivery confirmation, focusable error summaries, associated
labels and keyboard submission. The dealer inbox ships on web and both native
clients with platform-appropriate navigation and accessible unread state. Do not
call this feature complete until real persistence, HTTP authorization, source
limits, CAPTCHA failure behavior, generated contracts, web/native journeys and
required adversarial tests pass. Domain/application tests alone are insufficient.

The generated-client adapter strips credentials from anonymous submissions and
uses the rotating session transport for inbox requests. Both disable cache and
redirect following. Only an empty 204 confirms submission; malformed successful
responses fail as protocol errors. Errors expose a stable category/status, never
server detail or buyer data. Network failures do not trigger automatic resubmission
because delivery may already have committed. Inbox responses validate exact public
snapshot shape, dealer/inquiry scope, contact bounds and consistent read state
before presentation. Invalid pagination or foreign responses fail closed.

The shared buyer composer keeps contact input only in page memory, trims values
for submission, and reports field identifiers for localized validation. It
serializes submission, retains contact fields after failure, consumes challenge
tokens per attempt, and clears contact data only after confirmed success or
disposal. Navigation/disposal aborts pending transport and ignores late results;
aborting is not represented as proof that the server did not receive a message.
