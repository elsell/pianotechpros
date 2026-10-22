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
- Full `make verify` is blocked by current dependency advisories: govulncheck
  reports 16 reachable vulnerabilities in the inherited graph and standard
  library. npm audit reports 72 advisories, including dependencies with no
  published patched version. Security gates remain enabled and fail closed.
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
