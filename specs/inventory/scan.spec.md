# Inventory scan labels

## Product contract

QR-01 preserves the legacy stable label, authenticated record identification and
quick status actions. The label opens a focused piano view with cover image,
stock number, title, make/model, availability, full-editor navigation and explicit
unpublish. Sale retains the existing sale-price confirmation; archiving and
unpublishing retain their existing confirmations. A scan never applies a mutation
by itself. Viewer membership permits identification; existing manage/publish
policy controls the respective actions. Draft, sold and archived pianos remain
identifiable to authorized staff.

## Stable private identity

A scan label associates one dealer and one inventory record with an opaque token.
Tokens contain 32 bytes from a cryptographic random source, encoded as canonical
unpadded base64url (43 characters). All-zero bytes, malformed encodings, padding,
whitespace and noncanonical aliases are invalid. Generation failure yields no
label; there is no timestamp, record ID or pseudorandom fallback. The random
source is injected behind a typed port. Token formatting/JSON serialization is
redacted by default; transport code must explicitly request its encoded value.

A label is immutable, including its original creator and creation time. Its time
uses UTC microsecond precision in years 1–9999, consistent with PostgreSQL
storage and client date rendering; the normalized zero time is invalid. Dealer,
record and creator identifiers must be nonempty bounded identifiers without
whitespace/control characters. One immutable association per dealer/record is
created lazily and retained across record edits, publication and lifecycle changes.
Concurrent creation returns the winning association; never replace a printed
label. This separate identity association does not change inventory content or
its revision. Label provisioning and its creation audit commit atomically;
subsequent reads and scan resolution commit read audits. No token appears in audit
metadata. The association has no ordinary update/delete operation.

## Authorization and transport

Every label provision/read and resolution requires an ordinary application
session, coordinated principal limiter, current actor/dealer membership and
SpiceDB dealer:view. The transactional repository rechecks scoped local authority
under existing dealer/membership locks. Resolution includes actor and dealer IDs;
there is no unscoped token lookup. Missing tokens and inaccessible records return
the same not-found response. Permission or audit failures return no label or
record. Mutations from the scan view reuse the existing revision-checked commands,
with their stronger policy, audit and history requirements.

The dedicated web scan link puts dealer ID and token in its URL fragment, never
in path/query parameters. The client consumes and removes that fragment before
loading other resources, sends the token only in a bounded authenticated POST
body, and uses no-referrer/no-store responses. Login continuation is bounded,
origin-local and cleared on cancellation/logout; tokens must not reach provider
redirect URLs, logs, analytics or public DTOs. Native scanning validates the
configured application origin and exact scan-link structure before navigating;
untrusted QR links never trigger arbitrary network requests. Native uses the
platform camera permission flow and retains a manual open-link alternative.

## Delivery and evidence

Web offers a printable high-contrast QR label with readable stock/title; native
offers a readable full-screen label and native sharing. QR payloads contain no
session or private piano attributes. A decoded printed/displayed QR must resolve
the same record after edits, sale and unpublication. Browser and device acceptance
must cover camera denial, malformed/foreign links, login continuation, authorized
viewer/editor use, cross-dealer/revoked access, failed audit and cancellation.

Initial domain/token-source implementation is not a delivered QR workflow.
Persistence, policy/HTTP integration, QR rendering/decoding and web/native
interaction evidence remain required before QR-01 is complete. The existing
legacy labels/deployment are untouched; no production data or secrets are copied.

## Transactional storage

Migration 28 stores the canonical token as a private uniquely indexed value, one
row per inventory record with a composite dealer/record foreign key. Inserts
require the current transaction's matching creation audit, active confirmed
view-capable membership, matching founding-owner identity and an existing record.
The API runtime has SELECT/INSERT only. Triggers reject update, delete and truncate;
rollback refuses to drop retained labels. Audit retention does not cascade into
labels or invalidate them.

Ensure receives a validated candidate plus a creation audit template. It locks
current dealer authority, loads the record, then returns the existing association
or inserts the candidate. Existing labels receive a fresh viewed audit instead of
a duplicate creation event; competing requests serialize on the dealer lock.
Candidate creation time must equal the audit time and cannot predate the record.
Resolve receives actor/dealer scope and a parsed token, plus a read audit template
whose initial target is the dealer. After scoped resolution it records only the
resolved record ID as its inventory_scan audit target. Neither operation releases
results on transaction/audit failure. Database error details are sanitized at this
boundary so token values from constraint errors cannot enter diagnostics.

## Application and HTTP boundary

`POST /v1/dealers/{dealerID}/inventory/{id}/scan-label` ensures the stable label
and returns only dealer_id, record_id and the explicitly encoded token.
`POST /v1/dealers/{dealerID}/inventory/scan/resolve` accepts a bounded JSON body
with token and returns only dealer_id and record_id. Clients then use ordinary
private record/publication operations; resolution is never an authorization cache.
Both endpoints use the existing opaque-session, limiter and read-policy boundary,
no-store/no-referrer headers, sensitive-input handling and stable API errors.
Token input never appears in a route parameter. Read-policy denial after initial
preflight is audited through the existing denial path. Mis-scoped or malformed
repository results fail closed. Secure generation is injected in bootstrap;
no provider credential is needed. Project-owned scan registration composes the
existing inventory application and repository without editing generated code,
following the existing photo/voice extension boundary.

