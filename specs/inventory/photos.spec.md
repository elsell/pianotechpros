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

## HTTP media contract and composition

Private routes are under `/v1/dealers/{dealerID}/inventory/{id}/photos`:
GET returns `{data:{record,photos}}`; POST accepts raw image bytes with
`Idempotency-Key` and required `expectedRevision` query parameter and returns that
state plus `{meta:{photoID,replay}}`. PUT `/order` accepts expectedRevision and the
complete `ids` list. PATCH `/{photoID}` accepts expectedRevision and altText.
DELETE `/{photoID}` takes expectedRevision as a query parameter. GET
`/{photoID}/image` returns the normalized JPEG bytes after current authorization.
All state responses include the current private record for revision reconciliation.
Photo DTOs expose only ID and alternative text, never storage or hash metadata.

The upload route passes a bounded stream to the application; framework decoding
must not consume source bytes before application authorization. OpenAPI declares
binary `application/octet-stream` input. The image processor validates actual
content regardless of the supplied MIME. The transport independently enforces
20 MiB on streaming reads, including chunked bodies; the server's existing read
and write deadlines remain in force. Invalid image content maps to 400 with
`invalid_photo`, excessive bytes/pixels to 413 with `photo_limit_exceeded`.
Framework JSON/parameter errors use the existing redacted machine-code envelope.
Private media/state/error responses have no-store, no-referrer and nosniff headers.
No public image URL, source filename, EXIF or credential enters a response.

A project-owned bootstrap registration composes the photo routes alongside the
unchanged generator-owned domain registry. It injects the same authentication,
SpiceDB, limiter, clock, audit and database capabilities and one shared processor
instance. Both server and OpenAPI entrypoints use this registration. Domain policy
remains in the inventory application; bootstrap owns no authorization decisions.

Configured browser origins must be able to preflight authenticated PATCH photo-description requests; unknown origins remain denied.

## Shared client wire adapter

The shared API client exposes photo state, binary upload, private image retrieval,
ordering, alternative-text edits and removal through generated OpenAPI paths.
Every request obtains the current opaque session. Upload accepts a byte array,
copies it before asynchronous credential acquisition and sends exactly those
bytes as application/octet-stream with the caller's stable retry key and original
expected revision. The adapter never automatically retries or changes intent.

State responses must validate the requested dealer/record, safe revision and
record attributes, plus at most 50 distinct nonempty photo IDs and bounded
alternative text. Upload metadata requires a valid photo ID and boolean replay;
a replay may refer to a photo subsequently removed from the current collection.
A fresh upload must appear in the returned collection. Invalid responses return
a fixed protocol error, never partial state. Known media error codes are preserved
without server details. Image reads use authenticated transport and return JPEG
bytes, never credential-bearing URLs; validate JPEG content type, nonempty bounded
bytes and JPEG signature before presentation. Fetch buffers the response on
platforms without streaming; the size check is not a streaming memory guarantee.
Optional cancellation propagates to fetch; aborted or failed network operations
do not imply successful writes or permit discarding retry intent.

## Protected selected-media storage

Selected source bytes are stored through the existing account-bound encrypted
recovery port, never as plaintext filesystem paths or browser storage. A scoped
media store splits each immutable selection (1 byte through 20 MiB) into 256 KiB
raw chunks encoded as hex, keeping each plaintext row below the existing 1 MiB
limit. Chunk keys bind user, dealer, capture/record scope, selection ID and index.
A small versioned manifest is written last; absence means no complete selection.
Reads validate every chunk and return all bytes or a fixed storage error, never
partial media. Metadata and ciphertext are not treated as authoritative image
validation; the server still normalizes and validates actual image content.

Before chunk writes, an injected SHA-256 port computes a whole-selection digest;
a size/digest commitment is persisted first and binds even an unwritten suffix.
Every retry validates that commitment, and completed reads verify the full digest.
Selection IDs are immutable. Retrying an interrupted write with the same bytes
may finish it; different bytes under that ID fail without replacing existing
chunks. Callers persist a selection reservation before writing bytes, retain that
reservation on uncertainty, and hold exclusive scope ownership across store
instances/tabs. The store serializes its own operations but does not implement
cross-tab leases. No unreferenced chunk can be intentionally created without a
durable reservation. The upload coordinator owns expiry and reservation cleanup.

