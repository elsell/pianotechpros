# Private inventory photos

Status: implementation in progress; persistence, upload and device acceptance required.

A record has an ordered private collection of at most 50 ready photos. The first
photo is the cover. Only server-validated evidence from the scoped media repository
may be attached. Photo, dealer and record identity must match and processing must
be complete. Clients cannot assert readiness or supply storage keys or URLs.
IDs are trimmed nonempty valid UTF-8, at most 128 runes. Alternative text is trimmed
valid UTF-8, at most 240 runes; empty text is allowed during capture.

Attach, remove, reorder and alternative-text commands use the current record
revision, authenticated actor and injected clock. Actual changes advance the
revision once and produce private history naming `photos` as the changed field.
Stale writes conflict; unchanged commands return no-change. Commands preserve
attributes, sale state and publication. The application must atomically commit
collection, record, history and audit after membership and SpiceDB authorization.
Domain commands alone do not supply authorization or persistence.

Reorder supplies every current ID exactly once. Cover selection moves an ID to
first position. Removal detaches only from the draft and never deletes bytes.
Publication snapshots retain their own ordered references and alternative text.
Garbage collection must prove no draft or retained publication references an asset.
Collections and returned evidence are defensive copies. Persisted collections
are validated for scope, readiness, uniqueness and limits before use.

## Required upload delivery

New reuses durable lazy creation before uploading without requiring text. Camera
and library stay in the editor, with independent progress, cancellation and retry.
Partial failures preserve photos and text. Permission denial retains alternatives.
Accessible move commands accompany drag reorder; preview returns to editor position.

Upload adapters must bound bytes, dimensions and decoded pixels, verify actual
image content, normalize orientation and strip private metadata. Arbitrary uploads
must never be served as HTML or SVG. Source media is private. Private reads require
current record authorization and audit; public reads require visible publication
references. Client filenames, MIME and URLs are untrusted. Durable scoped retry
identities prevent duplicate attachment; incomplete objects cannot become ready.
Concrete formats, limits and adversarial adapter tests precede an upload endpoint.

## Image processing port and initial adapter

The image processor accepts a context and bounded stream, and returns freshly
encoded JPEG bytes, dimensions, byte count and SHA-256 digest. It never accepts a
filename, caller MIME, storage key or URL. JPEG and static PNG are initial server
inputs. Native capture/library adapters must export compatible JPEG (including
HEIC library selections) before upload; web reports unsupported formats without
losing the draft. HEIC conversion and device acceptance remain required client work.

Limits are 20 MiB input/output, 10,000 pixels per axis and 25 million decoded
pixels, checked before full decoding. The processor admits at most two concurrent
operations per instance; bootstrap must share one instance. Request-body deadlines
and authenticated upload rate/size limits remain required at the HTTP boundary.
Context cancellation prevents admission and is checked during read, transforms
and encode; Go codec calls themselves are synchronous and cannot be preempted.

JPEG EXIF orientation (all eight transforms) is applied to pixels. Malformed or
ambiguous orientation is rejected. PNG must be static; animated PNG is rejected.
PNG EXIF orientation is interpreted with the same bounded parser. Encode a new
JPEG at quality 90, flattening transparency over white. No original EXIF, GPS,
comments, thumbnails, text chunks, trailing bytes or other metadata is copied.
The source bytes are never a public rendition. Color-profile management is not
provided by this adapter; native exports should use sRGB. Processing failures
return fixed machine-readable errors and never a partially ready rendition.

Dimension preflight follows the [Go image security guidance](https://pkg.go.dev/image#hdr-Security_Considerations).
PNG chunk framing and EXIF payload follow the [PNG specification](https://www.w3.org/TR/png-3/#11eXIf).

## Transactional media persistence

The first durable media adapter stores normalized JPEG bytes in PostgreSQL, in the
same transaction as attachment, record revision, history and audit. This avoids a
partially uploaded object becoming ready or an object-store/database split commit.
Original uploads are not retained. This is an explicit initial storage choice;
an external object-store adapter may follow with a separately specified lifecycle.

Assets are immutable and scoped to dealer/record. Runtime privileges allow asset
insert/read only, with a database guard against byte replacement or deletion.
A separate ordered reference table owns draft position and alternative text,
with a composite foreign key preventing references to another record's assets.
Publication will reference the immutable asset identity, not the draft position.
Private photo reads require current active draft attachment. Removed assets are
retained for publication/history and have no public serving route by themselves.

Upload receives a processor-produced JPEG, verifies digest, dimensions and bounds,
and uses an actor/record-scoped non-whitespace printable ASCII idempotency key (16–128 bytes). Reserve
that key with a hash of the normalized bytes and expected revision. A retry with
matching intent returns the original asset ID and current record/photo state,
without reattaching a subsequently removed photo or adding revision history.
Different bytes or expected revision with the same key conflict. Candidate IDs
on retries are ignored. Membership is rechecked under the dealer authority lock;
all callers must first enforce SpiceDB and the configured limiter.

An actual upload attaches once using optimistic record revision, inserts immutable
bytes, advances record revision, and commits photo history plus matching audit
atomically. Audit failure rolls back the bytes, reservation and attachment. Reads
and replay responses also commit audit before returning data. Database failures
return no partially populated response. Existing collection order must be dense,
unique and scope-valid before any mutation. Stored rendition digest/dimensions are
validated before returning bytes. Storage alone does not expose an upload route.

## Draft photo edits in persistence

Reorder, alternative-text edits and removal use separate typed repository methods
and require the record's current revision. The repository reloads and validates
current references under the same dealer-authority and record locks used by
uploads. Changes replace only draft references, advance the record revision and
commit the resulting photo-state history with audit in one transaction. Image
bytes are neither rewritten nor deleted. Reference positions remain dense from
zero after removal. Failed audit or history insertion restores the entire prior
order, alternative text and revision.

An authorized no-op at the current revision returns current state with a read
audit and adds no history revision. A stale expected revision still conflicts,
even if the requested order or text happens to match. Uncertain client mutations
must read and reconcile the current state rather than silently retry against a
newer revision. Unknown IDs, incomplete/duplicate reorder lists and invalid text
are rejected. Revoked/view-only users cannot edit; a record/dealer mismatch fails
closed. HTTP policy, structured errors and client conflict UX remain required.

## Authorized photo application commands

All photo commands use opaque application authentication, active confirmed local
membership, SpiceDB permission checks and the coordinated principal limiter before
repository access. List/image reads use inventory-read capability; upload and
reference edits use inventory-write capability. Repository denials after an
initial grant emit a collection-scoped denial audit without disclosing an ID.
Failures return empty results. Successful results must match requested record and
dealer scope, and returned collections must validate before presentation.

Upload first validates IDs, non-whitespace printable ASCII retry key and expected revision, then reads
the authorized record/photo state before consuming any source bytes. That read is
audited. Only an injected image processor can create the rendition. After
processing, reauthenticate and repeat membership, SpiceDB and principal limiting
before storage; account identity and owner scope must be unchanged. Cancellation
or any dependency failure prevents storage. Repository authority rechecks remain
necessary inside the eventual transaction. Processing therefore uses two policy
checks per upload, accounting for its read and mutation audit-producing phases.
A valid retry is not rejected merely because the preflight sees a newer revision;
the storage reservation distinguishes a replay from a new stale write.

Photo commands are separate from HTTP serialization. No camera/library, upload
route or production composition is implied by the application service alone.
