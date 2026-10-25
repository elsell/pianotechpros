# Technician persistence implementation status

The required aggregate, owner uniqueness, revision checks, validated restore,
idempotency, atomic audit/outbox behavior and authorization are specified in
[profile.spec.md](profile.spec.md).

Migration 31 and the generated repository are initial mechanical extension
points. Their flat fields and generic operations do not yet implement the
technician profile aggregate. Application methods remain fail-closed, including
generic deletion. Complete the aggregate persistence and adversarial integration
tests before enabling any product operation. There is no live-data migration or
deployment in this slice.