Removal first hides the manifest, then attempts every bounded chunk slot even if
one deletion fails. A failed removal reports a fixed error so the reservation is
retained for retry; the commitment remains until all chunks are removed. Success means manifest,
commitment and all possible chunks are gone.
Account sign-out uses the existing vault generation invalidation and full cleanup.
The store snapshots input before asynchronous writes and never returns caller-
mutable aliases. It does not bypass authorization to open a recovered capture.

## Durable upload ledger

A separate encrypted, scoped ledger retains selected-media reservations and
upload outcomes. Its storage key is distinct from the text-draft journal. It
never expires or deletes a reservation implicitly: cleanup must first remove its
media, then explicitly forget a removal-state entry. The coordinator owns current
authorization, exclusive scope ownership and the seven-day cleanup policy.
A ledger instance serializes operations; all returned values are defensive copies.

A reservation records an immutable selection ID, byte size, stable upload key
and creation time before any selected bytes are written. At most 50 pending
selections and 100 MiB total source bytes are retained per scope. Marking ready
requires the media store to have completed its manifest. Before the first network
attempt, persist the exact target record ID and safe expected revision, then mark
attempted. Retrying an attempted entry preserves that target, revision and key.
Acknowledgement records the server photo ID before local cleanup. An uncertain
network outcome remains attempted across restart. A definitive conflict may be
recorded as conflict; only an explicit rebase resets it to ready with a new key.
Rebase preserves the assigned record ID and only permits a new revision; it cannot
redirect a selection to a different record.
Rejected image content remains rejected for inspection/removal, never automatic
retry. The ledger contains machine state only, no filenames, image data or errors.

Removal is explicit. Reserved, ready, rejected, conflict and acknowledged entries
may enter removal state. An attempted entry cannot be locally cancelled as if its
server outcome were known; it must first be reconciled by retrying the same
attempt. Forgetting is allowed only from removal state after media cleanup.
A failed or uncertain ledger write poisons that instance: subsequent operations
must reopen from durable storage before using state. Never dispatch a request
after a failed attempt checkpoint. Malformed or wrong-scope ledger data fails
closed and is retained for diagnosis/explicit cleanup, rather than silently
discarding potentially recoverable selection identities.

## Upload coordinator

Opening a coordinator authorizes before claiming the scope lease or reading local
recovery. It retains the lease until all queued work drains, including after
disposal. Recovery never automatically sends uploads. Each explicit operation
reauthorizes and reopens the ledger; a failed checkpoint cannot be followed by a
network mutation using stale in-memory state.

Selection persists its reservation, then media, then readiness. An interrupted
selection can resume only with its original ID, size and committed content.
Upload reads complete protected media, obtains a current record/revision only for
a ready entry, persists attempted intent, and reauthorizes immediately before
dispatch. Attempted retries reuse the original target, revision, key and bytes.
Validate acknowledgement target/ID, persist it, then enter removal state, delete
media, and forget the reservation in that order. Cleanup failure retains the
durable phase for retry without another upload. Only definitive upload conflicts
or content rejections change attempted state; transient or malformed responses
remain uncertain. Rebase is a separate explicit action and never sends itself.

Activity loss or disposal hides snapshots, prevents subsequent dispatch, and
suppresses late result disclosure. It need not undo a request already sent;
the durable attempted entry handles its uncertain outcome. Error messages are
fixed machine codes, without server/platform details. Lease, authorization and
session identity remain injected platform responsibilities. The selected-media retention policy below applies to recovery and dispatch;
platform capture integration remains a separate delivery requirement.

## Selected-media retention

Local selections expire seven days after their original reservation. Selection
completion, upload retries and conflict rebase never extend that deadline. On
authorized open and before each explicit operation, the coordinator checks the
injected clock and removes expired local media under its exclusive lease.
Invalid or backward-before-creation clocks fail closed without dispatch/deletion.

