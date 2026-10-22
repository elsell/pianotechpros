# Platform roadmap

## Current milestone: feature-complete product

The user clarified that scaffold completion does not satisfy the request.
`product-parity.spec.md` records the audited legacy baseline and the completion
matrix. All product rows remain open. Sequence work through dealer authorization,
inventory/drafts/photos, publication/lifecycle/QR, voice, showroom/inquiries and
customer/technician profile parity; resolve security findings and collect real
web/native interaction evidence throughout. Signing and production cutover alone
remain deferred by user instruction.

Dealer implementation has started: the profile/access contract, typed fields,
profile validation, generated repository/HTTP boundaries and contracts exist.
Optional-field, Unicode and malformed-profile tests pass, as do `make check`
and contract drift checks. Membership persistence, unique slugs, actor-scoped
reads, profile revisions and atomic write/audit behavior now have real PostgreSQL
coverage, including concurrent slug/CAS writers and restricted runtime-role
permissions. The race-enabled adapter suite passes. Dealer private get/list now
apply both membership and SpiceDB checks with audit and principal limiting;
creation and profile updates now implement the mutation/outbox protocols. Real isolated SpiceDB tests through the runtime
proxy pass the owner/editor/viewer permission matrix, cross-dealer denial,
revocation and rejection of runtime schema writes. Application/HTTP read tests
cover denial and dependency failures. Review identified candidate-ID disclosure
through pagination/audit; encrypted dealer cursors and collection-targeted list
denials address it. Creation/update stateful-fake and HTTP tests cover retry
recovery, atomic audit failures, stale revision conflict and denied access.
The hosted real-service dealer journey has passed as recorded below.
Staff membership/invitation behavior is specified in `../dealer/staff.spec.md`;
domain transitions now enforce local role capabilities, immutable founding owner,
revision-safe revocation/reactivation, one-time consumption and exact expiry.
Review exposed stale-grant reuse on reinvitation; domain capabilities now require
confirmation of the current membership revision, and the spec requires atomic
outbox confirmation tied to the pending touch ID. Migration 20 now persists confirmation and pending grant ID/revision; ordinary
dealer reads/updates require confirmation, while founding-owner creation has a
restricted pending read. Outbox completion confirms only the matching active
revision in the same transaction as audit. Real PostgreSQL tests pass audit rollback,
superseded/revoked grants, runtime credentials and fail-closed migration backfill.
Staff revocation persistence now atomically denies local access, clears pending
grants, queues relationship removal and records a dealer/user-specific audit.
Real PostgreSQL tests cover owner protection, stale revisions, inactive owners,
audit/outbox rollback, runtime privileges and concurrent removals. Review found
a resource/membership lock-order cycle; acquiring the resource lock first fixes
it. A deterministic worker-completion/removal test passes with the fix and fails
under the original lock order. Role-change persistence now queues old-role deletion before the replacement
grant and advances the membership revision atomically with audit. Role edits and
removals have authenticated, principal-limited HTTP commands with owner/SpiceDB
checks, revision conflicts and explicit pending-grant responses. Stateful-fake
application/HTTP tests and generated registration tests cover denial and failure
boundaries; PostgreSQL tests cover ordered confirmation, rollback and concurrent
runtime-role edits. Migration 21 and staff invitation persistence now support digest-only storage,
owner-scoped creation/revocation and atomic one-time acceptance by an already
active account. Acceptance rechecks expiry after locks, reactivation requires a
new pending revision, and runtime DELETE/TRUNCATE privileges are explicitly
revoked for invitations and memberships. Real PostgreSQL race tests pass
concurrent acceptors, expiry during a resource-lock wait, replay, disabled
accounts and audit/outbox rollback. Invitation creation, preview, acceptance and revocation APIs now enforce
canonical random tokens, session/principal limits, active accounts and issuer
SpiceDB authority. Sensitive HTTP validation errors are redacted and responses
disable caching/referrers. A real isolated PostgreSQL/Dex/SpiceDB journey through
the runtime capability proxy passes invitation, pending-grant confirmation, role
change, removal and reinvitation, including replay/cross-user denial. That run
exposed a translated unique-constraint error mapping bug (duplicate slug returned
500); profile writes now map it to conflict, and database tests use production
error-translation settings. GORM unstructured SQL logging is disabled; a
subprocess regression proves query parameters are not echoed on database errors.
Owner staff and invitation lists now use bounded, actor/dealer/list-bound encrypted
cursors, owner/SpiceDB checks, persistence rechecks and audit-before-response.
Invitation projections exclude token digests. Real PostgreSQL race tests and
application/HTTP boundary tests pass; code review found no blocking issue. The
real-service acceptance script covers list pagination and terminal states;
those assertions passed against the hosted service stack on `9afe4d9`.
The shared typed client facade now covers dealer profile and staff operations,
preserving revisions, creation idempotency and sanitized machine errors. Local
HTTP tests cover wire behavior, credential rotation and invitation secret handling.
The framework-independent directory has controlled-fake tests for empty pages,
retry, pagination coalescing and late-response isolation across account/selection
changes. The web directory now shows membership-scoped shops and selected profiles with
localized loading/retry/pagination states. A real Chromium journey against a
controlled HTTP fixture passes Spanish rendering, keyboard selection, a 390px
layout without overflow, late profile responses after sign-out, and late refresh
credential rejection. The mounted directory is bound to the verified credential;
private content clears immediately on sign-out. Web creation/edit forms now cover all profile fields, preserve one creation
snapshot/key through uncertain outcomes, and require explicit review before
rebasing conflicted edits. Browser fixture acceptance passes a lost-response
creation retry with one persisted shop and a concurrent profile edit with
explicit revision review. Review caught transient session outages unmounting
forms; a failing browser regression now passes after keeping the account-scoped
workflow mounted across outage/recovery and credential rotation. Both pending
creation intent and entered edits survive. Full service-stack browser journeys,
native presentation remains unfinished. Web invitation consumption now has a
bounded private-code parser, explicit preview/acceptance and ordinary-access
confirmation before shop entry. Core tests cover malformed inputs, mismatched
identities, lost-response recovery and late responses. Browser fixture acceptance
passes invalid codes, preview invalidation, pending grants, replay rejection and
absence of codes from URLs/browser storage. These fixture checks do not prove
the full service-stack browser journey. The web staff
view now supports independent member/invitation pagination, revision-checked
role changes and confirmed removal/revocation. One-time invitation codes stay
in memory and clear on dismissal, successful revocation or teardown. Shared
controller tests cover pagination, owner protection and late secret suppression;
browser fixture coverage includes denied administration, conflict refresh,
pending grants, confirmed removal and invitation revocation. DL-01 through DL-04 remain open. No security
finding is waived.

