# Customer persistence and transport

Follow [profile.spec.md](profile.spec.md) for the required atomic aggregate,
revision, idempotency, authorization and audit guarantees. The generated flat
repository and DTOs are temporary extension points, not product persistence.
They must not be used by an enabled application policy until they preserve the
complete aggregate, enforce one profile per owner, and pass adversarial tests.

## Aggregate storage

Store identity/contact fields, revision and bounded location/piano JSON arrays
in the account-owned customer row. The row's immutable owner and unique owner
constraint scope every nested key; children are aggregate values rather than
independently addressable resources. Replacing a JSON value preserves the stable
keys of retained locations and pianos. It does not recreate child identities.
Database constraints enforce positive safe-integer revisions, array shapes and
collection bounds in addition to application validation. Owner and creation time
are immutable. Runtime credentials have no profile-delete capability. A mutation records its
last audit ID and a database trigger verifies matching actor, owner, target,
action and timestamp. The trigger rejects revision jumps, identity changes and
backwards timestamps. Audit retention is not blocked by a permanent foreign key
to the last audit: the proof is checked when the mutation occurs, and the audit row must originate
in that same transaction. A previously committed no-op audit cannot authorize a
later mutation. Repositories receive a pooled connection and own the top-level
mutation transaction; callers do not wrap writes in a separate transaction.

Decode stored arrays strictly: reject unknown fields, malformed JSON, oversize
payloads, invalid aggregate fields and references, or inconsistent revision/time
metadata. Restoration uses the injected timezone catalog and preserves accepted
creation/update times; it must not invent timestamps, silently drop bad children,
or return a partial profile. Application code never logs personal stored values.

Create reserves the principal-scoped idempotency key, writes the entire aggregate,
enqueues its customer owner relationship and writes its creation audit in one
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
customer permissions through the existing capability proxy.
