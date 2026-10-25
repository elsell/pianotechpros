# Testing and Delivery Specification

Tests use fakes rather than mocks and validate behavior through ports. Every auth
boundary covers missing, invalid, expired, wrong-issuer, wrong-audience,
cross-user, dependency-failure, and legitimate cases where applicable.
Audit tests prove atomic mutation/event commits, append-only database enforcement,
successful read and command coverage, denied-decision coverage, actor/owner
visibility, cross-user isolation, stable pagination, and persistence across a
complete stack restart. Persistence acceptance follows cursor pagination until it
finds the pre-restart audit event; it must not depend on a default page being large
enough for the accumulated acceptance history.
Platform audit adapter tests do not depend on an installed product domain or
create test-only product storage. The removable example owns its resource/audit
atomicity proof, and every added domain owns the corresponding repository proof.
Account lifecycle tests prove self-deactivation is configuration-gated, atomically
disables the account, revokes all of its sessions, writes audit history, and
rejects every old session and later OIDC exchange.

Pre-commit and CI run Go formatting and tests, structural checks, OpenAPI/client
drift checks, TypeScript checks, and production builds. Dependencies, CI actions,
toolchains, and images are pinned. Generated projects must pass checks immediately
after bootstrap without manual source edits.
Mobile verification names its evidence precisely. Fast checks run Expo Doctor,
Expo dependency compatibility, JavaScript bundle export, configuration/identifier
validation, and clean iOS/Android prebuild. Linux CI compiles an unsigned Android
debug application with Gradle. A macOS main/release/manual job compiles an unsigned
iOS simulator application with Xcode. Export success alone is never reported as
a native build. Session-state tests prove that transient network, 429, and 5xx
failures preserve a locally valid credential, while expiry, explicit 401, and
malformed secure storage remove it.
Shared web/mobile refresh adapter tests cover network loss, 401, 429, 503,
successful rotation followed by profile-read failure, credential retention or
disposal, bounded retry, and expiry enforcement.
Production mobile configuration tests reject missing, non-HTTPS, loopback, and
localhost endpoint values in the actual Expo bundle environment.
First-party GitHub actions are pinned by full commit SHA to maintained releases
whose action runtime is Node 24 or newer; generated CI must not emit deprecated
action-runtime warnings. Release attestations use the maintained unified GitHub
attestation action, not deprecated compatibility wrappers, and disable optional
organization-only artifact storage records for personal-repository compatibility.
Release tooling, including EAS CLI, is installed from the same frozen pnpm
lockfile and is included in dependency-age and vulnerability gates.
The locked EAS executable retains the mobile app as its working directory.
CocoaPods is Bundler-locked, Android CI selects an exact JDK patch, and signed
EAS profiles select reviewed named Expo SDK 55 build images.
Hosted iOS compilation runs on the explicit GitHub `macos-26` image because
Expo SDK 55 requires Xcode 26 or newer.
Every locked Ruby gem participates in dependency-age and OSV vulnerability
checks. The normal generated check starts the real locked EAS executable.
Reviewed overrides raise vulnerable EAS transitive parsers and matchers to fixed
versions; the locked CLI must pass version startup, Expo Doctor, and audit after
any override change.
The initial locked EAS 21.0.2 toolchain has exact, reviewed age exceptions for
`eas-cli`, its matching `@expo/eas-build-job`, `@expo/eas-json`, `@expo/steps`,
`@expo/logger`, `@expo/turtle-spawn`, and resolved `multipasta`. Compensating
verification includes the frozen graph, fixed security overrides, clean audit,
CLI startup, Expo Doctor, prebuild, and hosted native compilation.
Security overrides require PostCSS 8.5.18 or newer, brace-expansion 5.0.8 or
newer, node-tar 7.5.21 or newer, and fast-uri 3.1.4 or newer, while the web
workspace requires SvelteKit 2.69.1 or newer. Exact, reviewed age exceptions
cover security releases still inside the standard fourteen-day observation
window. The brace-expansion override carries a deterministic pnpm patch that
preserves the callable CommonJS API used by legacy Minimatch without removing
the current named exports. Compensating verification includes frozen-lock
regeneration, legacy and modern Minimatch probes, the generated security-policy
test, a clean package audit, workspace tests and builds, Expo Doctor, clean
prebuild, and hosted native compilation.
Pin shell-quote 1.11.0 throughout the workspace to remediate
GHSA-pqg4-j6r4-53mv (CVE-2026-102422). The registry release timestamp is
2026-09-29T02:34:24.391Z, outside the fourteen-day window on 2026-10-23.
Regression coverage must resolve the actual React Native devtools dependency
and reject every line terminator after a comment token without executing any
shell payload. Ordinary quoted arguments and comment behavior must remain
usable. Keep the complete package audit enabled; resolving this advisory does
not waive other findings or establish release readiness.

The next security refresh pins the following compatible release lines using
workspace overrides. Registry timestamps reviewed on 2026-10-23 place every
listed release before the fourteen-day cutoff; no new age exception is needed.

