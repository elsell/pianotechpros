# Dealer domain

The product contract and ownership/staff policy are in `profile.spec.md`.
Private get/list routes authenticate, enforce active membership plus SpiceDB
permission, and require audit success. Lists use actor-bound signed pagination.
Create/update/delete routes still authenticate and fail closed with an
unconfigured-policy response while their application protocols are implemented.
No ordinary dealer deletion is part of the product contract. Persistence tests
and role/read boundary tests are incremental evidence, not complete dealer or
staff product acceptance.
