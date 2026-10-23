# Dealer domain

The product contract and ownership/staff policy are in `profile.spec.md`.
Private get/list routes authenticate, enforce active membership plus SpiceDB
permission, and require audit success. Lists use actor-bound encrypted pagination.
Creation atomically reserves idempotency and ownership, publishes the owner
relationship through the outbox, and returns only a ready audited profile. Owner
updates use expected revisions and atomic mutation audits. Ordinary deletion
remains closed; it is not a supported product operation.
No ordinary dealer deletion is part of the product contract. Persistence tests
and role/read boundary tests are incremental evidence, not complete dealer or
staff product acceptance.