| Dependency | Reviewed pin | Boundary requiring verification |
| --- | --- | --- |
| fast-uri | 3.1.7 | URI authority normalization and AJV/schema tooling |
| joi (EAS consumers) | 17.13.7 | CLI configuration validation |
| js-yaml | 3.15.2 / 4.3.2 | Preserve each consumer's major API while fixing merge/omap limits |
| nanoid | 3.3.18 | Existing CommonJS identifier-generation consumers |
| browserslist | 4.28.7 | Web/native compilation target resolution |
| source-map-js | 1.2.2 | Web compilation/source-map consumers |
| compression | 1.8.2 | Development-server response teardown |
| devalue | 5.9.3 | SvelteKit server-rendered data serialization |
| @xmldom/xmldom | 0.8.15 / 0.9.12 | Preserve both installed minor API lines in Expo/XML tooling |

Use a fresh full package audit as the advisory regression gate; retain its
failure for findings outside this refresh. Frozen installation, complete
repository/contract tests, dependency-age validation, Expo compatibility,
actual web compilation and EAS startup must pass. Native compilation and real
browser/native journeys remain necessary integration evidence, not substitutes
for fixing outstanding advisories.

The build-tool follow-up pins PostCSS 8.5.23, SvelteKit 2.70.2, Vite 8.1.6,
baseline-browser-mapping 2.11.0, fast-uri 3.1.8, moment 2.31.0, Joi 17.13.8 and
brace-expansion 5.0.12. Their registry release timestamps precede 2026-10-09.
Move the existing callable-CommonJS compatibility patch to the reviewed
brace-expansion release without changing its bounded expansion implementation.
Regression coverage resolves both legacy EAS and modern Expo glob consumers,
preserves their matching behavior and verifies bounded nesting through the real
patched package. Run the complete audit, age gate, web build/browser journey,
repository/contract tests, Expo compatibility/Doctor and native build gates.
Until a fixed node-forge release exists, backport only the nested DigestAlgorithm
element-count validation from upstream PR 1152, commit
ceba34402e329f0365134f23fe19898756527d65, onto 1.4.0. Record source, license,
patch and installed-source hashes. This is an unmerged upstream fix, requiring
local adversarial coverage and review. Exercise actual Expo CLI and EAS consumers
with ephemeral RSA keys: valid SHA-256 signatures, changed messages, signatures
from another key, valid optional-NULL encodings and extra nested ASN.1 children.
Malformed encodings must be rejected before digest comparison. Preserve the
package version and audit finding; do not suppress the advisory or claim an
upstream release. Native tooling checks remain required before merging.

The web runtime must use SvelteKit 3.0.1 and adapter-node 6.0.0 to remove
GHSA-pfhg-q3qv-9q6r and GHSA-27mw-82g8-phjj. Pin compatible Svelte 5.57.2,
TypeScript 6.0.3, svelte-check 4.7.6 and cookie 2.0.1 for SvelteKit;
preserve cookie 0.7.2 only for legacy major-zero consumers; validate their dependency ages. Move
configuration into the Vite plugin, preserving nonce CSP and server-only runtime
configuration through declared private runtime environment inputs. Keep EAS
tooling on its supported TypeScript 5.9.3 peer independently of the web compiler.
Replace the implicit `$lib` alias with explicit `#lib` package
imports, keeping the client boundary gate's source containment checks. Browser
acceptance must preserve showroom SSR, filtering, gallery navigation, localized
errors, and dealer inventory interactions. Production build and runtime security
headers must pass. CSP may allow only the exact SHA-256 style attributes of
the static display-contents wrapper and SvelteKit screen-reader announcer, using
`style-src-attr` hashes; arbitrary inline styles and scripts remain forbidden.
Browser checks must verify the announcer remains visually hidden. Do not weaken audit gates to accommodate the migration.

The Metro image metadata parser must use image-size 2.0.3 (released 2026-09-14)
to remediate GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr. Verify the actual
Metro asset-size boundary still reads valid PNG/JPEG dimensions. Malformed ICNS,
JXL and HEIF buffers with zero-length boxes must terminate with rejection in a
bounded subprocess; never run potentially unbounded parser inputs in the test
runner itself. Keep the package's supported named/default CommonJS exports;
Metro consumes its default export and passes a buffer, not a filesystem path.

Pin decode-uri-component 0.5.0 to replace the unbounded malformed-percent decoder
used by React Navigation's query-string adapter (GHSA-vcc3-ghjq-m6fr). Its fixed
scanner must remain upstream-identical. A minimal reviewed packaging patch may
retain callable CommonJS consumption by query-string: change the package module
type and default function export only, preserving the MIT license and recording
provenance. Exercise the actual installed query-string parser with ordinary
Unicode, plus/escaped-plus, duplicate keys and malformed percent input. Bound
adversarial subprocess execution and preserve non-throwing malformed-input
behavior without executing any decoded content. Run compatibility, exports,
contracts, full tests, age and native integration gates before release.

