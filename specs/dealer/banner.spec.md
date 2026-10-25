# Dealer showroom banner

## Product and provenance

DL-03 includes choosing, previewing, replacing and removing one showroom banner
on web, iOS and Android, with editable alt text and an intentional fallback.
The legacy owner's banner upload/remove and published-showroom delivery behavior
was inspected read-only. No legacy implementation, history, credentials or
infrastructure configuration is imported.

Banner changes are explicit owner settings commands. Explain before confirmation
that a published showroom will display the replacement immediately. Selecting a
file does not upload it; cancellation retains the current banner. Show the whole
selected image in review; public presentation may crop responsively with a
consistent centered focal point. Do not require a banner for publishing a shop.
Alt text belongs to the profile (240 Unicode characters); the existing profile
form edits it. If it is empty, clients localize a dealer-name fallback instead of
storing a presentation sentence in the API. Removal retains editable alt text so
a later replacement does not silently discard profile work.

## Identity, commands and persistence

A banner is one current, ready, dealer-scoped image with an opaque asset ID,
dimensions, SHA-256 digest and creation time. Domain evidence contains no bytes,
storage paths, URLs, account data or credentials. Absent evidence is distinct
from an invalid or partially populated asset. Keep banner evidence separate from
ordinary profile attributes; profile updates cannot attach or replace an image.

Upload requires the reviewed dealer revision and a principal-scoped idempotency
key. Decode and re-encode bounded source media through an injected processor.
The stored JPEG has stripped metadata and corrected orientation. Accept JPEG,
PNG and WebP for legacy parity; reject unsupported/malformed media and excessive
source bytes, dimensions, decoded pixels or output bytes. Preserve the prior
banner on rejection, processing/cancellation failure, revision conflict or audit
failure. Share the bounded decoding concurrency gate with inventory media.
Do not introduce URLs for the server to fetch.

The persistence transaction locks current owner membership and dealer revision,
validates processed media and evidence, replaces the current asset, advances the
dealer revision once and appends its structured audit event atomically. It must
not orphan prior bytes or delete them before a successful replacement commits.
A retry with the same key, content digest and expected revision returns current
state plus the original uploaded asset ID without another mutation. A different
intent using that key conflicts. A replay never restores a banner replaced or
removed later. The client distinguishes that later state from acknowledgement
of its original image. Confirmed removal is revision-bound and atomic with its
audit; removing an absent banner does not fabricate a successful mutation.
Uncertain removal requires an explicit refresh before another reviewed command.

## Authorization and delivery

Authenticate and consume the configured principal audit budget before protected
repository access or image processing. Reads require active granted membership
and fully consistent dealer:view. Upload/remove require the founding owner,
active granted owner membership and dealer:manage_profile. Editors and viewers
cannot change banners. Recheck identity, session and SpiceDB after expensive
processing, then recheck persisted membership inside the commit transaction.
Missing, revoked and cross-dealer reads/commands have indistinguishable denials.
Permission, persistence and audit failures fail closed. Bound and audit denials;
successful private state/image reads are audited before returning data.

Private delivery requires both dealer ID and the current asset ID. Public
delivery requires a currently published showroom slug and the current banner
ID in one scoped transaction; stale, removed, cross-showroom and hidden assets
return the same not-found result. Do not expose original media, checksums,
ownership, audit events, private URLs or unreferenced bytes in public DTOs.
Public profiles expose only the current asset ID and dimensions needed to render
it. Send no-store and nosniff on private and public banner responses, including
errors, so hiding a showroom cannot be bypassed by ordinary browser caching.
Never redirect a banner request to an unrestricted storage URL.

## Client interaction and verification

Use the shared catalog for all copy, feedback and accessibility labels. Selection,
upload progress, cancellation, retry and conflict must remain explicit. Never
silently retry a removal or upload different bytes under the same intent. Revoke
object URLs/native temporary files on disposal; account/shop changes clear private
selection and suppress late responses. Session rotation preserves the mounted
workflow; only terminal session rejection discards it. Keep the latest authorized
banner visible during a failed replacement, but clear it on denied access.
Public image-load failure renders the normal branded fallback without looping
requests or exposing a broken-image placeholder.

Native selection uses platform photo-library interaction and a focused preview/
confirm sheet, with keyboard avoidance for any text input, accessible actions,
cancellation and background interruption handling. No signing credentials or
GitOps hooks are needed for this slice.

Acceptance includes domain scope/corruption tests; real database replacement,
removal, replay, races, revocation and audit rollback; authenticated HTTP boundary
tests; private/public byte delivery and current visibility checks; all three
clients' selection/cancel/upload/retry/replace/remove/fallback journeys; and
native permission, interruption and accessibility interaction. Build/export
success alone does not complete DL-03.

## HTTP contract

Private routes are GET/POST/DELETE `/v1/dealers/{id}/banner` and GET
`/v1/dealers/{id}/banner/{bannerID}/image`. POST consumes a bounded binary
body only after policy succeeds, with `Idempotency-Key` and
`expectedRevision`; DELETE requires `expectedRevision`. State envelopes
contain `profile` and nullable `banner` (ID, width, height). Upload metadata
contains `bannerID` and `replay`. Public GET
`/v1/showrooms/{slug}/banner/{bannerID}` uses the coordinated source limiter.

Shared owner orchestration stores an immutable copy of selected bytes and the
reviewed revision. Selection and cancellation never write. An uncertain upload
can retry only the same bytes, key and revision; choosing different media requires
refreshing current state first. A conflict requires refresh and a fresh explicit
review before a new intent. An uncertain removal cannot be resubmitted until
refresh, a new removal review and confirmation. Returned replay metadata may
acknowledge an image no longer current; report that distinction without restoring
it. Background interruption aborts the local request and preserves uncertainty.
Disposal clears private state and prevents late results from updating a new shop.

Native banner selection uses the shared protected system-picker broker with an
explicit `banner/<dealerID>` target. Restoring a picker result never uploads it.
The user explicitly continues to preview; processing releases owned picker and
render files, and selection copies bytes into the scoped editor. A result for a
different account, shop or inventory draft cannot be consumed here. Uncertain
picker processing offers discard/reconciliation, not a second implicit consume.
If scope is lost while committing a local selection, or preview construction
fails, discard that local selection so it cannot later be confirmed without a
successfully constructed review. Erase temporary processed bytes on every exit.

Browser file reads and bounded raster preview decoding belong in the existing
browser photo-media adapter. Components own only the returned preview lifetime;
the adapter never accepts remote image URLs or performs API transport.
