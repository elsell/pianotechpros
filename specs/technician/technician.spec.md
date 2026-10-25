# Technician domain implementation status

The product contract is [profile.spec.md](profile.spec.md). It supersedes the
mechanical generator defaults, including generic deletion and listing behavior.

The domain implements validated profile creation, restore and revision-checked
updates with injected clocks/timezone catalogs, defensive copying, contact and
service-area constraints, canonical work selections and weekly local-time rules.
Changing an origin timezone does not rewrite weekly rule timezones. Revisions
reject corrupt current state, stale writes, regressing clocks and exhaustion.

The generated registry retains authenticated, fail-closed generic routes.
The explicit own-profile HTTP surface is composed separately in server and
OpenAPI bootstrap with the shared timezone catalog, rotating application sessions,
SpiceDB authorization and atomic audited persistence. Real-session HTTP tests
cover create/read/update/replay, cross-user isolation, stale writes, revoked
permissions, revoked/expired sessions and provider-token rejection. This does
not complete TE-01 or TE-02: shared clients and web/native interfaces remain.