Zod must use the exact 4.6.6 security release for both EAS and Expo CLI
consumers (GHSA-mrhx-c7xc-m3w5). Test that leading array/set size limits reject
oversized input before visiting elements, while valid input and invalid elements
within the limit retain validation. Exercise Expo's actual plugin/output and MCP
command schemas and EAS job schemas to validate the v3-to-v4 compatibility change.
Unbounded schemas remain unbounded upstream; do not describe this upgrade as
limiting all possible validation input. The 2026-10-11T16:18:23.878Z package has
an exact dependency-age exception for this high-severity fix before its fourteen
day anniversary. Compensating verification includes installed-consumer behavior,
full repository/contract gates, Expo compatibility/Doctor, exports, EAS startup,
audit, review and hosted native builds before release.

The exact fast-uri 3.1.9 pin remediates encoded-scheme spoofing, unchecked host
canonicalization, relative path equivalence and suffix colon injection
(GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr, GHSA-xhq7-xmqj-769h and
GHSA-333x-w4r6-6crp). Resolve the actual AJV dependency used by EAS in regression
tests. Invalid authorities must report an error; encoded schemes must not become
live schemes; normalization must preserve relative resolution; suffix output
must not introduce a scheme. Preserve legitimate absolute/relative references
and AJV schema reference validation. This exact 2026-10-19 release has a reviewed
dependency-age exception for the four security fixes, with behavioral regressions,
full checks/contracts, EAS startup, Expo compatibility/Doctor, clean prebuild,
exports, audit and code review as compensating verification. Native CI remains
required before release.

Migration acceptance applies the prior released migration set first, then runs
the current migrator and verifies preserved baseline data and new schema objects.
Every prior-release up and down migration is frozen by a checked-in SHA-256
inventory that normal tests enforce before the live PostgreSQL upgrade proof.
Each supported generated baseline variant selects a separate reviewed inventory.
PostgreSQL adapter acceptance also verifies that session rotation revokes the old
credential atomically and caps the replacement at the original family deadline.

