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
