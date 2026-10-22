# Inventory access and transaction policy

## Authorization

Every private inventory operation requires a valid opaque application session
with `api:user`, then the coordinated principal audit limiter. Dealer membership
is loaded through an actor-scoped port with active-account state and persisted
founding-owner identity. Membership must belong to that actor/dealer, be active,
and have its exact current revision confirmed. Founding-owner role and stored
owner identity must agree. A missing/inaccessible dealer produces not-found.

Read/list/history/QR identification require local dealer `view` and SpiceDB
`dealer:view`. Create/edit/photo operations and lifecycle commands require local
`manage_inventory` and SpiceDB `dealer:manage_inventory`. Publish/unpublish
require local `publish_inventory` and SpiceDB `dealer:publish_inventory`. The
founding owner and confirmed editors may write/publish; viewers only read. No
per-piano relation silently supersedes dealer scope. API runtime authorization
uses the existing typed capability proxy; no schema-write capability is added.

An inventory access policy helper will enforce this decision before product
services are exposed. It authenticates even when dependencies are unconfigured,
fails closed on missing dependencies or authority failures, and audits denied or
failed decisions against a fixed inventory collection target without recording
request input, credentials or arbitrary metadata. A successful policy decision
alone is not a successful domain operation and does not replace that operation's
required read/mutation audit. Decisions must not be cached or reused across
requests. Generated domain composition remains required when HTTP services are
registered; the policy helper alone registers no route.

## Repository contract

Every private repository read/list requires actor and dealer IDs and applies
active-user/current-confirmed-membership checks. Mutations recheck role authority
under the shared dealer resource lock followed by membership and inventory row
locks, consistent with staff revocation/outbox ordering. Identity and ownership
are immutable. Inaccessible records return not-found before revision conflicts,
so cross-dealer probes disclose no existence or revision information.

Creation reserves actor/dealer-scoped idempotency and a generated stock number,
then commits the initial record, append-only history and audit atomically. Retry
of the exact intent returns the original record; changed intent conflicts.
Updates/lifecycle/publication compare the current revision and commit the next
record, private history, audit and any public snapshot/visibility change in one
transaction. No successful mutation may omit history or audit. Runtime roles may
insert history and read authorized history but cannot update/delete/truncate it;
no destructive inventory deletion endpoint or runtime permission exists.

Public snapshots and media reference retention are separate from private draft
storage. Publishing reads owned, completed photo metadata inside the transaction;
never accept client-provided readiness evidence. Public delivery requires both
publication visibility and dealer showroom visibility. Photo deletion removes
only working-draft membership until retained snapshot references permit cleanup.

Persistence, application commands and HTTP exposure are separate implementation
steps. Add real PostgreSQL concurrency, runtime-privilege, authorization-recheck
and audit-rollback evidence before claiming this contract is implemented.

### Membership preflight adapter

The dealer PostgreSQL adapter supplies the inventory policy's narrow membership
reader. One joined, actor/dealer-scoped query loads only membership fields,
founding-owner ID and active-user boolean. Pending/inactive membership metadata is
returned internally so the policy can fail closed; it is never a public response.
Missing actor/dealer membership returns not-found, with no cross-user fallback.
This preflight does not lock or reserve permission for a later mutation: inventory
transactional repositories must perform the documented authority recheck under
locks. Runtime credentials need only existing SELECT privileges for this query.

## Initial record storage

Migration 22 stores inventory identity/dealer, unique dealer-local stock number,
revision/status and validated private attributes separately from immutable history.
Each current revision references a history row through a deferred constraint.
History stores the private revision snapshot, actor/source/kind and audit ID.
An insert trigger verifies a matching successful inventory audit with the same
actor, dealer owner, record and timestamp. The audit ID is not a permanent foreign
key: bounded audit retention must remain possible without rewriting domain history.
History UPDATE/DELETE is rejected by a trigger and runtime UPDATE/DELETE/TRUNCATE
privileges are revoked. Runtime inventory DELETE/TRUNCATE is revoked.

The first repository operations are lazy empty draft creation and audited get.
Creation accepts only the domain's initial draft (server-generated stock/ID/time,
no product facts), and actor/dealer-scoped idempotency represents that empty-draft
intent. Retrying may supply new generated identity/stock but returns the originally
reserved record's current revision; it appends a read audit, not a second creation
history. Missing local authority cannot use idempotency to recover a record.
Draft creation/read lock dealer resource, dealer, membership and active account
before any inventory lookup/write. The application must separately enforce
SpiceDB and audit rate limits before invoking these repository capabilities.

## Attribute revision storage

Attribute updates accept actor/dealer/record identity, an expected revision, typed
attributes, source and a successful update audit. They recheck `manage_inventory`
authority under the same locks before loading the dealer-scoped record. The domain
revision command validates and normalizes facts, rejects no-op/stale/invalid edits,
and increments exactly once. It never accepts status, ownership or timestamps
from an attribute payload. The audit occurrence time supplies the command time.
The next attributes and private snapshot history commit with the audit atomically;
any failure rolls back all three. Stock collisions map to conflict. Unknown or
inaccessible records return not-found before stale-revision information.
Concurrent updates from one revision yield exactly one winner. Manual and accepted
voice edits retain their source; voice proposal confirmation belongs to the
application boundary, not a permissive raw HTTP source parameter. Attribute edits
do not publish or change public snapshots.

## Application record commands

The application offers empty-draft creation, private get and manual attribute edit.
Every invocation obtains fresh policy authority; access objects cannot be supplied
by callers. Creation requires a printable 16–128 byte idempotency key, generates
an opaque record ID and `PT-<ID>` stock number, and uses one audit timestamp for
both initial record timestamps. Retry identity generation does not alter the
reserved intent. Manual edit accepts only typed attributes and expected revision;
it always uses the manual source. Voice application is a separate future command
that must validate explicit proposal confirmation.

Repository not-found (including authority revoked after preflight) generates a
collection-targeted denied audit under the already acquired principal budget.
No record is returned on repository/audit failure. Missing dependencies fail closed
after authentication. Domain invalid fields, no-change and exhausted revisions
map to stable invalid-argument errors; stale revisions remain conflicts. Successful
operations emit typed probes only after repository completion. These commands do
not register HTTP routes; generated composition and boundary tests are required
before exposing them.

## Private record HTTP contract

Generated domain registration composes the inventory application with the existing
transactional inventory/membership repository capabilities. Register only these
implemented operations: POST `/v1/dealers/{dealerID}/inventory` creates an empty
draft using `Idempotency-Key`; GET and PUT on the same path plus `/{id}` read and
replace private attributes. PUT requires `expectedRevision` and an `attributes`
object with explicit snake_case fields. Status/source/ownership are not writable.
Responses use `{data: ...}` with identity, dealer_id, revision, status, attributes
and timestamps. Typed money retains integer minor units and ISO currency text;
partial dates retain unknown month/day without inventing precision. Nullable
optional facts remain nullable. All responses disable caching and referrers.
Validation errors must never echo private input. Existing stable error envelopes
apply, including 404 for inaccessible records and 409 for stale revisions. No
inventory DELETE, publication, or unimplemented list route is registered.