The release gate runs Go vulnerability analysis and the package-manager audit
against the resolved dependency graph. CI has least-privilege permissions,
bounded runtime, and cancels superseded work. High or critical dependency
findings at any severity fail delivery rather than being silently accepted.
The API dependency graph pins `golang.org/x/net v0.58.0`, excluding the
GO-2026-5026-affected v0.53.0 release from generated modules and images.
Release image scans use the locally installed Grype 0.111.1 executable from a
checksum-verified immutable release archive. Scanner bootstrap must not execute a
mutable branch installer or delegate installation to the scan action.
CI runs the live Compose acceptance harness. A pinned Playwright/Chromium browser
must operate Scalar itself: authorize through Dex with PKCE, then send authenticated
Try It requests to `/v1/me` and a protected resource endpoint. Protocol-only
reconstruction is supporting evidence, not a substitute for this browser boundary.
The harness permits bounded UI retries while Scalar renders the Try It request
control and applies a successfully exchanged credential, but must fail if the
control never appears or Scalar never attaches the bearer credential. The browser harness waits for the authorization popup to close and for the exact
exchanged application credential to remain visible across repeated observations
spanning 500 milliseconds. This readiness wait has a five-second absolute bound.
Only then may it open Try It, with a separate bounded 45-second retry window,
request-level bearer detection and successful authenticated responses. It must
distinguish missing request controls from missing credentials when reporting
failure. This restores the reviewed Make App harness behavior to the no-example
scaffold; no credential is injected into the UI by the test.
Every harness invocation has a unique Compose project and performs project and
volume cleanup both before setup and on exit. Interrupted, stale, or concurrent
runs must not share migration state or persistence fixtures.
Harness assertions capture bounded multi-line producer output before applying
early-exit searches, so `pipefail` cannot relabel a successful match as a
nondeterministic upstream SIGPIPE failure.
Each added domain carries an adversarial HTTP composition test proving its
generated routes are registered, missing or invalid sessions return 401, and a
valid session receives 503 until an explicit authorization policy replaces the
fail-closed scaffold. The test exercises the real Huma route boundary rather
than substituting a direct service-only assertion.
It also proves an authentication dependency failure is not rewritten as an
invalid credential. Multi-domain generator tests include domain names whose
separator-stripping title forms would otherwise collide in Huma.
The browser also opens the web client with `es-ES`, verifies negotiation to the
supported `es` locale, checks the document language, and observes Spanish catalog
copy. Static catalog checks alone are not sufficient rendering evidence.
The no-example scaffold must invoke both browser harnesses from live acceptance.
Its protected-resource check uses audit history, not an absent example domain.
The web journey completes real Dex sign-in with S256 PKCE, renders the resolved
profile, restores it after reload, signs out, and remains signed out after reload.
Use the shared locale catalog for assertions and bounded locator waits; never
replace these journeys with mocked HTTP responses or a successful HTML fetch.
Shared runtime tests exercise supported and unsupported locale selection,
interpolation, singular and plural forms, and locale-aware number/date formatting.
The Expo adapter is tested with controlled device-locale readers for supported
regional and unsupported locales. These behavioral tests run in `make check`,
the pre-commit release gate, and CI.
Playwright is exact and age-gated. Its exact package version fixes the Chromium
revision used by acceptance; the browser is not independently represented as an
npm dependency and must not be described as independently age-gated.
Go release tools and their transitive dependencies are pinned in the dedicated
`tools` module, which is covered by the same dependency-age gate.
The generated web development service uses the digest-pinned hardened Node 24
builder and npm so its exact pnpm package-manager pin can start without an
unpinned global install. Its Compose environment enables pnpm's
non-interactive CI behavior so a stale or host-created modules directory cannot
block first startup waiting for a terminal prompt. The service runs with the
unprivileged `MAKE_APP_UID` and `MAKE_APP_GID` (both defaulting to 1000) so it
does not leave root-owned artifacts in the bind-mounted generated repository.
The supported Make and acceptance entrypoints populate those values from
`id -u` and `id -g`, including on CI hosts whose user is not UID 1000. Writable
temporary HOME, XDG cache, and npm prefix/cache locations make arbitrary numeric users
independent of `/etc/passwd`; release acceptance runs the image as 1001:1001.
The repository-local ignored pnpm store is shared by host bootstrap and the web
container. Live acceptance gives a cold container installation up to ten minutes
to become ready on a slow registry, then fails if the web boundary is unavailable.
Once Compose is live, browser acceptance runs through Node directly; it must not
ask pnpm to reconcile the bind-mounted dependency tree during the live test.
Browser acceptance drives the generated SvelteKit client through Dex sign-in,
the callback code exchange, application-session exchange, and authenticated
profile rendering. An unauthenticated localization-only render is insufficient.
Frontend session adapters validate exchanges before persistence, retry only
retryable failures, and preserve authenticated-offline presentation state. A
mobile orchestration test cold-starts with a valid stored credential while OIDC
discovery and the API are unavailable, and proves restoration completes in the
authenticated-offline state without deleting the credential. Default and blank
mobile clients invoke that restoration independently of provider discovery.
Post-exchange orchestration proves a profile 401 deletes the newly exchanged
credential while a profile 503 retains it and enters authenticated-offline.
Controlled loopback transport tests prove generated session exchange, refresh,
profile validation, and revocation request paths, bodies, credential ownership,
and status propagation without replacing the network transport. The structural
gate uses a fail-closed AST/import allowlist to reject direct, computed, aliased,
beacon, and dynamically imported application transports in both clients while
permitting provider traffic only through the exact OIDC adapters. Fixtures cover
same-directory `.mjs` and `.cjs` transports, unresolved or unsupported `$lib`
aliases, bare-window aliases and destructuring, and relative-import escapes into unapproved
shared helper roots. The browser-global policy permits only direct reviewed
`window.location` and `window.sessionStorage` access and rejects Window or
WindowProxy provenance through document, frame, opener, parent, top, assignment,
reassignment, and aliased window-opening forms.
Lexical binding tests distinguish legitimate local names from unresolved global
network primitives and reject alias, assignment, call, and constructor flows for
fetch, request, beacon, socket, event-stream, worker, RTC, and web-transport APIs.
Runtime-binding classification rejects erased ambient declarations (including
global augmentations), admits runtime enum and namespace bindings, and ignores
interface and type-only primitive names that cannot initiate network traffic.
Dotted namespace bindings remain within their outer namespace, while runtime
re-exports, import-equals declarations, and aliased CommonJS loaders pass through
the same exact import and global-reference allowlists as ordinary imports.
Provider imports remain confined to two small protected OIDC adapters. Web and
mobile presentation import only their primitive/application-domain operations;
the adapters accept no caller-owned objects or callbacks. A reviewed SHA-256
manifest pins both complete adapter sources, and the structural gate fails on
any adapter or manifest mismatch before semantic transport checks. Every
provider escape mutation class is therefore one protected-file hash failure,
including re-exports, aliasing, closures, callback arguments, container writes,
classes, composite values, and provider side effects. Changing a protected
adapter requires an explicit template change, regenerated canonical hashes,
updated behavior tests, and ordinary code review; presentation files may never
import provider libraries. Mobile `Home` remains a synchronous, non-generator,
parameterless default component.
Generator unit fixtures that exercise dependency-free structural rules block
package installation and run with no `node_modules`; bootstrapped default and
blank acceptance exercise the real pinned AST parser.
The web runtime configuration tests reject absent and unsafe production API,
issuer, and client settings. Container acceptance proves the production image
fails before serving without them while local Compose explicitly selects the
development contract.
PostgreSQL adapter integration tests run while the API service is stopped so its
authorization outbox worker cannot consume test fixtures concurrently. The
harness restarts the API and re-establishes readiness before exercising live HTTP
boundaries.
Both example and blank live harnesses stop SpiceDB and assert that `/readyz`
fails closed with 503 while `/livez` remains a dependency-independent 204.

