# Public rebuild specification

## Scope

The user's clarified completion target is the feature-complete web, iOS and
Android product described in `product-parity.spec.md`. The scaffold milestone
below is historical groundwork, not completion of the requested rebuild.

PianoTechPros starts with fresh Git history in `elsell/pianotechpros`. It is a
new implementation informed by the owner's existing product, not a claim of
formal clean-room isolation. The first milestone is a runnable platform scaffold:
Go API, SvelteKit web, and React Native/Expo iOS and Android clients. Product
inventory, showroom, photography and dictation are subsequent vertical slices.
Do not represent scaffold authentication screens as completed product UX. The
entry screen invites sign-in using the shared English and Spanish catalogs.

Use Make App at commit `005eb2e3f5e6fd16cfaa08a980b25e3b10d3ddfb` with
`--without-example`. Retain its Apache-2.0 license, attribution, security model,
locked dependencies, generated contracts, and native compilation gates.
The app identifiers are provisionally `com.pianotechpros.pianotechpros` on both
platforms, with callback scheme `pianotechpros`; verify availability before store
registration. No Apple or Google store account is required for scaffold CI.

## Isolation and delivery

The existing application remains the deployed product. This repository must not
write to the infrastructure repository, contain deployment credentials, change
DNS, or connect to existing production data. Production configuration is absent.
Release publication is manual only and still requires successful CI. Publishing
an image or GitHub release does not deploy it. No store workflow is enabled.
A later deployment design must use a separate hostname and isolated secrets,
data and namespace, with explicit promotion and rollback before any cutover.

CI runs checks, security and dependency-age gates, browser/API acceptance,
container builds, Android debug compilation and unsigned iOS simulator builds.
Native builds are distinct from interactive simulator acceptance and signed
physical-device testing. Record project-specific results; inherited template
evidence is not evidence that this application passed.

## Public-source boundary

Do not copy old Git history, local configuration, database snapshots, customer
records, internal hostnames, secret names or infrastructure paths into the new
repository. Reuse product behavior and selectively reviewed source/tests only
with explicit provenance and compatible licensing. The initial scaffold copies
no old application source or tests. Test fixtures use synthetic data.

## Next product boundaries

Dealer organizations and staff membership are explicit authorization boundaries.
Before inventory routes are added, specify owner/editor/viewer relationships,
SpiceDB policy, query scoping, audit events and cross-dealer denial tests. Public
showroom reads use an explicit public projection and never a private record DTO.
Media, speech recognition and structured extraction each sit behind their own
port. Model output cannot authorize publication or lifecycle transitions.

## Session completion isolation

Native sign-out invalidates all pending session work synchronously. Stale refresh,
profile, restoration or exchange responses must not restore UI state or secure
credentials. Secure-storage mutations are serialized so deletion follows any
already-started write; queued stale writes become no-ops. Sign-out does not wait
for network requests before clearing local state. Controlled-fake tests cover
late success/failure and an in-progress storage write at sign-out.

## SDK 55 compatibility refresh

The initial hosted Android preflight rejected stale template patches. Align the
native package set with Expo 55.0.32's published bundled-native manifest, retaining
React Native 0.83.10. Update inherited overrides that would force Expo internals
below that SDK's declared minimums. Verify frozen installation, Expo Doctor,
native manifest consistency, type/tests and both exports. This compatibility
refresh does not claim to resolve the separately tracked security advisories.

The 2026-10-22 compatibility refresh permits exact fourteen-day-age exceptions
for Expo 55.0.32, CLI 55.0.37, config-plugins 55.0.12, auth-session 55.0.19,
dev-client 55.0.41, dev-launcher 55.0.42, modules-autolinking 55.0.28,
modules-core 55.0.27 and their xcode 4.0.0 tool dependency. These are required by
the current SDK 55 compatibility manifest rather than an SDK-major migration.
Keep exact pins/integrities and review with Doctor, native-manifest checks,
type/tests, exports and hosted unsigned builds. These narrow age exceptions do
not waive vulnerability findings or permit store/deployment publication.

## Native currency formatting

Shared currency presentation must work in Hermes as well as browsers. Keep minor
units as safe integers and compute the fraction exactly; pass the safe integral
major-unit quotient as a Number to Intl formatting. Do not require Intl BigInt
support or convert fractional major units through floating-point division.
Verify zero-, two- and three-decimal currencies and maximum safe minor units.
