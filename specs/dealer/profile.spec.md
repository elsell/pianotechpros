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
