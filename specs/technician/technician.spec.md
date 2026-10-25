# Technician domain implementation status

The product contract is [profile.spec.md](profile.spec.md). It supersedes the
mechanical generator defaults, including generic deletion and listing behavior.

The domain implements validated profile creation, restore and revision-checked
updates with injected clocks/timezone catalogs, defensive copying, contact and
service-area constraints, canonical work selections and weekly local-time rules.
Changing an origin timezone does not rewrite weekly rule timezones. Revisions
reject corrupt current state, stale writes, regressing clocks and exhaustion.

The generated registry composes authenticated, fail-closed routes. No technician
profile operation is enabled yet. The initial flat persistence and transport
remain extension points and cannot round-trip the aggregate. This implementation
does not complete TE-01 or TE-02.
