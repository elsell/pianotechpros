# Dealer identity, profile and access

## Product contract

A dealer is the explicit shop boundary for private inventory, media, inquiries
and staff. Its immutable ID and founding owner user ID are distinct from its
editable public profile. A profile has name, globally unique lowercase slug,
email, optional phone/website/address, tagline/description, appointment/delivery/
warranty/service notes, banner alt text, accent color and showroom visibility.
Banner object storage is a separate media command, not an arbitrary client URL.

Slug syntax is ASCII lowercase letters/digits with single internal hyphens,
1–80 characters. Trim outer whitespace; reject rather than silently rewrite
case or punctuation. Name is 1–200 Unicode characters. Email is an exact mailbox
address (no display-name syntax), at most 320 characters. Optional website must
be an absolute HTTPS URL with a host and without credentials, at most 2048
characters. Optional fields
accept empty values; name/slug/email do not. Accent is exactly `#` and six hex
digits. Limits: phone 32, tagline/banner alt 240, description 4000, street lines
200 each, city 100, region 64, postal code 20, and each trust note 2000 characters.
Reject invalid UTF-8. Public DTOs explicitly select profile fields; ownership,
membership, internal IDs and audit history are never public profile attributes.

## Authorization and persistence

Creating a shop requires an application session. The caller becomes the founding
owner atomically with the profile, initial owner membership, owner relationship
outbox entry and audit event. A user can join multiple dealers; list only explicit
memberships and require a selected dealer for subsequent work. Creation retries
use principal-scoped idempotency, and slug uniqueness is enforced in PostgreSQL,
not only a preflight query. No partially authorized shop is returned as ready.

SpiceDB is the permission decision point. Relations are owner, editor and viewer.
Owner manages profile/settings, inventory/publication, inquiries and membership.
Editor manages inventory/publication and inquiries, but not settings/membership.
Viewer reads private inventory/profile/history, but cannot mutate or read buyer
contact details. Private reads require an explicit persisted active membership
and a successful SpiceDB check; neither gate substitutes for the other.
Revocation denies immediately in the membership transaction, even while removal
from SpiceDB is queued. Grants are unavailable until relationship publication is
confirmed. Dependency failure never grants access. Bootstrap resource creation
is the sole case without an existing dealer permission; it cannot name another
owner or preexisting dealer ID supplied by the client.

Repository reads require the acting user ID and filter by active membership.
All authenticated reads, denied decisions and mutations emit bounded audit events
using the principal limiter. Mutation, audit and authorization outbox commit in
one transaction. Keep domain entities independent of GORM/HTTP/SpiceDB; injected
ports carry these capabilities. Preserve optimistic revisions for profile and
membership writes so concurrent updates cannot silently replace each other.

Staff invitations are dealer-membership invitations for already provisioned
application users; they do not bypass the platform's administrator-only account
provisioning invitation policy. Owner-created, one-time, bounded-expiry tokens
are stored as digests, consumed by an authenticated user, and never logged or
audited as secrets. Acceptance binds an immutable user ID, not an email role.
Removal/role changes cannot demote or remove the founding owner. Ownership
transfer is a separately specified future operation, not generic profile update.

## Acceptance and incremental implementation

DL-01 through DL-04 remain open until complete API, web and native journeys pass.
First implement validated profile values and generate the domain's repository,
HTTP and composition boundaries. Generated routes must retain their fail-closed
policy until the full authorization/membership/outbox protocol has adversarial
tests. No endpoint may return profile data merely because value validation works.

Tests cover optional fields, Unicode limits, malformed slugs/emails/URLs, immutable
identity, duplicate slug races, idempotency collisions, revoked/pending membership,
cross-shop IDs, role escalation, last-owner preservation, expired/consumed tokens,
authorization/audit failures and successful permitted journeys. Client forms use
shared localized errors, native keyboard/picker interactions and recoverable edits.

## Typed permission contract

