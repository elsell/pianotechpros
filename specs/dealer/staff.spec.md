# Dealer staff and membership invitations

## Product behavior

A founding owner manages the dealer's staff. Invitations grant editor or viewer
access only; neither an invitation nor a generic role edit can create, transfer,
demote or remove the founding owner. Editors manage inventory, publication and
inquiries. Viewers read private profile, inventory and history. Only the owner
manages profile, membership and staff invitations. Every protected operation
requires the local active-role capability, confirmation of the current membership
revision and the corresponding SpiceDB permission; stale relationships never override a local downgrade or revocation.

Owners create a one-time invitation link with an explicit role and expiry between
one hour and seven days (default 72 hours). The link contains an independently
random 256-bit token. Store only its SHA-256 digest; never include the token or
digest in audit, telemetry, URLs sent as referrers, or ordinary invitation lists.
The creation response is the sole token disclosure. Show the role, expiry and
recipient warning before copying/sharing the link. A lost creation response can
be replaced with a new invitation; never recover a stored raw token.

Anyone possessing the link must sign in using an already-provisioned application
account, review the shop and offered role, then explicitly accept. Possession does
not bypass platform account provisioning. Acceptance binds that immutable user
ID, consumes the invitation once, and creates/reactivates only that user's staff
membership with the offered role. The founding owner cannot consume their own
invitation. Expired, revoked or consumed invitations cannot grant access. Expiry
is exclusive: a token is invalid at exactly its expiry instant. An active member
cannot use another invitation to silently overwrite their existing role.

Owner role edits and removals require an expected membership revision. Changes
increment that revision, preserve dealer/user identity and original creation
time, and use the injected clock. Revoked membership blocks all capabilities
immediately. Reactivation requires a fresh invitation and increments the existing
revision. No ordinary membership deletion or owner transfer exists.

## Application and persistence protocol

Staff list, invitation list/create/revoke and role-change/remove operations require
an authenticated owner session, active founding-owner membership and the fully
consistent `dealer:manage_members` permission. Conceal inaccessible dealers and
staff identifiers. Queries are owner-scoped and bounded; owner listing alone may
show staff user IDs, role, active status and revision. No email-based authority.

Acceptance authenticates and consumes the principal audit budget before token
lookup. Validate the token's exact encoding and digest; unknown, expired, revoked,
consumed and wrong-dealer tokens share an invalid-invitation response. The issuing
owner must still be an active account and active founding owner with SpiceDB
membership-management permission. Invalid/denied attempts emit a bounded audit
against a collection or caller-supplied identifier, never a server-discovered
private dealer or token digest. Do not reveal a shop preview before validating a
live invitation; a preview does not consume or grant membership.

Within one PostgreSQL transaction, lock the invitation and relevant membership,
recheck issuer/recipient active accounts, expiry and one-time state, then consume,
create/reactivate membership, append audit and queue the exact relationship touch.
Concurrent acceptors cannot both succeed. Each membership stores a confirmed grant revision and the ID of the outbox touch
that must confirm its current revision. New/reactivated/role-changed memberships
remain pending: even a stale SpiceDB grant cannot authorize them. Outbox completion
atomically appends its audit, completes the event and confirms the membership only
if the pending touch ID, dealer, subject and current role still match. An old
completion cannot confirm a newer revision. Confirmation does not increment the
membership revision or its last-edit timestamp; confirmation time belongs to its
audit event. A duplicate confirmation is idempotent. Revocation denies
immediately regardless of confirmation. Apply this protocol to the founding owner
bootstrap as well, while allowing the creation command to inspect its own pending
membership internally. Grant-dependent actions require active local role,
confirmed current revision and SpiceDB permission; queued grants never suffice. Role
changes queue deletion of the old relation before touching the new relation.
Revocation commits local denial and relationship deletion atomically with audit.
The existing per-resource ordered outbox and capability proxy apply changes.
No credentials gain schema-write capability. All mutation audit failures roll back.

## Acceptance evidence