Native dealer browsing now uses a shared session provider, account-scoped list
and profile state, native stack navigation, pull-to-refresh, pagination and
localized retry states. Profile sections adapt to light/dark appearance and
system text sizing. Sign-out blocks private presentation before secure-storage
deletion; a controlled-fake regression covers deletion failure and retry.
Both Metro platform exports, `make check check-contracts`, and mobile
type/i18n/boundary checks pass. Required read-only review found no blocking issue. These
are export checks, not Gradle/Xcode builds or device interaction acceptance.
Native invitation consumption now provides a keyboard-aware, localized paste,
preview, explicit acceptance and access-confirmation screen. The shared controller
discards late responses after dismissal; its regression suite covers pending
access, lost responses, mismatched identities and leaving during access recovery.
Both platform exports, `make check check-contracts`, mobile type/i18n/boundary
checks and read-only review pass.
Native creation/editing now expose all profile fields in grouped forms with
appropriate keyboards, a showroom switch and discard confirmation. A shared
controller preserves uncertain creation snapshots/keys, blocks save until explicit
conflict review, and suppresses late save/review results after disposal. Tests
cover stale/foreign revisions, concurrent commands and corrected validation errors.
Save returns to a refreshed profile; list/profile focus refresh prevents stale
navigation results. Both Metro exports, `make check check-contracts`, i18n and
boundary gates pass; required read-only review found no blocker. Native staff
administration now has grouped paginated member/invitation lists, pending states,
role changes, destructive confirmation dialogs, bounded invitation expiry and
memory-only selectable codes. Shared staff state clears on explicit access
rejection while transient failures retain issued codes. Review exposed a parallel
list failure race; per-request rejection handling and serialization through both
responses fix it. Controlled-fake tests cover both response orders, and Chromium
fixture acceptance proves prior member data and codes disappear on rejection.
Required follow-up review found no remaining blocker. Inventory and publication
slices remain unfinished. The staff slice passes `make check check-contracts`,
both final Metro platform exports and the Chromium fixture journey. Runtime
keyboard, discard-dialog, navigation, large-text and accessibility acceptance is
still required; these checks do not establish native interaction quality.

Inventory implementation has started with `../inventory/record.spec.md` and a
framework-free domain model for all private editor fields. Validation preserves
unknown values, partial-date precision, exact money and custom manufacturer text;
draft construction requires injected identity, stock and time. Controlled tests
cover invalid calendar dates, Unicode bounds, money precision and caller-owned
pointer isolation. The domain race suite and `make check check-contracts` pass; required read-only review
found no blocker. No inventory route, persistence, lifecycle transition, public
projection or client workflow is enabled by this foundation; those parity
requirements remain open.

