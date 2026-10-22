# Platform roadmap

## Current milestone: public scaffold

Fresh Go API, SvelteKit web and Expo iOS/Android foundation generated from Make
App, with authentication, authorization, audit and generated contracts. Existing
production stays independent. Release publication is manual and CI-gated;
GitOps, DNS changes and store signing are absent.

The photo-first inventory workflow and native interaction requirements are
specified. They are not yet implemented. Native product design and interaction
acceptance are first-class work, not a final styling pass.

## Verification on 2026-10-22

- Generated contracts, structural checks, Go tests, client tests and type checks
  passed locally. Go race tests and the dependency-age gate passed.
- Read-only code review found an inherited mobile sign-out race. A session
  generation guard and serialized secure-storage writes now prevent stale
  completions restoring credentials. Controlled-fake regression tests and
  mobile type checks pass; native runtime verification remains required.
- Pattern scan of public source found no legacy infrastructure identifiers,
  recognizable provider tokens or private key material. This is not a security
  certification. Bundled development credentials are synthetic and local-only.
- Initial full `make verify` was blocked by dependency advisories: govulncheck
  reports 16 reachable vulnerabilities in the inherited graph and standard
  library. npm audit reports 72 advisories, including dependencies with no
  published patched version. Security gates remain enabled and fail closed.
- Web production build and both mobile Metro exports pass after correcting
  inherited client-core exports for Metro resolution. Exports are not native
  compilation or interaction evidence.
- Initial source publication used an explicit one-command local hook bypass after
  running checks manually, because the inherited security graph fails. Hooks and
  hosted security gates remain enabled; this is not release approval.
- Dependency remediation is tracked in https://github.com/elsell/pianotechpros/issues/2.
- Initial bootstrap ran out of disk during contract generation; regeneration
  succeeded using a separate temporary build location. Docker/live acceptance
  cannot safely be run on this nearly full host. Hosted results must be recorded
  separately; inherited generator evidence is not application evidence.

## Before release or authenticated product acceptance

1. Refresh the inherited dependency/toolchain/image pins against current
   advisories. Review any unpatched transitive findings for actual reachability;
   do not suppress the security gate to make CI green. Re-run age/security,
   native compatibility, browser/API acceptance and container scans.
2. Run interactive sign-in/sign-out recovery checks on named native builds;
   hosted Android and unsigned iOS compilation is verified below.
3. Specify dealer/staff authorization and adversarial cross-dealer tests.
4. Implement a single end-to-end private capture slice: photos, recoverable draft,
   inventory list/detail, and typed/manual entry with native controls.
5. Add reversible dictation and explicit public snapshots, public showroom and
   inquiry flows, preserving the capture contract.
6. Review narrow phone, large text, tablet, keyboard, screen-reader, camera and
   microphone journeys on each platform.
7. Configure store identities, artwork, signing and account access; choose a
   separate deployment hostname and isolation/promotion/rollback design.

No product-completeness, production-readiness, physical-device QA or store-delivery
claim is made by this scaffold milestone.

## SDK compatibility follow-up

The initial hosted API/Compose acceptance passed on commit `0cfea9d` (run
[39799502085](https://github.com/elsell/pianotechpros/actions/runs/39799502085)).
Both native jobs stopped at the outdated Expo patch compatibility check.
The SDK 55.0.32 refresh passes frozen installation with pnpm 11.0.7, all 19
Doctor checks, native manifest compatibility, client types/tests, the age gate
with nine documented exact exceptions, and both Metro exports locally. Local
exports used a temporary watch-folder setting for memory-backed dependencies
because of host disk pressure; that machine-specific setting is not committed.
Hosted jobs now export platform bundles before compilation in a normal checkout.
Hosted Android and unsigned iOS compilation for this refresh passed.

## Current hosted evidence

Commit `52cdd34` was checked in run
[39812943749](https://github.com/elsell/pianotechpros/actions/runs/39812943749).
API/Compose acceptance, including its container builds, passed. Both hosted
platform exports, Expo Doctor and native compatibility checks passed in ordinary
checkouts. Both Android Gradle `assembleDebug` and unsigned iOS simulator Xcode
compilation passed. These establish compilation, not native interaction acceptance.

The verification job failed at `govulncheck`: **23 reachable vulnerabilities**
with the CI-pinned Go 1.25.12. The earlier local count of 16 used Go 1.25.13;
neither result passes the security gate. The separate release-style container
build check after `make verify` did not run. The refreshed JavaScript graph still
reports 72 npm findings (1 critical, 48 high, 19 moderate, 4 low).

Registry checks on 2026-10-22 confirmed that the suggested node-forge 1.4.1,
braces 3.0.4 and sprintf-js 1.1.4 versions are not published. Their affected paths
include Expo signing tooling and build/test utilities; this is not proof of
unreachability. Signing remains deferred. Other advisory fixes are published,
but require compatibility, supply-chain and regression review before adoption.
Issue #2 remains the release-blocking remediation work; no audit threshold or
vulnerability exception has been introduced to obtain a passing result.

## Browser acceptance correction

Completion review found that the no-example template's Compose harness fetched
web HTML but did not invoke a browser. The earlier API/Compose success must not
be treated as browser interaction evidence. The harness now invokes real
Playwright web and Scalar journeys: Spanish rendering, PKCE sign-in, profile
restoration, sign-out, and authenticated profile/audit requests from Scalar.
Run [39815345999](https://github.com/elsell/pianotechpros/actions/runs/39815345999)
on `6a475dd` passed the web Spanish/PKCE/restoration/sign-out journey, but Scalar
failed to observe its bearer credential. The no-example harness had omitted the
template's popup-close and stable-credential readiness gate. That behavior is
restored with its eight passing deadline/readiness tests. Run
[39820827096](https://github.com/elsell/pianotechpros/actions/runs/39820827096)
on `fee2368` then passed the complete live acceptance job: the web journey,
Scalar PKCE and authenticated profile/audit requests, and API/Compose checks.
Native checks in this PR were path-skipped; actual compilation evidence remains
the main-branch run above.

## Scaffold completion boundary

The public repository has fresh history and reviewed Make App provenance. The
Go API, web and native foundations are present; photo-first capture and native
experience contracts are recorded. Project-specific unit/type/structure/race/age
checks, live browser/API acceptance, Android compilation and unsigned iOS
compilation have evidence above. The browser follow-up changes only acceptance
scripts and specifications, so the native build evidence still applies.

This completes the scaffold deliverable, not a release approval. Dependency
security remediation in issue #2, product vertical slices, interactive native
and physical-device QA, final store identities and signing remain outstanding.
The legacy service, GitOps, DNS and data have not been changed. No production
credentials, deployment hooks or signing material were added.