The `dealer` SpiceDB object uses its immutable dealer ID directly. Its `owner`,
`editor` and `viewer` relations accept only `user` subjects. Permission names are:
`view` (all three roles), `manage_profile` and `manage_members` (owner only),
`manage_inventory`, `publish_inventory` and `manage_inquiries` (owner or editor).
There is no generic delete permission. Neither an unrelated dealer relation nor a
relationship on the legacy generic `resource` object grants dealer access.
Removing a relationship removes its permissions under fully consistent checks.
The API uses the existing runtime capability proxy; the expanded schema does
not add schema-write capability to the runtime credential. Real SpiceDB tests
must cover the role/permission matrix, cross-dealer isolation and revocation.

## Private profile reads

A read requires an opaque application session with a nonempty user ID and the
`api:user` scope. Authenticate before checking configuration, then consume the
configured principal audit budget before persistence or authorization work.
GET checks active persisted membership and fully consistent `dealer:view`;
missing, revoked and unauthorized dealer IDs all return the same not-found code.
Denials are audited to the acting user's visibility, without exposing the shop
owner. Permission dependency failures fail closed and emit a failed decision.
A successful read is returned only after its audit append succeeds.

Lists read at most 100 membership-scoped candidates at a stable creation-time
snapshot, then check `dealer:view` for each. Pending/denied candidates are omitted
and each denial is audited against the collection rather than a server-discovered
dealer ID. Supplied-ID GET denials may record that supplied ID. A dependency or audit failure discards the entire
response. Pagination advances over candidates, including omitted candidates,
so an empty page can have a continuation cursor. Authenticated encrypted cursors conceal candidate IDs and bind the actor,
dealer domain, snapshot and last candidate; another actor or tampering is invalid.
List success is audited once for the collection. Membership administration remains closed until its separate policy and outbox
protocols are implemented. Creation and profile updates follow the protocols below.

## Profile update command

PUT replaces editable profile attributes and requires `expectedRevision >= 1`.
Responses expose `revision`. An authenticated owner needs active membership and
`dealer:manage_profile`; editors/viewers cannot update settings. Missing, revoked
or disallowed dealer IDs return not-found and record a denial before any revision
comparison. Invalid values return the machine-readable bad-request code. Read
current state, check permission and founding ownership, preserve immutable ID,
owner and creation time, then submit the caller's revision to the repository CAS.
Stale revisions and duplicate slugs return conflict without overwriting data.
The repository rechecks active owner membership under its write transaction and
commits the update plus audit together. Return the incremented revision only on
success. Omitted optional text fields clear their value; they are not required or
nonempty in the HTTP input schema. Domain length and format rules still apply.

## Creation and retry protocol

POST requires a printable ASCII idempotency key of 16–128 bytes. Normalize and
validate attributes, hash their canonical JSON, then atomically create the shop,
owner membership, creation audit, idempotency reservation and claimed owner
relationship outbox event. IDs and owner come from injected server capabilities.
The request publishes the owner relationship under the resource serializer,
renewing its bounded lease before a call whose timeout is shorter than the lease.
Outbox completion and its authorization-applied audit commit together. A write,
audit, lease or serializer failure returns no profile; the persisted event remains
for recovery by the existing background worker after lease expiry. Synchronous
publication failures record an authorization-failed audit; automatic retries and
dead-letter limits remain owned by the configured background worker.

An identical retry returns the current profile for the original shop (not a new
shop or a frozen creation snapshot). Changed attributes with the same key conflict.
Retry claims an outstanding owner event when available; another worker's lease
returns authorization-pending, and a dead-letter returns authorization-dead-lettered.
A later non-creation relationship event is left for the background worker. Only
an active owner membership plus fully consistent manage-profile permission permits
returning a ready profile. Replay returns require a successful read audit. Never
return ready merely because an outbox row cannot be claimed or a row exists.

## Shared client transport contract