Expiry first persists removal state with an expiry marker, then removes every
media chunk/commitment, then forgets the reservation. A failed cleanup retains the
marker for retry after restart. Expiring an attempted upload marks its server
outcome uncertain: this is local retention, never a remote cancellation or delete.
No upload, target lookup or server mutation is issued to expire local bytes.
The coordinator exposes per-instance counts of expired selections and uncertain
outcomes for localized notices; these counts are not a persistent audit history.

An upload also rechecks the deadline immediately before dispatch, including after
media hashing, target lookup and final authorization. Expiry during a request
already sent cannot undo that request; normal acknowledgement/recovery applies.
Permission rejection prevents recovery disclosure and further network mutation;
sign-out retains its separate full-vault cleanup behavior.

## Shared photo workspace and initial web presentation

The photo workspace composes the selected-media coordinator with the text
workspace's media mutation queue. New remains lazy: before server creation,
persist a selection reservation in the capture intent and protect its bytes under
the immutable capture-key scope. Serialize selection admission with creation.
Once the record exists, import that reservation into its upload ledger before
removing the capture intent. The record ledger references the original protected
media scope; no second image copy or temporary unowned object is needed. Import
preserves selection ID, retry key, size and original retention timestamp. A bounded
immutable import receipt is committed atomically with the reservation, retained
after upload/discard cleanup, and makes retry after lost handoff acknowledgement
idempotent even if the record already consumed the upload. Mismatched imports fail
closed. Current record authorization and its photo lease precede import. Source
bytes are validated before first import; an exact existing receipt needs no source
read, since acknowledged cleanup may already have removed the source. Only the
record-scoped coordinator may upload, expire or clean up an imported selection.
The capture journal's durable record pointer remains until import acknowledgement;
reopening that capture retries handoff without recreating the record. Opening the
record may safely use its imported reservation as soon as the atomic ledger write
commits. Before local protection completes, the UI reports work in progress, not a
saved photo. Opening or refreshing
recovery never dispatches an upload. An explicit selection uploads after durable
protection; retry reuses its saved intent. Conflict retries require explicit
rebase. Uncertain attempts cannot be silently removed.

Photo workspace operations are serialized. Scope changes and disposal hide
photos and recovery immediately, suppress further dispatch, and retain the media
lease until already-started work drains. A new selection copies bytes before any
asynchronous work. No filenames, local paths or credentials enter workspace state.

Reference edits (order, cover, description and detach) run inside the text media
queue. Fetch the current authorized collection and compare its complete IDs,
order and alternative text with the collection the user acted on before applying
the command. Intervening text-only revision changes are allowed; changed photo
collections require review and explicit repetition against the refreshed display.
Network uncertainty is displayed and followed by a read, never an automatic
mutation retry. Authorization loss hides all private state. Do not report success
for a failed mutation merely because the subsequent read succeeded.

The web editor places photos before text fields. Camera and library use native
browser file selection, accept JPEG/static PNG within 20 MiB, and preserve the
text draft on unsupported formats, denied access, cancellation or failure. The
server remains the image-content authority. The first photo is visibly the cover;
keyboard-accessible move/cover commands, alternative text, confirmation before
removal and a dismissible preview are required. Private image bytes become scoped
object URLs only in a browser adapter and are revoked on replacement/unmount.
Progress, recovery actions, expired-selection notices and errors use the shared
locale catalog. Native presentation will use platform photo selection and sheets;
web completion does not establish native interaction acceptance.

Private web renditions require `img-src 'self' blob:` in CSP; no remote image
origins or data URLs are allowed. Other CSP transport/script/object restrictions
remain unchanged. File selection and object URL construction stay in the narrow
browser media adapter; it receives no credentials and acquires no transport.
Interrupted local discard cleanup is a distinct state from acknowledged upload;
its retry repeats local cleanup without dispatching an upload.

Import receipts preserve the original retry key as provenance, independently of
an entry's current retry key after explicit conflict rebase. Loading compares
immutable source identity, size and timestamp; it must not reject legitimate
rebased attempts. Pre-record media uses the same fixed seven-day retention as
record uploads. Expired capture journals invoke validated-payload media cleanup
before deletion, retaining the journal if cleanup fails. Active capture text
checkpoints cannot renew the photo's original expiry. Expiration never removes
source bytes already owned by an imported record reservation; that record's
coordinator is responsible for its cleanup.
