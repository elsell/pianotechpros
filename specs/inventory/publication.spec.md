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

## Durable publication boundary

A persistence-facing publication state contains only the allowlisted public
snapshot, explicit visibility and last applied lifecycle revision. Export and
restore clone nested values. Restoration validates canonical fields, photo
uniqueness/order/alternative text, safe revisions and legal visibility/status
combinations; malformed storage fails closed rather than normalizing corruption.
A publication revision begins at two and cannot exceed its applied revision.
Both revisions must fit the application's safe-integer range. Hidden snapshots
retain their photos and content and never become visible merely by restoration.
The derived display title may contain the full make/model pair (321 code points),
while manually entered titles remain limited to 240 in the private draft.
Persistence adapters must separately verify that the restored record/dealer
identity and applied revision match the scoped current inventory record. State
restoration is neither authorization nor evidence that media exists; publication
creation still requires the scoped media repository. This boundary alone exposes
no publication endpoint.

## Transactional persistence

Publish, unpublish and lifecycle transitions lock dealer authority and the scoped
record, recheck active membership/account state, and commit the new record
revision, private history and successful audit in one transaction. Publication
reads use the same scoped authority and audited read transaction. Application
policy must separately enforce session authentication, SpiceDB and rate limits
before calling these ports; this persistence slice alone enables no routes.

Immutable publication snapshots are keyed by record and publication revision.
Each retained snapshot has immutable relational photo references to the same
record/dealer's assets, independent of editable draft references. A separate
current pointer holds the publication revision, applied lifecycle revision,
visibility and availability overlay. Foreign keys bind snapshot and applied
revisions to retained history. Runtime credentials cannot update/delete/truncate
snapshots or retained photo references, and database triggers protect immutability.
The current pointer may change only within the audited command transaction.

Publishing obtains ordered ready-photo evidence from storage under the record
lock. Unpublish preserves the snapshot and references. A sale/correction updates
only the availability overlay, preserving public content and hidden status.
Private edits do not touch publication. History for these commands includes the
private domain event (including sale price/reason), next record and publication
state; none is sent to public clients. Audit payloads contain no sale price,
reason, attributes or image data. Failed audit/history/snapshot writes roll back
all record and publication changes. Foreign identifiers, stale revisions and
revoked local authority cannot mutate or expose publication state.

Migration rollback fails closed while retained publication snapshots exist; it
must not discard publication history or the assets it protects.
