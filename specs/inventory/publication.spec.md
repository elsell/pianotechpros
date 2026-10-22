# Explicit inventory publication

Publish is a manual, revision-checked command. It validates the private attributes
and returns a distinct public snapshot, next private revision and history event
for atomic persistence with audit. A draft becomes available when published;
available, reserved and sold may publish/republish. In-service and archived records
must first undergo an explicit lifecycle correction. Voice never calls publication.

Readiness names missing form, condition, title and uploaded photo. A custom title
or a nonblank manufacturer supplies a display title; stock number alone is not
sufficient. Photo evidence comes from the scoped media repository, never from
client-supplied readiness flags. Every referenced photo must be ready and belong
to this record and dealer. Preserve the supplied cover/order; require 1–50 unique
photo IDs and bounded valid UTF-8 alternative text (240 code points). Do not place
storage keys, upload credentials or arbitrary image URLs in the snapshot.

The public snapshot is an explicit allowlist: record/dealer ID, publication
revision, stock/title, featured, physical form, player flag, condition, make/model,
manufacturing precision, size/finish, description, visible asking price, and photo
IDs/alternative text. Serial, acquisition cost, private notes, storage location,
sale price, scan tokens and internal history have no fields in this projection.
Hidden or absent asking price yields no price. Copy all pointer/slice values on
publication and on public reads; draft edits or a consumer mutating a returned
view must never change the snapshot.

Public availability is a separate overlay on the published snapshot. Applying a
newer lifecycle revision can update availability to available/reserved/sold while
preserving the old public attributes and photos. Draft/in-service/archive hides
publication. Returning from a hidden lifecycle state does not automatically
republish. Reject foreign record/dealer identity and stale or duplicate overlay
revisions. Ordinary private edits do not update the public snapshot or revision.

Unpublish is an explicit revision-checked manual command that retains the private
record, prior snapshot and photo references while hiding the listing. Subsequent
sale/correction commands do not republish it. Republishing creates a new snapshot;
previous snapshots/history remain append-only in persistence. Public delivery
must check current visibility and owning dealer showroom visibility. Media
retention must honor published and historical references independently of the
working draft. No public HTTP route or storage adapter is enabled by domain-only
implementation; integration must atomically persist revisions, visibility,
history and audit with authorization and rate limits before exposure.