This specification is implementation work, not a completed staff feature. Domain
state-transition tests are followed by PostgreSQL transaction/concurrency tests,
application/HTTP authorization boundaries, real SpiceDB role-change/revocation
journeys and web/native interaction acceptance before DL-04 can close.
Test unauthenticated/malformed/expired sessions, wrong issuer/audience provider
tokens, cross-dealer users, viewer/editor escalation, stale revisions, immutable
owner protection, exact expiry, concurrent consumption, inactive accounts,
replayed tokens, revoke → immediate reinvite/accept during SpiceDB outage, stale
outbox completion, audit/outbox failures and legitimate owner/invitee journeys.

## Domain value invariants

Membership identities are nonempty, trimmed, valid UTF-8 strings of at most 128
bytes without control characters. Membership revisions are positive and cannot
overflow. Creation/update timestamps are nonzero and ordered; transitions cannot
backdate the last update. Invalid persisted membership values grant no capability.
Invitations use the same identity bounds, a nonzero fixed 32-byte digest, valid
staff role, bounded lifetime and mutually exclusive consumption/revocation state.
Consumed recipients differ from the issuing owner; consumption timestamps lie
within the invitation lifetime. State transitions return new values and preserve
the original value, preventing partial mutation on validation failure.

### Staff revocation persistence boundary

The staff repository revocation command takes the acting owner, dealer, subject,
expected revision, independently generated outbox ID and audit event. It locks the
authorization resource before the dealer and current membership, verifies the persisted founding owner's confirmed
active membership and active account, and rejects owner removal. It derives the
relationship deletion from the stored role rather than accepting a caller's role.
Local revocation, clearing any pending grant, the relationship deletion and the
successful membership audit commit together. A stale revision changes nothing.
Queue the deletion after every existing dealer relationship event (at least one
PostgreSQL microsecond later when necessary), so a pending earlier grant cannot
be applied after the revocation. Application orchestration must additionally check
SpiceDB, authenticate, rate-limit and audit denials before exposing this command.

Membership audit targets use a canonical JSON array `[dealerID,userID]` rather
than a user ID alone, which is ambiguous across dealers. The persistence boundary
validates this target against the command. Resource locks precede membership locks
to match outbox publication/completion; the existing database ordering trigger
assigns the strictly increasing queue timestamp.

### Role-change persistence boundary

Role editing uses the same resource-first lock order and active founding-owner
checks as removal. It requires an expected revision and two distinct outbox IDs.
The transaction derives the previous role from the locked membership, queues its
delete before touching the requested editor/viewer role, advances the local
revision and associates the new pending touch with that exact revision. The old
grant revision remains unchanged, so no access is granted until completion of
the new touch. Both events, the membership change and its audit commit atomically.
A role edit cannot reactivate removed staff or alter the founding owner. Editing
to the existing role still creates a new audited revision with a refreshed grant.

### Role/removal HTTP commands

`PUT /v1/dealers/{id}/staff/{userID}/role` takes `role` (`editor` or
`viewer`) and `expectedRevision`. `POST /v1/dealers/{id}/staff/{userID}/revoke`
takes `expectedRevision`. Both return the committed membership envelope, including
revision, active state and `grantPending`; a pending role is not usable access.
These commands authenticate an opaque scoped application session, consume the
principal budget, verify confirmed local founding-owner membership and the
`manage_members` SpiceDB permission, then invoke the transactional staff port.
Do not publish synchronously or return a false ready state. Unknown/cross-dealer
subjects are concealed; stale edits return conflict and immutable-owner or invalid
role edits return a stable bad-request code. Denials are audited. Atomic persistence
rechecks remain required even after the application checks.

### Invitation storage and transaction boundary

Staff invitations live in their own table, separate from platform provisioning
invitations. Persist only the fixed-size token digest, offered role, dealer and
issuer IDs, creation/expiry and terminal consumption/revocation fields. Database
constraints enforce the digest size, staff-only role, bounded lifetime and mutually
exclusive terminal states. Runtime credentials can select, insert and update but
cannot delete invitations.

