# Technician persistence and transport

Follow [profile.spec.md](profile.spec.md) for the required atomic aggregate,
revision, idempotency, authorization and audit guarantees. The repository implements aggregate persistence. Dedicated profile DTOs and
bootstrap compose the reviewed policy; the generated generic routes stay closed.

## Aggregate storage

Store identity, revision and one bounded JSON object containing all profile attributes
in the account-owned technician row. The row's immutable owner and unique owner
constraint scope every weekly rule key; rules are aggregate values rather than independently
addressable resources. Replacing attributes preserves retained rule identities.
Database constraints enforce positive safe-integer revisions, object shape and
aggregate byte bounds in addition to application validation. Owner and creation time
are immutable. Runtime credentials have no profile-delete capability. A mutation records its
last audit ID and a database trigger verifies matching actor, owner, target,
action and timestamp. The trigger rejects revision jumps, identity changes and
backwards timestamps. Audit retention is not blocked by a permanent foreign key
to the last audit: the proof is checked when the mutation occurs, and the audit row must originate
in that same transaction. A previously committed no-op audit cannot authorize a
later mutation. Repositories receive a pooled connection and own the top-level
mutation transaction; callers do not wrap writes in a separate transaction.

Require every stored attribute and nested rule/origin field with its exact name
and scalar type. Missing fields, case aliases and null scalar values are corrupt;
only optional driving minutes and empty collection representations may be null.
Decode stored attributes strictly: reject unknown fields, malformed JSON, oversize
payloads, invalid contact, origin, work selections or weekly rules, or inconsistent revision/time
metadata. Restoration uses the injected timezone catalog and preserves accepted
creation/update times; it must not invent timestamps, silently drop invalid values,
or return a partial profile. Application code never logs personal stored values.

Create reserves the principal-scoped idempotency key, writes the entire aggregate,
enqueues its technician owner relationship and writes its creation audit in one
transaction. Unique owner conflicts roll back all ancillary rows. A replay must
match the original request digest and owner. Same-key concurrent calls converge
on one committed resource; another digest conflicts. Authorization outbox rows
include explicit creation time and actor/owner context.

Read and update always scope SQL by owner and resource ID. Updates lock the
current row, check expected revision and immutable identity, and replace the
aggregate only alongside the typed audit event. Stale writes leave both profile
and audit unchanged. An audited no-op emits a successful resource.updated interaction event but does
not write the profile or advance revision/time. Audit
failure rolls back the profile write. Foreign, absent and denied resources are
indistinguishable to callers. Empty actors are rejected before database access.

The generated registry composes the authenticated fail-closed application service.
No product create/read/update/delete capability is enabled by generation. The
final product route contract replaces generic CRUD semantics before opening
policy; profile deletion is not exposed. The API credential receives only typed
technician permissions through the existing capability proxy.

Authorization readiness is an owner-scoped query over the profile and its outbox:
require at least one completed owner touch for that owner and no incomplete
resource changes. GetOwn resolves only the authenticated active owner's row.
Save rechecks readiness inside its transaction; the application holds the resource
authorization serializer throughout permission checking and Save. Repository
methods do not reacquire that serializer's lock through another connection.
