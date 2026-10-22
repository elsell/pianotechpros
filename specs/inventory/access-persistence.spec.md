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