npm packages and Go modules must be at least fourteen days old. The age gate
fails closed when registry metadata cannot be retrieved or parsed. A reviewed
exception must pin one exact ecosystem, name, and version in
`dependency-age-allowlist.json`, state why it is required, name compensating
verification, and be recorded in this specification. Lowering the global age
threshold is not an acceptable shortcut.
Metadata requests have bounded connection and total timeouts; unavailable
registries fail the gate closed instead of hanging local hooks or CI.
Broad transitive ranges are constrained when necessary to keep resolution
reviewable and age-compliant. The React Native/Jest 29 schema edge pins compatible
`@sinclair/typebox 0.27.8` instead of accepting newly published artifacts from
its broad range.

Reviewed baseline exceptions align native OIDC with the pinned Expo SDK 55
runtime: `expo-auth-session 55.0.17`, `expo-web-browser 55.0.18`,
`expo-secure-store 55.0.16`, `expo-application 55.0.17`, `expo-crypto 55.0.17`,
and `expo-linking 55.0.16`. Their compensating checks are exact pins, resolved
lockfile review, a clean vulnerability audit, Expo compatibility validation,
mobile type checking, and live OIDC/API acceptance as applicable.

The generated API directly pins `google.golang.org/grpc 1.82.1` to remove
GO-2026-6061 from its callable HTTP/2 and xDS graph. Because that security fix
is inside the normal fourteen-day observation window, its exact reviewed age
exception is compensated by generated Go tests, race tests, `govulncheck`, live
API/SpiceDB acceptance, Docker builds, and the hosted generation matrix.

The structural gate rejects oversized handwritten Go files, mocks, ad hoc print
calls, direct SQL helpers, environment reads outside configuration/bootstrap,
floating CI action references, and container images without immutable digests.
Generated delivery tests also enforce the reviewed Red Hat Hardened Images
boundary: Go and Node build stages, API and web runtimes, and PostgreSQL use
immutable HI references, while unsupported SpiceDB and Dex components remain
version-and-digest-pinned upstream images. Live acceptance proves that the
hardened PostgreSQL entrypoint, non-root Node runtime, and static Go runtime
preserve the generated application contract.
When the frozen JavaScript graph uses reviewed dependency patch files, every
container build copies those patches before its frozen install so production
images resolve the same verified dependency graph as the host build.
Generated Go files carrying the standard `Code generated ... DO NOT EDIT` marker
are exempt only from the line-length rule.
The structural gate also rejects literal user-facing text and translatable
attributes in Svelte and JSX/TSX. It validates every locale as non-empty and
key-complete against English, verifies matching interpolation parameters and
plural pairs, and runs before dependency installation as part of the normal gate.
Object property keys used only as protocol syntax, including HTTP header names,
are not copy; the gate must distinguish them from nested literal JSX expressions.

Routine pre-commit checks are change-aware. They always run structural,
formatting, contract-drift, and focused tests, and must run dependency-age and
resolved-graph security gates whenever a dependency manifest, lockfile, action,
tool module, or container definition changes. Full race, production-build, and
live acceptance gates remain mandatory before push and release. Release
publication may reuse successful CI evidence only when it is tied to the exact
commit SHA and fails closed if that evidence is absent.
Pre-commit and pre-push retain the hook-owned index for direct caller-repository
comparisons, including staged-change classification. Recursive check, generation,
dependency, verification, and acceptance make processes clear inherited Git
directory, worktree, index, and prefix variables so nested fixture repositories
cannot read or mutate the caller's hook index.
Tests that create temporary Git repositories clear inherited repository-local
Git environment variables, disable fixture hooks, and prove they leave the
caller's staged name-status unchanged, including under pre-commit alternate-index
execution.

Static Compose tests reject host networking and prove `.env` loading. Live
acceptance exercises bridge-network service discovery and the OIDC backchannel
without weakening public issuer validation. Acceptance cleanup removes its
project-scoped containers, volumes, and locally built images so repeated clean
runs do not exhaust a development or CI host.

## Shared TypeScript source resolution

Client-core is consumed as TypeScript source by Svelte/Vite and Expo/Metro. Its
public exports must resolve in both bundlers without nonexistent JavaScript
siblings. Use bundler module resolution and extensionless relative source exports.
Unit/type checks alone do not establish Metro compatibility; export both mobile
platform bundles as a regression gate.

Hosted native jobs export their platform bundle before compilation, independently
of the aggregate security gate, so unsigned native evidence also verifies Metro
resolution in the normal checkout. Export remains distinct from compilation.

Scalar acceptance selects the exact Authorize button accessible name. Endpoint
response descriptions such as Authorized normalized JPEG must not collide with
the authentication control locator.

## Go dependency security remediation (2026-10-23)

