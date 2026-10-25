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

## Delivery and acceptance

The public web form uses shared localized copy, persistent input on retryable
failure, clear delivery confirmation, focusable error summaries, associated
labels and keyboard submission. The dealer inbox ships on web and both native
clients with platform-appropriate navigation and accessible unread state. Do not
call this feature complete until real persistence, HTTP authorization, source
limits, CAPTCHA failure behavior, generated contracts, web/native journeys and
required adversarial tests pass. Domain/application tests alone are insufficient.
