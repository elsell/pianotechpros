# Customer persistence and transport

Follow [profile.spec.md](profile.spec.md) for the required atomic aggregate,
revision, idempotency, authorization and audit guarantees. The generated flat
repository and DTOs are temporary extension points, not product persistence.
They must not be used by an enabled application policy until they preserve the
complete aggregate, enforce one profile per owner, and pass adversarial tests.

The generated registry composes the authenticated fail-closed application service.
No product create/read/update/delete capability is enabled by generation.
