# Dealer persistence and transport

`profile.spec.md` defines the product policy. The generated Huma registrar is
registered through the generator-owned composition registry, but its application
service still authenticates then fails closed. Storage implementation does not
activate dealer access. Membership administration, SpiceDB checks and complete
client journeys remain unfinished.

## Membership and revision storage

`dealer_models` is separate from generic platform resource storage. Migration 19
adds a globally unique slug index, positive profile revision and dealer
memberships keyed by dealer/user, with owner/editor/viewer role and active flag.
Existing founding owners receive owner membership. Creation inserts revision 1
and active owner membership atomically with principal-scoped idempotency,
relationship outbox and audit. Active means locally eligible; the application
must additionally check SpiceDB before serving any record, so an unpublished
relationship cannot grant access. Read queries require an acting user ID and
filter active membership. Lists use bounded `(created_at, id)` keyset pagination.

Profile updates require active owner membership and the previously read revision.
Successful updates increment the revision and append audit in one transaction;
stale revisions conflict. A missing/inaccessible record returns not-found before
revision comparison, preventing cross-shop revision disclosure. Ownership never
changes through update. Ordinary deletion returns invalid-argument without any
database change, and the runtime role lacks dealer DELETE privilege. Duplicate
slugs map to conflict, including concurrent writes. The repository validates
normalized domain attributes before persistence. Numeric address field suffixes
use explicit GORM column tags matching their migration names.

Real PostgreSQL tests prove creation and audit-failure rollback, idempotent
replay/conflict, slug conflicts, staff/member reads, revoked/cross-user denial,
owner-only edits, revision conflict and unavailable destructive deletion. The
live Compose acceptance harness runs these tests against a separately migrated,
disposable dealer-test database, including restricted-runtime credentials and
concurrent connections. Test outbox fixtures never enter the application database;
unit runs without a DSN explicitly skip PostgreSQL integration.

Application services must use the shared correlation/clock-aware audit helpers,
the coordinated principal limiter and specified authorization protocol before
any authenticated read or successful mutation is returned to a client.
