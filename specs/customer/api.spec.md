# Own customer profile application and API

The product surface uses `/v1/customer-profile`: POST creates the caller's single
profile with a required idempotency key, GET retrieves that profile, and PUT saves
its attributes with an expected revision. No owner, resource ID or sharing grant
is accepted from request bodies. The server resolves the caller's profile. There
is no customer directory or generic profile-delete operation. The former generated
CRUD surface stays closed while the product bootstrap and routes are integrated.

A valid opaque application session with api:user scope is required. Authenticate
before consulting profile data. Every authenticated product operation consumes
the configured principal audit budget, including timezone metadata, denials and
creation retries. Missing dependencies fail closed. Successful reads and creation
replays append an audit before returning data; mutation audit is in the repository
transaction. Authorization dependency failures produce a failed access audit;
missing or forbidden profiles produce indistinguishable not-found responses.

GET and PUT require a persisted actor/owner match and fully consistent customer
view/update permission respectively. PUT checks permission and saves within the
existing per-resource authorization serializer. The repository rechecks active
ownership and revision inside the mutation transaction. Failures return no partial
profile. Invalid attributes return the stable invalid-argument code; revision
conflicts retain a distinct conflict code so clients keep the draft for review.

Creation validates and normalizes attributes through the injected catalog and
clock, hashes the canonical attributes, and reserves a principal-scoped idempotency
key (16–128 printable ASCII characters). It atomically writes the profile, owner
relationship outbox and creation audit. The initial owner grant is delivered with
the existing serialized outbox lease/renew/complete protocol. A pending or failed
grant returns authorization-pending without profile data. A retry claims only an
existing outbox row; it never invents a new grant to restore revoked access. Readiness requires a completed owner-touch outbox row and no pending resource
changes, in addition to the remote permission decision. A remote grant whose
local completion/audit failed cannot expose the profile. After
grant delivery, re-read owned state and check customer:view before returning it.
A replay appends a read audit. The outbox worker retains its existing bounded
recovery semantics and cannot write schema through the runtime capability proxy.

`GET /v1/customer-profile/timezones` returns the injected catalog's immutable name
choices after authentication, rate limiting and a metadata-read audit. It does
not require an already-created customer profile. Names carry no host information
and are external reference data. HTTP payloads are bounded to 1 MiB, use existing
data envelopes and machine-readable errors, and never expose owner IDs or audit
internals. English/Spanish clients own all presentation copy.

Application tests use stateful fakes for the owned repository, authorization
relationships, outbox leases, audit journal, limiter and clock. Exercise legitimate
create/read/save/no-op/replay, wrong scope, unavailable dependencies, cross-owner
repository results, revoked/missing grants, pending delivery, missing outbox,
audit failure, rate limiting, invalid input and stale revision. HTTP/session
integration and real SpiceDB tests remain required before enabling product routes.
