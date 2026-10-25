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