Creation/revocation and acceptance acquire the dealer authorization resource lock
before dealer, membership and invitation locks, matching relationship workers.
Creation and revocation require a confirmed active founding owner and active
account in the transaction. Acceptance requires the same issuer state, an already
active recipient account and an available matching invitation. The application
must separately check issuer SpiceDB authority before preview or acceptance.
The acceptance port receives the injected clock and reads it after acquiring
locks; an invitation expiring while the request waits cannot be consumed using a
stale request-start timestamp. Consumption, new/reactivated pending membership,
touch outbox and acceptance audit share one transaction. The acceptance audit's
time is the actual consumption time. A fresh invite cannot replace an active
membership. Replayed, expired, revoked, wrong-dealer and unknown invitations share
the invalid-invitation result. Issuer/recipient deactivation also fails closed.

### Invitation HTTP flow

Owners create invitations with `POST /v1/dealers/{id}/staff-invitations`, supplying
`role` and optional `expiresInHours` (default 72, range 1–168). The response alone
contains a cryptographically random 32-byte token encoded as canonical unpadded
base64url; persist its SHA-256 digest. Do not derive this token from resource IDs.
Creation responses include `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
Owner revocation uses `POST /v1/dealers/{id}/staff-invitations/{invitationID}/revoke`.

Authenticated recipients POST a token in the JSON body to the corresponding
`/preview` or `/accept` command; it never belongs in a query or request path.
Clients carry it in a link fragment, remove the fragment before external navigation
and never persist it as an application session. Preview reveals only invitation
ID, dealer ID/name, role and expiry after the token, active accounts, confirmed
issuer membership and issuer SpiceDB authority pass. Preview is audited and grants
nothing. Acceptance rechecks transaction state and returns a membership with its
pending-grant state; it never provisions an account or silently activates access.
Malformed, unavailable, expired or replayed tokens return the same stable
`invalid_invitation` error. Audit invalid/denied token operations against the fixed
invitation collection, never the token, digest or privately discovered dealer ID.
Permission/audit dependency failures return no preview or token. All responses
containing invitation data disable caching; referrer policy is `no-referrer`.

Invitation operations mark their input as sensitive in HTTP operation metadata.
The shared HTTP error transformer removes raw validation details and input values
for these operations, including malformed JSON, while preserving status and
stable error code. Framework parsing failures must not echo a token in an error
response. This applies before application-level token validation as well.

### Owner administration lists

`GET /v1/dealers/{id}/staff` lists the founding owner and current/revoked staff,
including role, revision, active state and pending-grant state. It never exposes
provider identities or email. `GET /v1/dealers/{id}/staff-invitations` lists offered
role, creation/expiry, consumed recipient/time and revocation time. Its storage
projection excludes token digests; raw tokens are never recoverable from a list.

Both lists require confirmed local founding-owner access, active account and
SpiceDB `manage_members`, consume the principal budget and append a successful
read audit before returning data. Failed audits return neither items nor cursor.
Queries are bounded (default 50, maximum 100), ordered by creation time then stable
user/invitation ID. An encrypted authenticated cursor binds actor, dealer, list
kind, creation snapshot and last row. Cross-dealer, cross-list and cross-actor
reuse is invalid. Continuations exclude subsequently created entries but report
the current state of earlier entries, including removal/consumption. The storage
read rechecks owner authority under the same resource-first lock order used by
staff mutations. List responses disable caching and referrers.

### Web staff administration

The selected shop exposes an owner-only administration view. Load members and
invitations through the authenticated list APIs; a denial shows an unavailable
state without granting actions. Preserve pagination independently for both lists.
Show immutable user identifiers until a separately authorized staff-profile
projection exists; never invent a display name from an identifier. Owner rows
have no role/removal controls. Active editor/viewer rows support revision-checked
role changes and a two-step removal confirmation. Pending grants, removed staff,
consumed/revoked invitations and expiry dates have localized presentation.

Invitation creation selects editor/viewer and a bounded expiry. Its one-time
secret is shown only in the mounted view alongside the dealer/invitation IDs
needed for consumption; never place it in a URL, persistent browser storage or
logs. Creation is not idempotent: do not automatically retry after failure.
Keep a successful issued token visible through list refresh failure until the
user dismisses it or leaves the view. Revocation requires explicit confirmation.
Any mutation conflict preserves the displayed state and asks for refresh before
another attempt. Session/shop teardown invalidates late results and clears secrets.
Framework-independent request sequencing lives in shared client-core; platform
models provide their own controls and localized failure presentation.