## Shared client link contract

Clients construct the canonical link `/scan#v=1&dealer=<id>&token=<token>` using
only their configured web origin. The parser accepts that exact version, path,
field set/order and encoding; it rejects foreign origins, credentials, query
strings, extra/duplicate fragment fields, control characters, malformed tokens
and oversized links before any API call. Generated dealer IDs use bounded ASCII
letters/digits/hyphen/underscore. Development HTTP links are limited to loopback
origins; production origins use HTTPS. The helper performs no network request or
storage write. UI adapters consume/remove the browser fragment and own bounded
login continuation; the pure parser cannot remove browser history itself.

The generated-contract client sends tokens only in the resolution POST body,
reads current application credentials for every request, and validates exact
response fields, requested dealer/record identity and canonical token format.
Protocol/network errors are sanitized and never retain the input token or raw
response body. Both operations support abort signals for scope changes/dismissal.

## QR encoding dependency

Shared encoding pins `qr` 0.7.2 (Paul Miller, MIT OR Apache-2.0), published
2026-09-28. The registry tarball SHA-512 integrity was verified against metadata;
its encoder has no runtime dependencies or install lifecycle scripts. Only the
encoder entry point is used in application rendering, with a custom ASCII encoder
for the bounded canonical scan URL so native runtimes need no TextEncoder global.
Use a four-module white quiet zone and quartile error correction, with black
modules on white regardless of application theme. Matrix round-trip tests use the
package decoder; native device rendering and physical scan acceptance remain
separate requirements. No QR payload is sent to an external image service.
Source: https://github.com/paulmillr/qr (tag/release 0.7.2).

## Label presentation

An editor opens its saved record's label on demand without flushing or replacing
its draft. The label shows saved stock/title, a high-contrast QR image, a notice
that signing in is required, and explicit close/print or native share actions.
Unsaved identity text is not printed as if saved. Opening/loading/failed/denied
states are localized; retries issue fresh authorized requests. Dismissal or scope
change aborts pending work and clears the link/matrix. Native backgrounding closes
the label. Web printing includes only the label, not private editor content.

Mobile configuration adds an explicit public web origin for label links. Local
HTTP is available only in development; production requires a configured public
HTTPS origin with no credentials, path, query or fragment. The signed-release
gate requires this origin. The web label uses its current page origin.

Web label printing and body-level dialog mounting use the integrity-pinned browser capability adapter; presentation code receives only those explicit operations.

## Scan view orchestration

The shared scan view accepts a canonical configured-origin link, validates it
before network activity, then resolves its private identity and reads the record
through separate authenticated ports. Both responses must match the requested
dealer and the resolved record. The view exposes only a copied record and stable
busy/error state; it never exposes the token or link in presentation state.
Changing a scan or disposing the view aborts pending requests, clears prior data
and ignores late responses. A transient failure may retry the current link, but
malformed/foreign input and access denial clear it. Revalidation always repeats
resolution and the ordinary record read; a prior success never grants authority.

Login continuation contains only the canonical scan link, schema version and an
absolute expiry no more than ten minutes from capture. It is stored in the same
tab's session storage behind an injected port. Malformed, foreign-origin,
oversized, expired or unexpectedly extended entries are deleted and rejected.
Reading does not renew expiry; consuming removes the entry before use. Storage
failure fails closed. Cancellation and logout explicitly clear continuation.
The callback may choose only the fixed local `/scan` destination when a valid
continuation exists; the token is never part of the callback/provider URL.

Web scan entry removes the fragment before mounting the session shell or making
application API requests. It reuses the ordinary session restoration/rotation and
sign-out implementation. The shell clears continuation on explicit sign-out;
callback errors clear it too. An absent or invalid target renders a localized
error with cancellation, never a sign-in request or record lookup.

Same-document fragment changes consume and validate the new target and dispose
the prior view. Logout clears the in-memory target before local cleanup; cleanup
failure retains a retry screen with sign-in disabled, never the previous scan.

## Focused scan actions

The focused scan view offers unpublish and availability changes without opening
or flushing an editor draft. These actions never create a publication snapshot;
publication remains an explicit editor workflow. Each action reads the current
publication/record, presents saved identity and its proposed effect for review,
then rechecks revision before the existing command. Sale requires a valid amount
and currency; corrections retain the existing reason requirements. Cancellation
and Escape do not mutate. Conflicts require a new review. Lost responses expose
uncertainty and never retry the command automatically. Viewer-only users retain
record identification; denied action results do not grant new capabilities.
Confirmed changes refresh the focused record. Pending commands disable leaving
for the editor or starting a second scan refresh. Scope disposal suppresses late
results and discards reviews. The scan action controller serializes its own
interactions; it never constructs an artificial editor workspace or touches
recoverable drafts.

Action access denial revalidates the ordinary scoped scan and record read, clearing identification and cover immediately. Viewer identification returns only if that fresh read authorizes it. Automatic denial revalidation is bounded to once per explicit interaction to avoid a read-denial/remount loop; a subsequent explicit action or refresh starts a new opportunity. The retained viewer sees a localized action-denied notice.

Each explicitly opened scan link starts a new scoped resolution, including a repeat of the same link after a denied lookup; prior denied state is never reused as the new scan result.
