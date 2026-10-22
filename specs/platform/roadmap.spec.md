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
2. Obtain successful hosted Android and unsigned iOS simulator builds. Run
   interactive sign-in/sign-out recovery checks on named native builds.
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

The initial hosted browser/API acceptance passed on commit `0cfea9d` (run
[39799502085](https://github.com/elsell/pianotechpros/actions/runs/39799502085)).
Both native jobs stopped at the outdated Expo patch compatibility check.
The SDK 55.0.32 refresh passes frozen installation with pnpm 11.0.7, all 19
Doctor checks, native manifest compatibility, client types/tests, the age gate
with nine documented exact exceptions, and both Metro exports locally. Local
exports used a temporary watch-folder setting for memory-backed dependencies
because of host disk pressure; that machine-specific setting is not committed.
Hosted jobs now export platform bundles before compilation in a normal checkout.
Hosted native compilation for this refresh is still pending.