Web and native dealer interactions use a typed facade over the generated
OpenAPI client. The facade supplies profile list/get/create/update and staff
list/role/removal/invitation operations; presentation code does not construct
paths, authorization headers or response envelopes. Creation callers supply and
retain an idempotency key across uncertain retries. Updates carry the revision
of the profile that was edited; the adapter never silently fetches a newer
revision or retries a mutation. Pagination returns the opaque cursor unchanged,
including when an authorized dealer page is empty.

Failures expose only a stable machine code and HTTP status (zero for network
failure), never raw server detail, echoed input, tokens or response bodies.
Unexpected codes and malformed successful envelopes become a protocol failure.
Transient failures do not clear sessions. Invitation secrets occur only in
creation responses and preview/accept request bodies; they are never put in URLs.
Each call obtains the current opaque application credential through the existing
transport. Real local HTTP tests cover the generated wire contract, concurrency
revision conflicts, idempotent retry, rotated credentials and failure redaction.

## Shared dealer directory orchestration

A framework-independent directory in `packages/client-core` owns membership-page
loading and selected-profile reads. Platform presentation models subscribe to
snapshots and choose their own navigation. Each account/session replacement
clears all rows, cursors, selected profiles and failures before reading. Late
responses from a previous scope or superseded selection cannot repopulate state,
even when the same account signs in again. The API port supplied for a scope is
credential-bound by the caller. Session invalidation clears the directory.

Refresh replaces the list only after success; load-more appends distinct IDs and
preserves the previous page on failure. Empty pages with cursors remain pageable.
Overlapping load-more requests coalesce, while refresh invalidates their results.
A failed selected-profile read never displays the previous dealer's details.
Failure presentation uses an injected machine-error classifier; shared core
contains no translated copy, framework state or persistent credential storage.

## Web shop directory

After profile verification, the web home presents the authenticated user's shops
with an explicit selection and a readable profile panel. Loading, empty, retry,
load-more and unavailable-detail states have localized text and keyboard-accessible
controls. Selecting a different shop clears the old profile immediately. A failed
read shows a retry action without inventing permission or membership state.
Profiles show contact and showroom settings; raw revision numbers and internal
IDs are not product copy. No untrusted URL becomes a clickable link in this slice.

The mounted directory receives a verified account and an opaque credential bound
to that session. Account replacement remounts its scope. Each operation captures the current credential; ordinary rotation preserves open forms. An old credential rejection cannot invalidate a newer credential. Sign-out hides private
content immediately before awaiting revocation; unmount, expiry and terminal
rejection invalidate pending profile loads and refresh timers. A refresh response
cannot restore storage after the starting credential has been removed or replaced.
Browser acceptance uses a stateful HTTP fixture to exercise localized rendering,
empty-page continuation, selection, delayed reads and sign-out isolation. This
fixture evidence does not replace the required real PostgreSQL/OIDC/SpiceDB journey.

## Profile form submission

Web creation and editing use a labeled form grouped into identity/contact,
address, showroom appearance and customer-service notes. Required values and
limits mirror the API contract. Optional fields remain editable and clearable.
Create supplies a fresh random idempotency key for one submitted snapshot. If
network/service failure leaves the outcome uncertain, keep that exact snapshot
and key, disable edits and offer retry. Never silently start another creation
with changed attributes after an uncertain outcome. Validation or duplicate-slug
rejection permits correction and a new attempt. Closing an uncertain creation
requires retaining its intent in the mounted workflow; closing the browser is
not yet durable draft recovery. Durable inventory drafts remain a separate requirement.

Editing sends the revision originally loaded, never automatically fetches and
uses a new revision after conflict. On conflict retain every entered value and
explain that the user must review current data before trying again. Owner-only
profile updates remain enforced by the API; until explicit client capability
metadata exists, an edit action states that only shop owners can save changes.
A rejected mutation does not discard form values. Session teardown discards
private form state and prevents late completion from changing the next session.

A transient session-service outage keeps the account-scoped form mounted while
the local session remains valid, including an uncertain creation intent. Rotation
updates the credential before profile revalidation so retry can use it during
a profile-service outage. Only terminal rejection, expiry, sign-out or account
replacement clears this private state.
