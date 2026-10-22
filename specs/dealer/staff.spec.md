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
