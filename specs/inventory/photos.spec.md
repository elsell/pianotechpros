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