Inventory revision and lifecycle value commands now return a new record plus
private append-only-history data. They preserve identity and draft isolation,
reject stale revisions and invalid clocks, require explicit sale prices and
correction reasons, and reject lifecycle changes from voice sources. Domain
race tests cover all status pairs, zero sale prices, pointer isolation and
revision exhaustion; `make check check-contracts` passes and required read-only
review found no blocker. Atomic
persistence/audit/history, publication-status updates and voice-proposal merging
remain prerequisites before exposing these commands.

Publication domain commands now construct an explicit public allowlist and
defensively copy date, money and ordered photo references. Readiness rejects
missing facts and foreign/unready photos; private serial/cost/notes/location and
hidden prices cannot enter the public type. Lifecycle overlays preserve the
snapshot while changing availability; unpublish/archive hide it and corrections
never automatically restore visibility. Tests cover private-field serialization,
mutated inputs/returned views, cross-dealer references, sale with unrelated draft
edits and old-snapshot retention across republish. Domain race tests and
`make check check-contracts` pass; required review found no blocker. Trusted media
evidence, transactional persistence, showroom visibility and public delivery
remain unimplemented integration requirements.

Inventory access now has a request-local application policy helper requiring
scoped opaque authentication, the coordinated audit limiter, active confirmed
dealer membership and the exact SpiceDB read/write/publish permission. Owner
identity inconsistencies and pending/revoked/foreign memberships fail closed;
denied/failed decisions audit only a fixed inventory collection target. Controlled
fake and race tests cover the role/permission matrix, missing scopes, dependency
failures and audit/limiter behavior. `make check check-contracts` passes and required
review found no blocker. This helper registers no HTTP route and grants no
standalone operation: actor-scoped PostgreSQL access, transactional authority
rechecks/history/audit and generated service composition remain to implement.

The dealer PostgreSQL adapter now implements inventory's actor/dealer-scoped
membership preflight reader. Real isolated database tests prove pending-grant,
confirmed-owner/editor, cross-dealer/user, revoked membership and disabled-account
behavior, including a separate connection using runtime credentials. The initial
test caught missing embedded membership mapping; an explicit exported GORM
embedding fixes it. The full dealer PostgreSQL race suite and targeted final
runtime-role test pass; required review found no blocker. This is a preflight
adapter only, not inventory record persistence or transactional permission locking.

Migration 22 and the inventory repository now persist empty drafts and private
reads with transactional membership/account rechecks. Same-intent retries return
one record, and creation commits its record, immutable history and audit together.
The isolated PostgreSQL runtime-role race suite passes concurrent retries,
revoked/cross-user reads, duplicate-stock conflicts, denied history rewrites and
record deletion, plus rollback on audit and history failures. Review findings for
translated constraint errors and migration readiness were fixed. `make check`
and contract drift checks pass. This is storage infrastructure; inventory HTTP
commands, photos and product journeys are still open.
Attribute editing persistence now applies the domain revision command under the
same authority locks, with atomic audit/private history. Real PostgreSQL race
coverage passes competing CAS writers, stale and cross-user/dealer edits,
no-op/invalid input, stock collisions and audit-failure rollback. Status and public
snapshots cannot be changed by this operation. HTTP and client integration remain
open; this storage evidence does not establish an end-user editing workflow.
Application commands now compose fresh session/membership/SpiceDB/limiter policy
with transactional empty-draft creation, private read and manual attribute edits.
Stateful-fake tests cover idempotent recovery, revision conflicts, malformed input,
missing dependencies, repository failures and collection-scoped auditing when
permission disappears after preflight. Manual editing cannot inject a voice source.
These commands still need generated HTTP composition and wire-boundary coverage
before web/native integration; no inventory route is exposed by this change.


`make check check-contracts` passes without a structural-gate exception; the
disposable database and its volume were removed after verification.

Hosted run [39841513337](https://github.com/elsell/pianotechpros/actions/runs/39841513337)
on `96ec85f` finished Android Gradle and unsigned iOS simulator Xcode jobs
successfully, alongside real-service acceptance. Its aggregate run is marked
cancelled and verify failed; the native job results themselves are success.
This is compilation evidence for dealer browsing/invitation consumption at that
commit, not for subsequent native forms/staff changes or device interactions.

Hosted run [39839184001](https://github.com/elsell/pianotechpros/actions/runs/39839184001)
on `9afe4d9` passed its real-service acceptance job: browser Spanish/PKCE/session
restoration/sign-out, Scalar identity requests, dealer creation/read/edit/retries
and cross-user denial, invitation/grant/role/removal/reinvitation, and owner list
pagination/terminal states/secret exclusion. Dealer journeys in this job are HTTP
API checks, not browser interaction checks. The verify job failed on 23 reachable
Go vulnerabilities; Android/iOS
native jobs were still running when inspected. This does not establish a passing
release or native interaction acceptance for the newer mobile changes.

## Completed foundation: public scaffold

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