Pin gRPC v1.83.2 for GO-2026-6348 and GO-2026-6443, the OpenTelemetry v1.45.0
module family for GO-2026-6505, and x/text v0.41.0 for GO-2026-6629. The combined graph also raises the resolved x/net baseline to v0.58.0 and its required
protocol/logging/system modules; review those transitive changes with the same
age/checksum gates. Keep matching
OpenTelemetry API/SDK/exporter modules aligned. Verify proxy metadata, checksums,
the fourteen-day gate, application/contract checks, race tests and a fresh callable
vulnerability scan. These releases predate the age window; no new exception or
advisory suppression is permitted. Remove the obsolete gRPC v1.82.1 age exception.

This change does not clear the Go release gate: x/net v0.60.0 requires Go 1.26,
and standard-library advisories require a separately reviewed toolchain and
immutable build-image migration. Keep those findings release-blocking. Compare
before/after scans with the same Go executable so a compiler change cannot be
mistaken for dependency remediation. Package-audit findings remain independent.


## Patched Go toolchain (2026-10-23)

Use Go 1.26.10 consistently in the workspace, API, tools and container build,
and raise x/net to v0.60.0. This is a separate compiler remediation from the
same-compiler dependency comparison above. Rebuild govulncheck with the new
compiler, run a fresh callable scan, module verification, application and contract
checks, race tests and the dependency-age gate. Keep npm and image findings
independent; a clean callable scan does not waive them.

The exact compiler and Red Hat image release have security-driven exceptions to
the fourteen-day age policy. Review the official compiler archive checksum,
Red Hat signature, both platform SBOMs and the catalog CVE report before adoption.
The existing automated age gate covers package dependencies; compiler/image age
exceptions are recorded explicitly and reviewed manually.

Select the standard Go image (which already contains the compiler), rather than
the larger builder variant. Pin release 1.26.10-1792719708 and index
sha256:c8a592e35cf512e3469c0c4cac4ac01445f6185b9366c6a586e5d210e118a9e7.
Use GOTOOLCHAIN=local and checksum-verified modules through the HTTPS Go proxy
without direct VCS fallback. Build with CGO disabled and copy only application
binaries into the existing static runtime. No package installation is required.

The Red Hat release signature was verified against the official 63405576 key
and exact release identity/index digest; transparency-log inclusion was not
verified. Per-platform SBOM blob digests are
arm64 ae2bd21b4f4c87d13eb7697cbab10ff4f965963e1d906928abbbe56344b27895
and amd64 f8be7941c4d3665da97b8460c70ba3337fce73dfd16624624a732edfb026cb04.
The standard-image catalog report contains seven findings (three high, four
medium): CVE-2026-25679, CVE-2026-13501, CVE-2026-113351, CVE-2026-107161,
CVE-2026-97030, CVE-2026-6844 and CVE-2026-111497. These remain unresolved image
findings, not asserted false positives. Build-only C libraries are not copied
to the runtime; that containment is not evidence that the build image is clean.
Official review sources: https://images.redhat.com/,
https://security.access.redhat.com/data/63405576.txt and https://go.dev/dl/.

The application environment inventory recognizes GOPROXY, GOSUMDB and
GOTOOLCHAIN as explicit Go-owned settings; unknown unprefixed names still fail.


## Publication database enforcement tests

The exact file
`apps/api/internal/adapters/gormstore/dealer/inventory_publication_test.go`
has a reviewed structural exception for direct SQL in isolated PostgreSQL tests.
It attempts forbidden pointer updates, deletion and truncation as runtime and
migration-owner roles, and installs/removes one record-scoped failure constraint
to prove rollback after record/audit/history writes. Table names are fixed test
literals and the generated fixture identity is SQL-quoted. This exception is
limited to the test file; direct SQL remains prohibited in production Go code.
The tests never use the legacy or production database.

The exact file `apps/api/internal/adapters/gormstore/dealer/inquiry_inbox_test.go`
has the same test-only exception to attempt forbidden deletion/truncation of
read receipts and execute the embedded acknowledgment rollback migration inside
an explicitly rolled-back transaction. The fixed table names and repository-owned
migration contain no external SQL input. These checks prove append-only runtime
privileges and refusal to remove retained receipts on an isolated fixture.

The exact file `apps/api/internal/adapters/gormstore/dealer/inventory_scan_test.go`
has the same test-only exception for fixed UPDATE/DELETE/TRUNCATE statements
against scan-label associations. Record IDs use bound parameters. These isolated
PostgreSQL tests verify runtime privileges and trigger-enforced immutability;
production SQL restrictions remain unchanged.

The web Turnstile boundary is an exact hash-protected provider adapter. It may
load only Cloudflare's fixed explicit-render script and expose token/error
callbacks; it receives no contact or application credential. The ordinary client
transport gate remains unchanged for other source files. Built-web inquiry
acceptance uses a controlled HTTP service to exercise form validation, failure
preservation, explicit retry, localization, focus and success clearing. This
fixture is not evidence of durable backend delivery or live CAPTCHA validation;
those retain their separate integration/provider gates.
The additional enabled-policy browser gate denies DNS resolution for the provider
host, verifying unavailable verification, explicit retry, retained contact and
zero delivery attempts. Optional `INQUIRY_TEST_TURNSTILE=1` uses Cloudflare's
public test site key against the real widget, independently of backend provider
validation. Expiry and navigation during an active challenge still require
interaction coverage; a successful widget run alone does not prove those paths.

