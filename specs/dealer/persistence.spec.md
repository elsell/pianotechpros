# Dealer persistence and transport status

This describes generated groundwork, not the completed product persistence
contract. `profile.spec.md` takes precedence. Before enabling routes, extend
storage with active memberships, unique slugs and optimistic revisions, and
replace owner-only reads with actor-scoped membership queries. Ordinary dealer
deletion is not a product operation; generated delete plumbing remains inaccessible.

`dealer` owns the `dealer_models` PostgreSQL table and its repository.
No operation uses the example domain's generic `resource_models` storage.
Repository reads require an owner user ID and use stable `(created_at, id)`
keyset pagination. Creates atomically reserve the authenticated principal's
idempotency key and canonical request digest, insert the domain row, enqueue the
SpiceDB owner relationship, and append the typed audit event. Same-digest retries
return the original entity; key reuse with another digest conflicts. The
idempotency reservation and authorization outbox row carry explicit non-null
creation timestamps required by the shared schema. Updates commit their typed
audit event atomically. Deletes atomically remove the domain row, enqueue the
SpiceDB relationship deletion, and append their typed audit event so authorization
cleanup cannot be lost.

The generated Huma registrar, DTOs, and mapper are compile-safe extension points.
They are registered through the generator-owned composition registry. The service
authenticates then fails closed; registration does not enable access. Implement
the specified domain behavior, authorization coordination and audit construction
in the application service. Sharing is not generated; its required policy is
specified in `profile.spec.md` and remains unimplemented.
Application services use `internal/app/shared` for correlation-aware audit event
construction instead of duplicating request-context or clock mechanics.
