# Technician domain implementation status

The product contract is [profile.spec.md](profile.spec.md). It supersedes the
mechanical generator defaults, including generic deletion and listing behavior.

The generated registry composes authenticated, fail-closed routes. No technician
profile operation is enabled yet. The initial flat entity and transport remain
extension points; the weekly local-time rule validator implements the availability
invariants independently. This scaffold does not complete TE-01 or TE-02.