Persisted inquiry browser acceptance runs `node
scripts/inquiry-persisted-browser-acceptance.mjs` against an isolated loopback web
service and its actual API/PostgreSQL/Dex fixture. Set
`INQUIRY_ACCEPTANCE_SHOWROOM_SLUG`, `INQUIRY_ACCEPTANCE_PIANO_ID` and
`INQUIRY_ACCEPTANCE_DEALER_NAME` to a synthetic published listing owned by the
fixture's `developer@example.com` identity. `INQUIRY_ACCEPTANCE_WEB_URL` defaults
to the local development web origin. The script submits through the anonymous
form, performs real PKCE login, reads and marks the message through the inbox,
and verifies the exact persisted receipt after reload. It requires explicit
local disabled challenge policy; separate provider gates verify CAPTCHA.

Client presentation may construct an AbortController to cancel generated-client
requests. It supplies only cancellation state, not transport. The structural gate
continues rejecting fetch, browser-global transport and alternate clients even
when an AbortController signal is provided.

Native QR camera access is confined to `apps/mobile/src/inventory/scan-camera.tsx`. The structural gate permits `expo-camera` only there, rejects direct imports from presentation and still rejects network primitives inside that adapter. The adapter exposes QR-only preview and camera permission, not media recording or alternate API transport.

The exact file `apps/api/internal/adapters/gormstore/customer/postgres_test.go`
may execute SQL for controlled PostgreSQL fixtures and adversarial schema tests:
proving runtime DELETE denial, immutable ownership/revision guards, corruption
rejection, and rejection of previously committed audit proof. This exception
allows testing database enforcement beneath the repository. Production customer
persistence uses typed GORM operations; the exception does not cover product code.

The same narrowly scoped schema-test exception applies to
`apps/api/internal/adapters/gormstore/technician/postgres_test.go`. It creates
isolated users and attempts unauthorized writes, corrupt attributes and audit
reuse to prove the technician database boundary. Production technician storage
continues to use typed GORM operations; no other file gains SQL execution.

Customer editor ownership is confined to the exact hash-protected adapters
`apps/web/src/lib/customer/ownership.ts` and
`apps/mobile/src/customer/ownership.ts`. The web adapter holds a conditional
exclusive Web Lock until its lease releases; the native adapter shares one
registry across module reloads in the UI runtime. Neither grants network or
storage capabilities to callers. Review and regenerate hashes when changing
these files; do not broadly permit browser globals or runtime registries.

The exact hash-protected native adapter
`apps/mobile/src/customer/presentation.ts` retains the customer presentation
lifetime across route remounts and module reloads. Controlled asynchronous tests
verify retirement during opening and cleanup ordering. A real workspace test
denies access, fails journal deletion, unmounts and retries through the retained
lifetime; no replacement acquisition can bypass cleanup. This adapter grants no
network or storage capability. Its hash and tampering checks follow the same
review requirement as the ownership adapters.

The built-web customer acceptance journey uses a stateful local HTTP fake behind
the generated client and real browser Web Locks, IndexedDB and WebCrypto. It
covers creation, immutable retry after lost response and reload, child validation
focus, explicit conflict decisions, removal confirmation, competing tabs, delayed
old-token rejection after session rotation, denial cleanup, Spanish navigation
and logout recovery invalidation. This is browser integration evidence; real
API/session/PostgreSQL/SpiceDB tests remain separate, and it does not establish
native interaction acceptance.

Session-rotation browser acceptance runs the built web app with a stateful HTTP
fake. It holds an inventory save, refreshes the opaque session, rejects the old
request and proves reload retains both the exact pending command and newer edits.
It separately holds voice extraction across refresh and preserves the transcript
for explicit retry. Current-session rejection still clears credentials and hides
private content. Typed API-client tests exercise delayed real HTTP failures for
dealer, inventory, inquiry, voice and customer families; 403/404 and unrelated
failures are not changed by rotation. These checks do not substitute for native
device acceptance.

Technician editor ownership and native presentation use the corresponding exact
hash-protected `technician/ownership.ts` web/native adapters and native
`technician/presentation.ts`. Their exceptions permit only reviewed Web Locks
and runtime singleton access, never network transport. Tampering tests append
unauthorized fetch to each adapter and must fail. The native singleton test
re-evaluates the module, and the browser ownership journey exercises actual
two-tab exclusion, independent identities and tab-close recovery. Encrypted
recovery tests cover incomplete technician rules through restart, foreign
API/user isolation and invalidation of old handles after sign-out. These do not
replace mounted screen and device acceptance.
The technician native ownership module-reload regression runs in `make check`.

