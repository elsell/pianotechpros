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

## Authenticated HTTP commands

The existing inventory registration exposes GET `/{id}/publication`, POST
`/{id}/publish`, POST `/{id}/unpublish` and POST `/{id}/lifecycle` beneath the
scoped dealer inventory path. Reads require `view`; publish/unpublish require
`publish_inventory`; lifecycle commands require `manage_inventory`. Both local
membership and SpiceDB must allow the exact operation, and the principal audit
limiter runs before persistence. The repository rechecks the corresponding local
capability under its lock. All routes require opaque application sessions, conceal
foreign/inaccessible IDs and return no-store/no-referrer responses.

Every command requires a safe positive expectedRevision. Lifecycle accepts only
status, optional exact salePrice and correction reason; it rejects unknown fields,
voice/source flags and unrelated attributes. Sale currencies use the existing
explicit supported-currency policy. Publish accepts no photo readiness or asset
payload: only stored scoped evidence is authoritative. GET and successful commands
return the private record plus nullable publication state (visibility, applied
revision and explicit public snapshot). Hidden snapshots remain available only
through this authenticated view; this is not a public delivery endpoint.

Readiness failure is HTTP 422 with code `inventory_not_ready` and a `missing`
array containing only stable form/condition/title/photo identifiers. Clients own
localized presentation. Other input failures use the existing machine codes;
stale revisions return 409. Errors never echo private attributes, sale prices,
correction reasons, credentials or dependency diagnostics. Generated OpenAPI and
TypeScript contracts must include all routes, nullable values and the readiness
code. Existing generated registry composition stays generator-owned.

## Shared client transport and review

The generated-client adapter owns publication transport for both presentations.
It validates record/dealer identity, safe revision ordering, current availability,
explicit visibility, nullable publication and the exact public-field allowlist.
Malformed money/dates, duplicate or oversized photo collections, unexpected
private fields and inconsistent command acknowledgements fail as protocol errors.
Command responses must advance exactly the submitted revision and match the
requested publication/availability effect. Requests snapshot mutable amounts
before credential retrieval yields. Abort signals reach the authenticated
transport, and errors retain only stable codes and validated readiness keys,
never server diagnostics or echoed input.

Shared review orchestration must load current state through the editor's serialized
mutation boundary, present an explicit command review, and submit at most once on
confirmation. A revision change between review and confirmation requires renewed
review rather than silently publishing newly saved edits. Uncertain responses
never trigger automatic command retry or claim success; an explicit refresh reads
current state. Account/record changes and disposal hide private state and suppress
late responses. Platform presentations remain responsible for accessible native
confirmation interactions and localized copy.

## Web publication interaction

The editor offers a separate publication section once a private record exists.
It shows current availability and whether a retained snapshot is visible, hidden,
or absent. Publish and republish open an accessible modal review of the saved
public attributes and ordered current photos; internal notes, serial, location,
acquisition cost and sale price are excluded from that public preview. The modal
explains that later private edits do not change the snapshot. Current photos and
record state must agree on revision before a review is offered.

Sale entry uses exact decimal-to-minor-unit parsing, supported currency selection,
and a required sale amount. Other status changes never carry a sale amount.
Corrections from sold or archived, and moves to draft, require a bounded reason.
All lifecycle changes use explicit review and confirmation; the review distinguishes
private sale information from the public availability overlay. Unpublish explains
that the existing snapshot is retained but hidden. Cancellation and Escape close
a review without dispatch. Busy operations protect navigation and prevent a second
submission. Conflicts require renewed review; uncertain results offer refresh,
never automatic retry. Readiness errors identify only localized missing fields.
Localized success is shown only after the command and editor refresh complete.

Monetary review formatting preserves exact minor units through the largest safe
integer; locale currency presentation must not round through floating-point major
units. A validated successful mutation response is not reclassified as a rejected
command because an optional subsequent photo refresh observes a newer revision.

Publish review is unavailable while the editor has restored, invalid, conflicted
or uncertain private changes. Explain that the draft must first be explicitly
saved or resolved; do not publish older saved attributes while recovered edits
are presented as the working draft. Other lifecycle commands may preserve an
unfinished draft through the existing serialized mutation boundary.

The public photo review shows ordered pages of at most six authorized image
previews at once. Changing page disposes prior previews; never decode the entire
50-photo collection simultaneously. Each new review starts at the first page.

## Native publication interaction

Native clients use one full-screen modal task for the longer public snapshot
review or sale/correction task, with a safe-area header, explicit Cancel, scrollable
content, and a reachable confirmation action. Do not layer a second modal over
review. Status/currency choices are labeled inline radio groups within the task;
selection collapses the group. Android Back and accessibility escape cancel before
dispatch; while a command is pending, dismissal and parent navigation wait for its
result. All text scales with the system font and uses semantic theme colors.

The same saved-draft protection, exact money parsing/formatting, private-field
allowlist, six-photo bound and revision-reviewed command semantics apply on native.
Sale/correction input survives a rejected operation in memory; it is never written
to recovery storage. Late account/record responses cannot reopen a modal or reveal
private review state. Separate native request adapters use committed session
credentials, preserving rotated credentials after an old-token rejection.

Native publication is not accepted by TypeScript or Metro export alone. Verify
Android Back, iOS modal cancellation, keyboard avoidance, screen-reader focus,
large text, rotation, phone/tablet layout, interruptions and backend journeys on
native builds before marking parity complete. Modal pattern reference:
https://developer.apple.com/design/human-interface-guidelines/sheets

## Sale-entry defaults

The first selection of Sold in a private record's current action entry seeds the
sale amount and currency from its saved asking price, including a hidden public
asking price. This is a private convenience, not publication or a sale command.
Use exact minor units and the client's decimal separator, including zero-decimal
JPY and an explicit zero price. An absent or invalid asking price leaves amount
blank; it must never manufacture a zero sale. Manual amount/currency edits,
including clearing the amount, survive switching statuses and cancelled reviews.
Do not overwrite them after a refresh or a changed list price. Confirmed change,
access denial or disposal resets this entry state. Explicit sale review and
confirmation remain mandatory, and the selected sale price stays private history.


## Native readiness before confirmation

The native publish review must fetch a fresh authorized, saved record and photo
collection through the existing serialized workspace before opening confirmation.
Check piano type, condition, title-or-make, and at least one ready photo. Missing
requirements produce no confirmable review and issue no publication command.
Show localized actionable requirements and take the user to the first missing
editor control: open the type/condition choice, focus title, or reveal Photos
without opening a camera or requesting permission. Selecting another requirement
uses the same navigation. Cancellation, denial and scope changes clear guidance.
The API remains the final authority; server readiness rejection uses these same
safe field identifiers and navigation. Saving and checking readiness never publish.