Technician persistence and policy/HTTP PostgreSQL integration tests run in the
isolated acceptance database, with the typed SpiceDB runtime proxy. The built-web
technician journey runs after the web build and covers creation, incomplete rule
recovery, exact pending retry, independent origin/rule zones, conflict decisions,
competing tabs, localized removal, rotated sessions and denial exit/cleanup.

The browser session-rotation journey owns virtual time: pause its installed clock
before entering the editor and advance only at explicit rotation steps. A real
scheduler delay before manual save must not allow autosave to dispatch the held
request first. This keeps manual-save/rotation assertions deterministic without
weakening autosave behavior or extending interaction timeouts.

## Persisted web profile acceptance

The recurring isolated real-service acceptance must exercise customer and
technician profiles through normal browser sign-in and UI saves, without replacing
API routes or seeding application session storage. Use the synthetic second
account and require absent profiles before creating fixtures; never overwrite
existing profiles to make a test pass. Assert business/location/piano references,
weekly timezone and effective dates, reload and a subsequent edit via independent
real API reads. A separate signed-in user must not receive either profile.
Keep fixture browser tests for controlled failures; this composed journey adds
evidence and does not substitute for authorization or device acceptance.

## Recurring persisted inquiry, history and scan journeys

After the isolated dealer API acceptance has provisioned and republished its
synthetic dealer/piano and verified staff boundaries, run the existing persisted
browser inquiry, history and scan journeys using those exact identifiers. Resolve
the current private title before each journey rather than relying on a title an
earlier journey may have changed. Each child authenticates normally; do not pass
parent application session environment variables into browser subprocesses.

Inquiry acceptance must verify the saved inquiry snapshot remains unchanged after
the owner changes and republishes the piano. History keeps bounded 20+5 pagination
and unsaved-field preservation. Scan retains real-provider continuation, private
token handling, status changes and sale history assertions. A child failure fails
the recurring acceptance command; no route fixtures replace these interactions.

The disposable acceptance Compose override explicitly disables the external
challenge on both API and web, with empty verifier credentials. This configuration
is confined to synthetic local acceptance; production defaults stay fail closed.
Live Turnstile composition remains a separate unproven provider gate.

## Composed photo-first web publication journey

Use the synthetic dealer created by recurring API acceptance, and create a new
piano through the web's New action with a selected image before entering required
publication fields. Assert that New alone sends no create command and that photo
selection creates exactly one private record. Use normal PKCE login and actual
image processing/storage. Save exact money and partial manufacturing dates,
reload, then publish through review/confirmation. An anonymous context must see
the saved public snapshot and processed image, never private notes. Later private
title/photo edits must leave the public snapshot unchanged until publication or
unpublication is explicitly confirmed. Verify anonymous disappearance after
unpublishing. This complements controlled failure tests without substituting for
real speech-provider, accessibility or native-device acceptance.

## Composed dealer profile settings

The recurring real-service browser acceptance creates its own synthetic dealer
through normal owner login. Verify duplicate-slug rejection retains the entered
form, then create with a unique slug, persist all profile settings, reload/edit,
and compare independent private API reads with the public showroom projection.
Publish visibility only through explicit owner save, then hide it and prove
anonymous access disappears. Browser setup must not mutate legacy data or seed
application sessions. Verify banner selection/review, replacement, removal cancellation and confirmed
removal through real processing/storage and anonymous rendered image delivery.
Staff journeys remain separately tracked until verified with real services.

## Separate web server API addressing

Server-rendered showroom, media and crawler routes use a validated private
`PIANOTECHPROS_SERVER_API_URL` override, falling back to the configured browser API
URL. Never serialize this override in layout data. Development Compose uses
`http://api:8080` for server requests and keeps the browser-facing localhost URL.
Production preserves the existing HTTPS/nonlocal endpoint constraints; credentials,
queries, fragments and non-HTTP(S) URLs are rejected in every environment.
Exercise the split address in composed browser acceptance and cover invalid
configuration and production fallback in behavioral configuration tests.

## Two-user persisted staff browser journey

Use two independently authenticated browser contexts and a new synthetic shop.
The owner issues an editor invitation through the UI; the second user reviews and
accepts it, waits for the durable authorization grant, and creates an inventory
draft through the browser. Change that membership to viewer through the owner UI
and prove real reads remain allowed while writes and staff administration are
denied. Remove access through confirmation, then prove the existing browser
session loses both private reads and inventory UI access. Revoke a second unused
invitation through the UI and reject its preview from the other user. Never put
invitation tokens in URL paths, query strings, screenshots or failure output.
Bound polling to the asynchronous grant behavior; do not retry mutations or
replace real authorization decisions with HTTP fixtures.

## Persisted journey rate-limit isolation

The sequential real-service browser journeys reuse one synthetic owner. Wait a
full minute plus one second before each child, including before its preparatory
read, so earlier scenarios cannot consume its audit allowance. Keep production
rate limits unchanged; do not retry failed mutations or suppress 429 assertions.
A journey must still pass within its own normal per-principal allowance.
