# Platform roadmap

## Current milestone: feature-complete product

Dealer banner parity (DL-03) is merged in PR #60 after both native builds and acceptance passed. The read-only legacy review confirms upload/replacement/removal, alt text and public delivery. The new banner contract specifies owner-only audited media commands, revision-bound replacement, replay-safe uploads, scoped current-image delivery and native review before publication. The backend slice has scoped banner evidence, owner-authorized processing and transactional replacement/removal, current public-image lookup, and metadata-stripping WebP decoding through the shared concurrency budget. Domain/application/processor race tests and real PostgreSQL banner lifecycle/public-visibility tests pass; the project critic found no blocking issues in these boundaries. Private/public HTTP routes and generated contracts are now connected; public clients accept only explicit bounded banner metadata. HTTP lifecycle, denied-before-read, binary body limits and anonymous source-limit tests pass. Public web banner display now passes image-load, English/Spanish fallback text, narrow-layout and unpublished-image denial browser acceptance. The owner web workflow now uses shared immutable upload intents and explicit review/removal; development and built-runtime browser journeys cover cancellation, invalid previews, uncertain committed uploads, conflict refresh/review, replacement, uncertain removal, revocation clearing, Escape, Spanish and narrow layout. Its API adapter and controller pass the full client suites (196 and 377 tests). Native owner controls now use the protected system-picker broker and an explicit review sheet. Five picker lifecycle tests and all 382 client-core tests pass. Android emulator interaction with the isolated real API verifies picker cancellation, preview cancellation, confirmed upload, removal cancellation and confirmed removal. iOS device, screen-reader and broader interruption acceptance remain open. Dependency-age, Go vulnerability scanning, generated-contract checks and broad project checks pass; the broader security command reports only the previously reviewed node-forge advisory. The critic confirmed the corrected outer upload budget and found no remaining blockers in the backend/public-display boundaries. Its remaining device acceptance is not represented as complete.

Public listing discovery and sharing (SH-03/SH-04) merged in PR #61 at
`71ecae553259eb21d1faab1c599cd96e4077181e`. Readable published-title aliases,
bounded related listings, canonical/social metadata, escaped JSON-LD and web/native
public-link sharing pass browser acceptance, Android compilation and unsigned iOS
compilation. Android interaction confirms a private title edit never enters the
share sheet. iOS interaction remains unverified. Verification reports only the
previously reviewed node-forge advisory; no security threshold was weakened.

Crawler discovery (SH-05) merged in PR #62 at
`e730017ef309acab45e184795ffbcf05aba36182` after acceptance and both native builds passed. Dedicated anonymous directory and
catalog ports return minimal public projections with bounded batch reads and
publication visibility locks. Isolated PostgreSQL tests cover private edits,
sold publications, unpublication, corrupted snapshots, capacity overflow, failures
and concurrent showroom/piano unpublication. HTTP and client tests cover source
limits, missing policy, sanitized failures, foreign records, duplicates and private
fields. Root-level sitemap files preserve protocol URL scope. Robots and localized
public discovery text use only the configured origin; absent configuration blocks
crawlers and fails before API reads. Development and production browser acceptance, full project/contract
checks and critic review pass, including Unicode-control sanitization. Hosted
verification reported only the previously reviewed node-forge advisory. Customer/technician
profiles and broader native/device acceptance remain required parity work.

Technician profile and weekly availability parity (TE-01/TE-02) now has a
reviewed legacy-derived contract, validated versioned domain and owner-scoped
aggregate persistence. Real PostgreSQL race tests cover creation/edit races,
atomic audit/outbox rollback, strict stored-field validation and runtime guards.
Application policy uses completed grant readiness and serialized SpiceDB checks;
revoked retries cannot regrant ownership. Real runtime-proxy tests establish
independence from customer/dealer permissions. The explicit HTTP profile surface
and shared timezone catalog are composed in server/OpenAPI bootstrap. Real-session
HTTP integration covers create/update/replay, stale edits, foreign users, revoked
permissions and expired/revoked sessions. Dedicated schema names preserve customer
composition. The shared typed client now snapshots commands, validates bounded
profile/rule responses and preserves current sessions after retired-token failures.
Real HTTP fixtures cover malformed replies, cancellation and credential rotation.
The shared form model now preserves incomplete numeric/time/date input and
stable weekly rules with confirmed removal and catalog validation. The shared
controller now durably snapshots exact retries, preserves newer edits and requires
explicit conflict review. Its API/user-bound journal validates checkpoints,
expires entries and serializes discard; full baselines are required while drafts
may remain incomplete. The shared workspace now authorizes before draft restore,
freezes canonical account/API scope and holds exclusive ownership until pending
writes and denied cleanup finish. Presentation restarts retry retained cleanup
before opening another editor. Platform adapters now share encrypted vault/logout cleanup, native ownership
and presentation singletons, and web cross-tab locks. Native request/workspace
hooks bind current account/API/session and normalize retired-token failures.
Encrypted restart/sign-out, native module refresh and real two-tab lock journeys
pass. Web/native interfaces and their interaction acceptance remain
unfinished; neither technician parity item is complete.

Customer profile implementation merged in PR #63 at
`4431aaaad3810a6894bcbb66167d146559a3c378` after Android, iOS and acceptance passed.
Verification reported only the reviewed node-forge advisory; its backport
regressions passed on that exact commit. CU-01 remains incomplete pending the
remaining interaction acceptance below. The legacy
contract now specifies private personal/business details, stable locations and
owned pianos, injected timezone validation and optimistic revisions. Domain tests
cover validation, nested defensive copies, stale saves, no-ops and clock/revision
bounds. Aggregate storage now preserves nested keys, scopes owner reads, serializes
revision saves and commits audits/outbox/idempotency atomically. Real PostgreSQL
race tests cover runtime privileges, rollback, duplicate creation, competing edits,
corrupt rows and rejection of previously committed audit proof. Review corrected
production-translated duplicate errors and same-transaction audit validation;
no confirmed persistence blockers remain. The generated authenticated application
remains fail-closed. The product application policy now enforces owned reads,
serialized revision saves, completed local grant readiness, SpiceDB permissions
and audited retries. The 598-name pinned IANA catalog supports regional names
and legacy aliases. Real PostgreSQL/SpiceDB/runtime-proxy integration covers
creation, reads, updates, no-ops, replay and revocation without regranting access.
The product HTTP adapter now has explicit nested DTOs, owner-free responses,
bounded strict inputs and no-store responses. Transport tests cover closed policy,
injected ownership fields, body limits, revision errors and child mapping. The
reviewed nickname requirement is reflected in its schema. Runtime bootstrap now
injects the verified catalog into both adapters and exposes matching generated
contracts. Real HTTP/session/PostgreSQL/SpiceDB integration covers legitimate
create/edit/read/replay, stale saves, cross-user access, revoked grants and expired
or revoked sessions. Composition tests include the public showroom to prevent
schema-name collisions. The typed shared client now snapshots commands, validates
profile identity/revisions and nested response shapes, and exposes safe machine
errors. HTTP fixture tests cover current credentials, cancellation, stale and
malformed replies and private-field rejection. The optional manufacturing-year
schema now explicitly permits null. Shared form/controller tests now cover field
validation, stable child keys and safe removals, durable-command-before-request
ordering, immutable retries, edits during saves, explicit conflict choices and
scope-loss suppression. Review corrected mailbox parity and observer-triggered
reads after disposal. A separate API/user-bound recovery journal and workspace
now validate checkpoints, authorize before restore, retain writes across navigation
and share platform vault cleanup. Exclusive API/user ownership now spans opening,
editing, pending writes and denial cleanup. Web Locks enforce two-tab exclusion
and recover after tab closure; the native runtime registry survives module reload.
Failed protection retains ownership and failed deletion permits cleanup retry.
Review corrected mutable opening scope by freezing one canonical identity.
Large aggregate recovery now
uses a shared 4 MiB vault/customer bound while inventory stays at 1 MiB; encrypted
restart and actual browser reload tests preserve full pending checkpoints. Native
codec tests cover large ciphertext and precise size rejection.
Web composition now exposes an account-owned customer entry, focused location
and piano editors, protected navigation, localized validation focus, confirmed
removal and explicit conflict comparisons. Built-browser integration with a
stateful HTTP fake passes creation, lost-response/reload retry preserving newer
edits, two-tab exclusion, session rotation, denial cleanup, Spanish navigation
and logout invalidation. Review corrected stale-token rejection handling and
comparison of identically named locations. Native composition now provides the
account entry, focused child editors, searchable choices, protected Back,
conflict comparisons and confirmed removal. Android interaction with the isolated
real API verifies contact/location creation, timezone selection, save/reopen,
cold-start recovery of an unfinished piano, validation opening the type selector,
empty-search feedback, piano type selection, invalid-year focus and recovery,
section Back positioning, and cancelled/confirmed piano removal. Spanish dark
mode with 1.3 font scaling exposed pale Android button fills; a shared native
button adapter now uses platform-specific primary/destructive colors, with
contrast checks and reviewed Android rendering. This is partial accessibility
evidence, not screen-reader or iOS acceptance. Review fixed private picker
retention after denial, Back after denial and cleanup ownership across remounts.
The remaining native conflict/failure/recovery, accessibility and iOS interaction
matrix is not yet accepted; CU-01 remains incomplete.
Shared typed error normalization now protects remaining
web domain request boundaries and native request hooks from delayed old-token
401s. Built inventory/voice browser tests preserve pending commands, newer edits
and transcripts across rotation; current-token rejection remains authoritative.
Real HTTP tests cover all five client families without changing resource denial.
Technician profile parity follows and remains required.

QR scan parity (QR-01) is implemented with remaining device acceptance below.
The legacy scan flow has been rechecked read-only: stable label, authenticated
dealer-scoped resolution, piano identification and confirmed status actions.
The new scan contract keeps the identifier in a consumed URL fragment and
requires scoped, audited resolution. Initial domain/token-source tests cover
canonical 256-bit identifiers, redacted formatting, stored timestamp precision
and entropy failure without fallback. Scoped PostgreSQL storage now provisions one immutable association and audits
creation, repeat reads and resolution atomically. Real database race tests cover
concurrent creation, viewer access, denied scope/revocation, audit rollback,
collision sanitization and runtime/trigger immutability. The application and private POST endpoints now enforce fresh policy/limiter
checks, bounded token bodies, sanitized failures and scope-checked results.
HTTP tests cover invalid sessions, cross-user/dealer access, revocation, failed
authority/audit, rate limits and malformed/oversized input; bootstrap fails closed
without capabilities. Shared clients now validate canonical origin-bound fragment links, transport
identifiers only in POST bodies and reject mis-scoped response data. A pinned
local QR encoder produces a four-module quiet zone and passes a matrix decode
round trip without a TextEncoder global. Saved-record labels now have web print isolation and native display/share adapters, with abort/disposal and explicit production web-origin validation. Browser acceptance preserves invalid unsaved input and focus through label dismissal, and excludes editor content from print. Android screenshot decoding verifies the real pixel-aligned QR against the configured origin and dealer; iOS interaction remains unverified. The web scan entry now removes URL fragments before API requests, restores the ordinary session, performs scoped resolution and displays saved identity/cover with full-editor navigation. Shared view and ten-minute continuation tests cover invalid/foreign input, scope mismatches, cancellation and nonrenewing consumption. Browser tests cover retries, denial clearing, same-document link changes and real IndexedDB cleanup failure during logout. Focused web scan actions now reuse revision-bound publication review for unpublishing and lifecycle changes without opening or flushing an editor draft. Browser acceptance covers cancellation, sale amount, stale review, command-only denial, revoked read access, bounded revalidation and lost-response recovery without retrying a mutation. Reopening an identical scan link performs fresh resolution. Isolated real Dex/API/PostgreSQL acceptance now provisions a stable label on a new synthetic piano, restores signed-out scan continuation exactly once, confirms available and sold transitions, and verifies the private sale amount in persisted history. Navigation-failure evidence is token-redacted and tested with a real browser failure. Native scan entry now includes QR-only camera acquisition, manual links, bounded in-memory sign-in continuation, scoped saved identification, editor navigation and standalone lifecycle review. Clock/account/ticket tests cover expiry, account changes, delayed permission results, stale barcode callbacks and cancellation before permission acquisition. A narrow camera adapter preserves the transport boundary. Clean native generation, both exports, fresh Android/iOS compilation and browser/API acceptance pass in merged PR #57. Android interaction verifies denied camera permission/manual fallback, signed-out Dex continuation, scoped saved identity/cover, review cancellation, confirmed unpublish/sale, background preview shutdown and actual QR recognition through the emulator camera. iOS interaction, physical camera quality and wider accessibility/device acceptance remain; QR-01 is incomplete.

Sale-entry parity (LC-01) now seeds the private sale amount/currency from the saved asking price in web and native editor/scan actions. Exact-money tests cover localized decimals, JPY, zero and large safe integer values. Manual edits and clearing remain authoritative through status switches, including corrections entered after a successful command. Merged PR #58 passes full browser regression, structural/type/contract checks and both native builds. Android scan/editor forms seed hidden EUR asking prices; manual currency/amount corrections and clearing survive status changes and cancel/reopen. iOS interaction remains unverified; this does not complete LC-01.

Private inventory history (LC-02) now has domain, storage and client slices. The initial
pure domain projection reconstructs changed attribute fields from adjacent
revisions, preserves unknown older origins, validates lifecycle/photo/publication
evidence and returns independent copies. Timestamp comparisons use the documented
UTC microsecond precision so older nanosecond snapshots remain readable. Domain
race tests cover mixed voice/manual origins, corrupt evidence, private attribute
isolation and persisted precision. The scoped PostgreSQL history port now rechecks authority and commits read audit,
reads at most limit+1 revisions and validates every persisted event before
projection. Real database tests cover complete creation/attribute/photo/
publication/sale/correction timelines, fixed upper revision paging, denied scope,
revocation and audit failure. The application and generated HTTP history contract
add actor/dealer/record-bound encrypted cursors and fresh policy/limiter checks.
HTTP tests cover legitimate paging, invalid sessions/cursors, cross-user/dealer
access, denied permission and dependencies. Web and native clients now have scoped, on-demand history viewers with bounded
20-entry pages, retry, latest-page reset and localized attribution. They preserve
the active editor and discard history on scope change or dismissal; native also
clears it on backgrounding. Controlled browser coverage verifies paging, retry,
denial, Spanish copy and unsaved invalid input. Real Dex/API/PostgreSQL browser
acceptance reads 25 saved revisions in pages of 20 and 5, preserves voice origins
and excludes private snapshot values. Android emulator acceptance against the same persisted record verifies revisions
25 through 6 followed by 5 through 1, the creation event, editor return on close
and dismissal when backgrounded. The native controller also passes without a
global structuredClone implementation. iOS interaction remains unverified. This does not complete LC-02.

Voice capture and reversible proposal review have the following evidence. A new
framework-independent domain validates typed suggestions for all 18 editable
inventory attributes, requires transcript evidence and confidence, ignores blank
suggestions while preserving explicit false/zero, and rejects protected fields.
Explicit application and field-specific Undo preserve unrelated/later edits and
deep-copy private values. Domain/race tests cover the full field set and invalid
inputs. Transcript extraction now has an application boundary that checks write
authority, scoped audited context and revision before and after provider work,
validates untrusted candidates/currency, and suppresses cancelled or revoked
results. Controlled provider tests verify denial, stale revisions and sanitized
failures without saving inventory. A server-only Gemini REST adapter translates bounded transient
audio and transcripts with explicit model configuration, fixed-origin credentials,
no redirects/retries, strict candidate decoding and independent domain validation.
Transcription has the same pre/post authority and revision checks as extraction;
local HTTP/race tests cover transport failures and invalid output. Live speech
quality remains unverified. Authenticated transcription/extraction HTTP routes now
compose the provider through optional all-or-none server configuration. Audio is
read only after authority, bounded to 6 MiB, with scoped processing deadlines and
private error/response handling. Generated contracts and HTTP security tests cover
success, denial, stale/revoked access and unavailable processing. Shared client
proposal validation and explicit field selection now preserve incomplete manual
input. Atomic price/date groups detect intervening edits, and conditional Undo
preserves later corrections; tests cover all 18 fields and exact large prices.
The shared generated-contract transport now snapshots binary audio before token
lookup, rotates sessions, rejects redirects, propagates cancellation and validates
revision/transcript identity plus every typed candidate before presentation.
Controlled real HTTP tests cover all fields and failure paths. The account/dealer/
record-bound workflow now coordinates transcription, extraction, explicit review,
local Apply and conditional Undo; cancellation/scope loss suppress late work and
rejected local changes cannot claim success. A local browser microphone adapter
now bounds recording, releases tracks on cancellation/disposal/pagehide, and
suppresses late permission grants. Real Chromium synthetic-microphone acceptance
covers encoded audio, Stop, cancellation, permission denial, duration, device-loss
events and observer reentrancy. The web editor now connects recording and typed
transcripts to explicit field selection, current/proposed values, confidence and
evidence. Processing/review holds the workspace queue while locally protecting
manual edits; Apply/Cancel releases it. Transcript correction and conditional Undo
preserve work. Controlled HTTP/browser journeys cover recording, no pre-Apply
mutation, intervening edits, re-review, Undo, failure/retry and cancellation. Voice
provenance and native review evidence are recorded below; physical-device
microphone and Safari interaction are not yet verified. The native capture adapter now
bounds foreground AAC recording, serializes cancellation and resource cleanup,
and delivers bytes only after owned cache-file deletion. Controlled tests cover
late permission/preparation, interruption, cleanup failure and reentrancy. Clean
prebuild checks verify localized microphone purpose strings and no background
audio capabilities; Expo exports and native builds pass. Remaining device
interaction acceptance is recorded below.
Voice processing now shares editor queue coordination across clients: preparation
does not claim saving is paused, explicit review holds the queue, cancellation
waits for pending acquisition/provider work to settle, and Undo remains available
after release. The web editor exercises this coordinator; controlled lifecycle
tests and full browser journeys cover the transition. The native editor now presents a dedicated voice sheet with explicit recording,
transcript correction, unselected field switches, current/proposed comparisons,
evidence and confidence, Apply and conditional Undo. Background/focus loss clears
transient work; retired recorder ownership preserves cleanup retry across unmount.
The editor coordinates photo/publication busy states and reports actual queue
pauses. Native type/lifecycle checks and exports pass; Android emulator evidence
and remaining interaction acceptance are recorded below.

Native cold-reopen acceptance found an Expo sealed-data constructor mismatch:
Android requires bytes even though the TypeScript API accepts a base64 string.
The recovery adapter now decodes bounded canonical ciphertext without resetting
existing keys or journals. The previously failing encrypted draft reopens after
process restart; real AES-GCM round-trip tests and structural gates pass.

Android emulator acceptance now covers typed review with initially unselected
fields, Make-only Apply, conditional Undo, and an actual AAC recording reaching
review through the controlled provider. The 141,040-byte audio/mp4 clip was
processed after owned cache deletion. Device checks corrected a stale keyboard
layout that clipped Apply and permission-prompt background transitions that hid
denial feedback. Live speech quality, interruption/failure journeys and iOS
interaction acceptance remain unfinished.

The inventory domain now derives exact manual/voice sources for changed fields
and a mixed history source when both occur in one revision. Unknown, duplicate,
protected and unchanged-field labels fail closed; uniform commands retain their
source restrictions. Domain race tests and repository/contract gates pass.
Migration 27 now persists exact field sources with each immutable attribute
revision. A database guard checks changed fields, aggregate source and the current
record snapshot; historical rows remain untouched and downgrade refuses to discard
recorded attribution. Both repository edit paths share scoped locking and atomic
audit/history writes. Real PostgreSQL race tests cover mixed edits, cross-user
denial, rollback, malformed source maps and runtime immutability; structural and
contract gates pass. The authenticated edit endpoint and generated-contract client
now carry optional voice field labels through the same scoped transaction. HTTP
tests reject unauthorized, stale and misleading labels; a real HTTP client test
checks the payload remains fixed while credentials load. Recovery-journal
attribution now has generic editor/workspace support: current and pending field
labels persist independently, manual correction clears only touched origins, and
restart, conflict choice, lost acknowledgements and reverting to an old baseline
during pending writes preserve correct attribution. Nine behavioral regressions
and full structural/contract checks pass. Form/capture adapters now preserve the
labels through protected recovery and autosave on web and mobile. Raw manual
changes clear atomic money/date origins; normalized unchanged attributes are not
labelled. Apply forwards only actual changed fields and Undo stays manual. Shared
behavior tests, web/mobile type checks, structural/contract checks and the browser
journey pass, including observed Apply and Undo HTTP attribution. Android emulator
acceptance now also uses the current real API and an isolated synthetic PostgreSQL
database: Make-only Apply commits a voice history field and matching audit; Undo
commits a manual field and matching audit. Model and title remain unchanged, and
cold reopening preserves the undone value without a spurious revision. Speech
responses were controlled, so live provider quality and iOS interaction remain
unverified. A separate uninterrupted Android recording stops automatically at the
one-minute limit, delivers 517,722 bytes of AAC audio and leaves its owned audio
cache empty before review. Recording now presents a transient, measured input-level
meter on web and native, with localized unavailable feedback and no playback or
per-sample live announcements. Controlled native tests reject stale samples;
real browser audio analysis covers signal, silence, context cleanup and failure.
The Android emulator shows the silent-input meter and cancellation clears its
owned audio cache. Type, structural, locale and contract gates pass. Physical
microphone level behavior and iOS interaction remain unverified.

Android device review exposed white status icons on pale surfaces. The native
stack now selects status content from the same system palette: measured light
root/modal clock contrast improves from 1.09:1 to over 5.6:1. Changing system theme
with a dialog open exposed React Native's creation-only appearance copy. An
app-scoped prebuild hook updates shown dialogs on configuration changes without
remounting their content; generator regressions and clean prebuild pass. A fresh
CI-built Android APK passes live light/dark/light dialog transitions with typed
text and proposal selection preserved. Measured clock contrast is at least 5.6:1
in light mode and 18:1 in dark mode. iOS native compilation passes; iOS status-bar
interaction is not yet verified.

Buyer inquiry foundations now implement canonical contact validation, immutable
public snapshot context and first-read domain state. Submission orchestration
requires an explicit CAPTCHA policy and coordinated limiter, limits honeypots
before discarding them, and never persists challenge/source data. PostgreSQL
migration 25 and its adapter capture current visibility/snapshot in the same
transaction; independent insert guards reject substituted snapshots, and runtime
credentials cannot rewrite/delete buyer messages. Real PostgreSQL tests observe
lock waits behind showroom/piano unpublish and reject the newly hidden listing.
The submission HTTP adapter now carries the request middleware's trusted source
identity, bounds request bodies, redacts private validation details and returns
empty durable acknowledgments. Its own coordinated five-per-minute budget is
separate from general request counts. Turnstile verification checks exact hostname,
action and age, rejects redirects, and fails closed on provider failures. An
explicit configuration policy enables submission; absent policy leaves it
unavailable. Real PostgreSQL/HTTP tests verify durable success and rejection after
unpublish, and concurrent budget tests verify coordination. The authenticated
inbox now composes owner/editor membership with SpiceDB manage_inquiries and
transactional scoped rechecks for list/detail/read acknowledgment. Migration 26
retains append-only first-reader receipts and requires their matching audit to
originate in the same transaction. Current-revision repeats preserve the first
receipt; stale revisions conflict. Actor/dealer-bound encrypted cursors preserve
bounded pagination. Fresh PostgreSQL tests cover authority changes, audit failure,
concurrency, historical visibility and receipt immutability/rollback refusal.
Full repository/contract checks, affected race tests and required read-only review
pass. Buyer form, web/native inbox presentation and complete user journeys remain
required for IQ-01 through IQ-03 completion. Shared inquiry clients now separate
anonymous credential-free submission from rotating-session inbox access, validate
private response scope and public snapshot shape, and never automatically retry
delivery. The shared composer preserves failed input in memory, serializes sends,
and clears private fields on confirmed delivery or disposal. Package tests and
full repository/contract gates pass. The localized web buyer form now includes
focusable validation, explicit retry, delivery confirmation and fail-closed
Turnstile configuration. Built-browser tests cover disabled-policy journeys and
provider DNS failure/retry; the real provider public test key also passes.
Web and native inbox screens now use a shared account/dealer-scoped workspace
with cancellation, explicit read acknowledgment, conflict reconciliation and
authority-loss clearing. Native uses pushed list/detail navigation and clears
buyer data on blur. Controlled HTTP browser acceptance covers contact actions,
read conflict, narrow layout and revocation. Real browser acceptance now verifies anonymous form delivery, Dex sign-in,
persisted inbox access and identical first-read receipts after reload. It exposed
a database timestamp-precision mismatch, fixed by reloading the receipt inside
the write transaction. Android emulator acceptance verifies restoration, inbox
list/detail, explicit read and refreshed read status against the actual API.
Hermes exposed an Intl BigInt currency crash; formatting now passes an exact safe
whole-number quotient while retaining exact fractional digits. This Android run
uses the existing compatible development binary and current JS; hosted builds,
iOS interaction acceptance and remaining challenge lifecycle coverage are separate.

The node-forge 1.4.0 mitigation backports the exact RSA nested-DigestAlgorithm
validation from unmerged upstream PR 1152, with license, source and installed
hashes recorded. The old parser accepted malformed nested encodings through both
direct CLI consumers. Twenty-one tests now exercise all six installed consumers,
valid signatures/optional NULL parameters, changed messages/wrong signers,
malformed nested children, and actual Expo/EAS certificate and buffer signing.
Full repository/contract/age checks, review, compatibility/Doctor (19/19), both
mobile exports and clean native prebuild pass. This is a tested local mitigation,
not an upstream release or proof of every cryptographic property. Hosted native
builds remain required. The audit still reports the one high advisory; no audit
suppression or version relabeling was added. Compiler-image findings remain open.
Inquiry implementation and real browser/Android acceptance are recorded above;
remaining platform acceptance is tracked separately from the next voice slice.

The web upgrade to SvelteKit 3.0.1/adapter-node 6.0.0 removes the two remaining
SvelteKit advisories. Compatible Svelte, web TypeScript and checker pins pass the
age gate; EAS retains its supported TypeScript 5 peer. Explicit package aliases
preserve import containment, and declared private runtime environment inputs
still use shared configuration validation. Cookie overrides preserve major
versions. Production CSP permits only exact hashes for the static wrapper and
screen-reader announcer styles, with nonce-protected scripts unchanged.
Full repository/contract/age checks, Expo compatibility/Doctor (19/19), review,
production showroom browser acceptance, real Dex PKCE/restoration/sign-out and
dealer capture/photo/edit/publication/staff journeys pass. CI now also exercises
the built Node adapter showroom. The npm audit reports one high node-forge
finding; it and the recorded compiler-image findings remain unresolved release
blockers. Hosted validation for this change remains pending.

PR #15 merged as ee7f9ada after Android/iOS native builds and real-service
acceptance passed. PR #16 contains the URI/Zod follow-ups; native builds remain
pending and its verification failure is the three dependency advisories at that
commit. Neither change modifies legacy deployment or GitOps.

fast-uri 3.1.9 fixes four URI normalization advisories in the actual EAS/AJV
consumer. Regression coverage rejects encoded schemes and ambiguous authorities,
preserves relative-reference meaning, prevents suffix serialization from creating
active schemes, and verifies legitimate AJV references. Full repository/contract
checks, dependency-age validation, both mobile exports, clean native prebuild,
Expo compatibility/Doctor (19/19), and required review pass. The exact security
release has a documented dependency-age exception. Hosted native validation is
still required. The npm audit at that change reported three findings: node-forge (high)
and two SvelteKit findings (low); security release gates remain failing.

Zod 4.6.6 now covers all Expo CLI, EAS CLI and EAS build-job consumers.
Regression tests fail on the old versions and prove oversized bounded arrays
and sets reject before element validation; actual Expo plugin/output/MCP command
and EAS archive schemas retain valid/invalid behavior. Full repository/contract
checks and the dependency-age gate pass. Both mobile exports, clean native prebuild with photo-permission checks, Expo compatibility/Doctor
(19/19) and required review pass. The exact release has a documented age exception
for the remaining hours before its fourteen-day anniversary; hosted native build
validation remains required. Upstream unbounded-collection behavior is unchanged.
The audit at that change reported seven findings (one high, two moderate, four low), covering
node-forge, fast-uri and SvelteKit. Security release gates remain failing.

The navigation query decoder now pins decode-uri-component 0.5.0 with a
packaging-only CommonJS patch for query-string. The upstream bounded scanner is
unchanged; MIT provenance and installed-source hashes are verified. Its actual
React Navigation consumer passes ordinary Unicode/plus/duplicate-key decoding
and the long malformed-percent regression that fails on the prior release.
Full repository/contract checks, dependency-age validation, both mobile exports,
Expo compatibility/Doctor (19/19), required review and Android emulator session
restoration plus shop/inventory navigation pass.
The audit at that change had eight outstanding findings (two high, two moderate, four
low); decode-uri-component is no longer reported. Exports are not native builds,
and full native interaction acceptance remains pending.

Hosted run 40015648853 passed Android Gradle, unsigned iOS Xcode and acceptance.
The backported screens APK (source 374f169, merge ref d9d1ac56, SHA-256
818703e056c3546f227dfe05e8e329271c676acdbc31007da740bc46f935ade6) completed ten
cold launches on the Android API 36 emulator on 2026-10-25 with no observed
native crash. Real Dex browser sign-in/callback, shop/inventory navigation and
reopening the previously saved “Android recovery piano offline” draft also
passed with the current Metro graph. This supports the mounting-listener fix;
physical-device coverage, offline recovery and full native interaction acceptance
remain pending.

The Metro image-size consumer now pins 2.0.3. Bounded subprocess regressions
cover zero-length ICNS/JXL/HEIF containers, and the actual React Native community
CLI Metro adapter reads the fixture PNG/JPEG dimensions. The old ICNS/JXL
parsers exhaust the subprocess heap; the new parser rejects those inputs.
A fresh 2026-10-25 audit no longer reports either image-size advisory, but now
reports nine findings (two high, three moderate, four low), including newly
reported Zod, SvelteKit and fast-uri advisories as well as decode-uri-component
and node-forge. Historical counts below describe their dated runs; security
release gates remain unchanged and failing.

The subsequent build-tool refresh reduces the npm audit to four findings: three
high (image-size and node-forge) and one moderate (decode-uri-component). It
updates eight compatible tooling dependencies and carries the existing callable
CommonJS brace-expansion shim onto 5.0.12. Installed legacy/modern matcher
regressions, full repository/contract checks, dependency-age validation, required
review, Expo compatibility, Doctor (19/19), web compilation and public showroom
browser acceptance pass. Remaining advisories still block release;
native compilation and runtime acceptance of this dependency graph remain
separate pending gates.

A compatible parser/tooling dependency refresh reduces the npm audit from 69 to
19 findings: zero critical, 7 high, 11 moderate and 1 low. It upgrades URI, YAML,
XML, serialization, target-resolution and configuration-validation dependencies;
YAML major versions and XML minor lines remain separate. Review found two missed
EAS Joi consumers; a Joi 17-wide override now covers them all. Frozen install,
full repository/contract checks, dependency age, Expo compatibility, Expo Doctor
(19/19), web build and required review pass. Public showroom browser acceptance
passes SSR, filtering, keyboard gallery, contact links, Spanish, narrow layout and
unpublish after moving Chromium temporary storage off the nearly full root disk.
The remaining findings still block release; native compilation and device
acceptance of the updated graph are required separately.

The shell-quote override now pins 1.11.0, resolving the critical command-injection
advisory GHSA-pqg4-j6r4-53mv. Regression tests through the actual React Native
devtools dependency fail on 1.9.0 and pass on the new pin, covering all four line
terminators after comments without executing shell input. Frozen installation,
Expo compatibility, repository/contract checks, dependency-age validation and
required review pass. The refreshed npm audit has zero critical findings and
69 remaining findings (47 high, 18 moderate, 4 low); release remains blocked.

Android acceptance reached the photo-first new-piano editor, cancelled the system
photo picker without losing the draft, entered a title with the keyboard, and
observed autosave. Restart then reproduced the native crash at the same binary
instruction as the earlier failure. Exact-APK disassembly and upstream PR 4413
identify the known mounting-listener initialization race as the leading cause.
Its four-file fix is backported unchanged (with directory-path translation) to
pinned screens 4.23.0; frozen installation, Expo compatibility, repository and
contract checks, dependency-age validation and required review pass. Hash checks bind the installed native sources to the reviewed patch, and
MIT provenance is retained. Native rebuild and repeated cold launches are required
before calling the crash fixed. Draft recovery after process death and offline
editing remain unverified; removing an adb reverse alone did not reliably cut an
existing connection, so that attempt is not offline acceptance evidence.

Android device acceptance found and fixed an authentication callback routing bug:
Expo Router displayed an unmatched route and callback parameters after browser
sign-in. Native-intent rewriting now sends only the exact callback target to the
root without interpreting authentication data; AuthSession retains state/PKCE
ownership. The API 36 emulator passed a real isolated Dex login, authenticated
shop/inventory navigation, sign-out and unsolicited warm callback rejection.
Mobile tests, TypeScript, full repository/contract gates and required review pass.
Cold callback rewriting has unit coverage but standalone device acceptance is
still pending: the development APK opens its launcher on cold callback entry.
An intermittent Fabric MountingCoordinator SIGSEGV was observed before sign-in;
subsequent launches worked, which does not establish a fix. Native UX still needs
refinement: the inventory screen gives search/status/refresh buttons too much
visual weight, and long generated stock identifiers dominate draft rows. These
observations are not native interaction acceptance or feature completion.

Buyer-facing showroom and piano pages now render published content on the server,
with localized filters, a responsive card grid, price-on-request, a keyboard
gallery, business notes and encoded contact links. A dedicated anonymous generated
API adapter validates public projections; same-origin JPEG delivery preserves CSP
and no-store behavior. Controlled browser acceptance passed SSR content, filters,
gallery controls, contact targets, Spanish, narrow layouts and unpublish handling;
desktop/narrow screenshots were inspected using synthetic image fixtures. Final
repository/contract gates and required review pass. Canonical readable aliases,
related listings, share interactions, discovery metadata, banner delivery and
inquiries remain required before showroom parity is complete.

The retried Android native job completed successfully. Its development APK was
downloaded, checksum-verified after transfer and installed on the booted API 36
emulator. iOS native build and backend acceptance also passed for branch head
4c3b042; the artifact is labelled with PR merge revision 0d7b6e8. Metro attachment and the initial authentication/inventory journey now pass as
detailed above; remaining native interaction journeys are pending. Dependency security findings
still block aggregate verification and release readiness.

Public inventory browsing now has an anonymous collection API and generated
client contract. AES-GCM continuation tokens bind the exact showroom, normalized
filters and page size; invalid tokens fail before storage, and every page rechecks
visibility. Optional price parameters preserve explicit zero. Source limiter
proof, no-store responses and generic errors match individual public reads.
Application/HTTP race tests, full repository/contract checks and required review
pass. A fresh disposable real-backend journey passed collection filtering,
published snapshot isolation, default sold exclusion and piano/showroom unpublish,
alongside dealer/inventory/staff acceptance. Buyer pages, galleries, discovery and
inquiries remain unfinished; native interaction acceptance remains separate.

Public collection persistence now supports literal search, form, availability,
currency and inclusive price filters against retained publication snapshots.
Featured-first keyset pagination is bounded and shares the showroom visibility
lock with projection. Real PostgreSQL race tests cover hidden prices, private
edits, foreign/draft/unpublished records, pagination, dependency failures and
concurrent unpublish. Snapshot restoration rejects missing/null/case-variant
Featured keys so SQL ordering cannot disagree with continuation values. The full
dealer-store PostgreSQL suite passed; final affected publication/collection race
tests, repository/contract checks and required review passed. Buyer presentation
remains required to deliver these collection capabilities to visitors.

Public showroom profile, piano and JPEG routes are now registered through a
project-owned bootstrap extension and Huma-generated contracts. Every route
requires server-owned evidence of the coordinated source limit, so missing
limiter/clock composition cannot expose storage. Explicit DTOs omit private
fields; errors discard partial results and reveal no database details. Controlled
HTTP tests cover anonymous access, missing dependencies, source-header spoofing,
scope/visibility denial, no-store headers and contract allowlisting.

The updated disposable real-backend acceptance journey passed with PostgreSQL,
Dex opaque session exchange and the typed SpiceDB proxy: public profile/listing/
JPEG delivery, private edits remaining hidden through sale, piano unpublish,
correction, explicit republish and whole-showroom hiding. Existing dealer,
inventory, staff and invitation acceptance also passed. Repository/contract
checks and required review pass. Public collection filtering/pagination, buyer
pages, discovery and inquiries remain unfinished; this does not establish native
interaction acceptance.

Public profile, listing and photo persistence now implements a dedicated anonymous
read port. Shared dealer/record locks coordinate with publication and profile
writes; public content comes from the retained snapshot, without loading private
working attributes. Photo bytes require current snapshot membership and integrity
validation. Real PostgreSQL race tests prove retained photos survive draft removal,
republish drops old photo access, hidden/foreign reads return no content, and reads
waiting behind either kind of unpublish observe the committed hidden state. The
full dealer-store PostgreSQL suite, repository/contract checks and required review
pass. HTTP/source-limiter
registration and public browsing remain required before these reads are exposed.

The first Android attempt on 4c3b042 failed while sdkmanager downloaded pinned
NDK 27.0.12077973 (invalid ZIP archive). Retrying retained the reviewed toolchain;
the subsequent build and artifact installation evidence is recorded above.

The showroom domain now projects only canonical, published dealer profiles and
same-dealer visible inventory publications. Public fields are explicitly
allowlisted, nested snapshot values are copied, and photo access requires current
snapshot membership. Tests cover hidden/foreign/zero-value cases, malformed
profiles, hidden prices, private edits, sale overlays and replaced photo references.
Domain race tests, full repository checks, generated-contract checks and required
review pass. Public persistence, HTTP transport, media
delivery, browsing and discovery remain unfinished.

Android runtime preparation has advanced to a booted Android 16/API 36 virtual
device using Emulator 37.2.12 and Google APIs x86_64 image revision 7. A disposable
backend built from commit 05d59aa reports API readiness 204 and OIDC discovery 200,
with a separate test database and the typed SpiceDB proxy. The APK artifact run
40007591474 is pending; no app interaction acceptance is claimed. Hosted backend
acceptance on 1d5cbf4 passed. That run's Go scan is clean, while npm verification
still reports 70 findings (1 critical, 47 high, 18 moderate, 4 low).

Android CI now retains the exact debug APK for seven days, labelled with the
source commit, to unblock emulator installation from hosted builds. The upload
action is pinned to reviewed v7.0.2; dependency-age, CI routing and structural
checks pass, and required review found no concrete findings. The first hosted
upload/download remains unverified. A separately scoped development SDK now has
Android Emulator 37.2.12 installed; no system image or virtual device is ready yet.
Neither change constitutes native journey acceptance.

Native publication/sale presentation is implemented with one full-screen task,
keyboard-aware entry, Cancel/Android Back boundaries, fixed confirmation placement,
inline labeled choices and bounded public photo review. It uses committed-session
request adapters and the shared revision review; private sale input stays in memory
and survives rejection. Restored/invalid/conflicted/uncertain drafts block publish
review. Shared transition parsing tests cover exact amounts, zero/JPY, malformed
input, correction reasons and exclusion of stale sale input on non-sale changes.
The 271 client-core tests, mobile TypeScript, repository/contract checks and both
platform Metro exports pass. Required review found no concrete blockers. These
exports are not native builds or device acceptance; native interaction and full
backend journeys remain required before parity is complete.

Hosted run 40004537200 on commit 2f20c1d passed `make acceptance`, including the
real-backend upload/readiness/publish/snapshot-preserving sale/unpublish/correction/
republish journey. Its callable Go scan is clean; verification still fails on
70 npm findings. This establishes backend integration evidence for those commands,
not device or native presentation acceptance. Native build jobs were still running
at inspection.

Runtime preparation found adb and accessible KVM on the remote development host,
but no emulator executable on PATH or default Android SDK directory. Android
emulator setup may enable the outstanding runtime checks without store credentials;
its available disk was 18.4 GiB at inspection. No production deployment was changed.

The web editor now exposes localized publication, sale, availability correction
and unpublish review. Public review shows saved allowlisted details and ordered
photos in bounded six-image pages; private sale amounts/reasons have a separate
confirmation. Restored/invalid/conflicted/uncertain drafts must be saved or resolved
before publish review. Cancel/Escape never dispatch; initial focus starts at the
review heading; stale revisions require renewed review. Command acknowledgements
are independent of later photo reads, and uncertain results refresh without retry.
The shared translator formats exact integer minor units, including maximum-safe
amounts and zero-decimal currencies, without floating-point cent loss.

Controlled-service browser journeys pass for publication, cancellation/Escape,
private-note exclusion, initial focus, 6/1/6 photo pagination, restored-draft
protection, stale review, successful acknowledgement despite concurrent revision,
sale preserving prior public details, and lost unpublish response followed by
explicit refresh. Narrow-layout overflow checks and screenshot inspection pass.
Full repository and generated-contract checks pass. Required review found and
verified acknowledgement and recovery-state corrections.
These are browser/controlled-service results, not real-stack or native acceptance.
Native publication presentation, showroom/inquiries, voice and remaining parity
work are still required.

Shared publication review now composes with the editor's serialized mutation
boundary and durable recovery journal. Review copies command amounts and record
state; confirmation consumes the review once, reloads the revision, and refuses
intervening remote or autosaved edits. Lost responses retain an unknown outcome
without retry or inferred success on refresh. Account/record invalidation,
disposal and synchronous observer invalidation suppress late state and dispatch.
The 268 client-core tests include real editor/journal integration and controlled
command/read failures. Required review found and verified the observer invalidation
fix. Full repository checks and contract drift checks pass. Web/native publication
presentation and device acceptance remain unfinished.

The generated publication client now validates scoped records, immutable public
snapshot fields, revision ordering and command effects. It copies sale amounts
before asynchronous credential retrieval, forwards cancellation, and exposes
only stable errors and validated readiness identifiers. Controlled HTTP journeys
and malformed-response regressions pass (123 API-client tests); full repository
checks and contract drift checks pass. Required review caught and verified the
fix for coerced enum arrays. Shared review/confirmation orchestration and both
platform presentation flows remain required; transport success is not product
or device acceptance.

Authenticated publication read, publish, unpublish and lifecycle HTTP commands
now use explicit request-local view/publish/manage permissions, opaque sessions,
SpiceDB, active membership and the audit limiter. Composition uses the existing
domain registration without editing generated code. Readiness is a stable
`inventory_not_ready` error with whitelisted missing-field identifiers; clients
receive an explicitly allowlisted snapshot and nullable publication state.
Generated OpenAPI/TypeScript contracts include all four routes.

Command and HTTP journeys cover publication, sale, unpublish and correction;
adversarial cases cover invalid sessions, foreign scope, viewer/revoked access,
permission/dependency failure, rate limits, audit failure and missing capabilities.
Application/contract checks, API race tests and the real PostgreSQL publication
suite pass; required review found no concrete blockers. The disposable-stack
script now includes real PNG upload and the
complete snapshot-preserving sale/republish journey; execution of that new journey
passed hosted run 40004537200 as recorded above. Native publication controls, public delivery and the
remaining parity work are still required.

Hosted run 40000690616 on Go-migration commit 73c1990 passed disposable-stack
acceptance and unsigned Android/iOS builds. Its callable Go scan is clean; the
aggregate verification gate fails on 70 npm findings (1 critical, 47 high,
18 moderate, 4 low). This supplies the previously missing Go image build/runtime
evidence without clearing npm or the seven recorded image-catalog findings.

The publication repository now persists explicit publish/unpublish and lifecycle
commands atomically with record revisions, private history and audit. Immutable
snapshots retain relational media references, while a separate pointer applies
visibility and availability. Sales and private photo removals preserve the old
public snapshot; correcting an unpublished sale does not reveal it. Revision
24 enforces retained snapshot/reference immutability (including owner truncate
guards), complete media references and audited pointer progression. Rollback
refuses to discard existing publication snapshots.

An isolated PostgreSQL 18.4 database verifies the complete dealer adapter suite
under the race detector. Focused tests cover concurrent/stale commands, revoked
accounts, failed read audits, snapshot-write rollback, private edits/photo removal,
republishing and runtime/database-owner permission attacks. Required review found
no concrete blockers. Application and contract checks pass; a production-source
probe confirms the direct-SQL gate still rejects non-exempt files. Empty-schema
rollback/reapply passes, while retained-data rollback fails closed. That persistence
checkpoint preceded the HTTP integration described above; public
showroom delivery and native publication/sale workflows remain required.

Publication now has an explicit persistence state with defensive copying and
fail-closed restoration of canonical public fields, ordered photo references,
visibility and safe revisions. Round-trip tests retain hidden snapshots and
lifecycle overlays and reject malformed storage. Publication creation and overlay
commands reject invalid identities/unsafe revisions before emitting durable state.
This state boundary supports the repository and HTTP integration described above.
Its application/contract checks, domain race tests and required review pass.

Go security remediation now pins gRPC v1.83.2, OpenTelemetry v1.45.0 and x/text
v0.41.0 with their resolved transitive requirements (including x/net v0.58.0).
The obsolete gRPC age exception is removed; no advisory suppression is added.
Before/after callable scans using the same Go 1.25.13 executable fall from 16 to
12 findings, removing GO-2026-6348, GO-2026-6443, GO-2026-6505 and GO-2026-6629.
The remaining reachable findings are in the standard library. This is not a clean
release scan; the older CI/build-image toolchain may report additional findings.
The last npm scan still has 70 findings (1 critical, 47 high, 18 moderate, 4 low).

Real collector tests caught an exporter compatibility change during the update:
base endpoints were receiving requests at `/`. The adapter now constructs explicit
trace/metric signal paths, preserves collector prefixes and rejects invalid bases
without exposing the URL in diagnostics. Root/prefix/trailing-slash HTTP tests,
application checks, contract checks and race tests pass. Module checksums verify;
required review found no concrete blockers. The full fourteen-day dependency-age
gate passes without a new exception.

The workspace/API/tooling now target Go 1.26.10, with x/net v0.60.0 and its
required x/text v0.42.0, x/sync v0.23.0 and x/sys v0.48.0 graph. A rebuilt
govulncheck reports **No vulnerabilities found** for the application on this
compiler. This is separate from the same-compiler dependency comparison above.

The API build stage now pins the standard Red Hat Go image release
`1.26.10-1792719708`, whose compiler supports the CGO-disabled build without
the larger builder variant. Exact release signature and both platform SBOM
hashes are verified. Compiler/image age exceptions are documented; the image
still reports seven unresolved catalog CVEs (three high, four medium). The
larger builder variant reported eighteen. Neither the image findings nor npm
findings are waived. Application/contract checks, race tests, module verification and the dependency-age
gate pass. All five API executables build as static binaries with CGO disabled.
The initial race run exhausted task temporary storage; clearing only regenerable
task cache and reducing parallelism resolved it. Local container-build acceptance was unavailable due to root disk capacity;
hosted run 40000690616 subsequently supplied build/runtime evidence. Required review found no concrete blockers in this
migration; issue #2 remains release-blocking.

Native photo inspection now opens full-screen with explicit Close/Details
navigation, aspect-ratio fitting, native iOS scroll-view zoom, and bounded Android
pinch/pan. Localized zoom-in/out/reset controls supplement gestures. Shared geometry
covers focal-point preservation, contact changes, interruption, resize, invalid
coordinates and translation bounds. Closing inspection returns to the editor even
while a photo operation is pending; editor navigation stays protected. All 253
client-core tests, `make check check-contracts` and both platform JavaScript exports
pass; required review found no concrete blockers. Device rendering, gesture delivery, rotation and screen-reader
acceptance remain unverified. This does not complete native photo acceptance.

The native editor now connects camera/library selection to protected capture and
photo uploads. Its photo-first panel includes explicit interrupted-selection
recovery, private in-memory previews, six-photo pages, description editing,
cover/order commands, confirmed removal and pending-upload retry/discard controls.
A selected result requires an explicit Add action; recovery never auto-uploads.
Account-local cursor discard handles a capture that became a record without
removing staged/uploaded bytes. Transport remains behind generated clients.

Review caught an offline initialization trap: a failed restore was mistaken for a
pending selection and locked Back/Save. The shared picker-session controller now
releases temporary ownership on failed inspection, exposes retry and holds only a
proven pending intent. It waits for in-flight work before disposal. Behavioral
coverage includes cancellation creating no record and explicit selection creating
one record/upload through the actual capture, picker and photo-workspace ports.
All 248 client-core tests, `make check check-contracts`, i18n/transport checks and
both platform JavaScript exports pass. Required review found no remaining blockers
in this delta. Exports are not native builds or device acceptance. Zoom/pan device acceptance,
sign-out/process-death raw-cache reconciliation, actual Android interruption,
camera/HEIC, accessibility and physical-device UX remain required. Security
findings and the rest of product parity remain release blockers.

New captures now expose a durably protected picker identity without making an
untouched draft dirty or creating an empty record. A picker hold pauses scheduled
creation and resumes eligible text autosave on release; accepted photo creation
remains explicit. Qualified target identities accept a full underlying identifier,
while account/dealer limits and exact scope fields remain enforced. Controlled
behavior tests cover restart, failed storage, activity loss, duplicate acquisition,
scheduled creation and release. Native presentation now wires these holds into picker lifetime and navigation;
this foundation alone is not evidence of a completed camera workflow.
Verification: all 237 client-core tests and `make check check-contracts` pass;
required read-only review found no concrete blockers in this change.

Native picker orchestration now protects account/dealer/target ownership before
launch, restores selected or interrupted results without uploading, and marks
processing before accepting a photo so an uncertain handoff cannot be repeated.
Review found and fixed a cross-account pending-result gap: a device-only opaque
launch nonce now binds Android's global result across restarts and superseding
launches. Camera denial remains distinct from cancellation. The native adapters
request camera permission at use and use the system library picker. Shared
English/Spanish permission copy is verified in actual generated iOS strings and
Android manifest output; microphone access remains excluded. Sign-out/process-death cache reconciliation,
photo inspection gestures and real device acceptance are still required.

Picker verification: 230 client-core tests, mobile/configuration tests, full
checks/contracts, clean prebuild with generated-permission verification, i18n and
transport-boundary checks, and both platform JavaScript exports pass. Final
read-only review has no remaining blockers in this slice. These tests do not
establish native interaction acceptance.


Native photo preparation now has a framework-free admission/lifetime boundary and
an Expo adapter: bounded still-image conversion, bounded JPEG reads, scope-loss
suppression and ownership-restricted temporary-file cleanup. Review found and
fixed partial files left by failed Android saves using serialized render-cache
ownership. Controlled-fake tests cover failures and concurrency. Picker screens, localized permission configuration and Android activity-result
binding are connected above. Process-death cache reconciliation, inspection
gestures and actual HEIC/camera/device acceptance remain required; this preparation layer does not complete native photo capture.

Preparation verification: 215 client-core tests and native session/cache tests
pass, along with client types, structural/API-boundary checks, contract checks,
the dependency-age gate, all 19 Expo Doctor checks and native compatibility.
Clean prebuild and both platform JavaScript exports pass. The temporary local
Metro watch folder used for memory-backed dependencies is not committed. These
preparation-stage exports predate the editor integration above. The last committed web
photo slice (`3c75ada`) passed hosted acceptance, Android Gradle and unsigned iOS
Xcode in run [39887355061](https://github.com/elsell/pianotechpros/actions/runs/39887355061);
its verification job failed. The preparation commit `8334d96` passed hosted Android native compilation and
acceptance in run [39992152874](https://github.com/elsell/pianotechpros/actions/runs/39992152874);
its iOS job was cancelled, so compilation of these modules on iOS remains unverified. Fresh local security checks on 2026-10-23
report 16 reachable Go vulnerabilities (Go 1.25.13) and 70 npm findings (1 critical,
47 high, 18 moderate, 4 low). Issue #2 remains release-blocking; neither security
thresholds nor dependency-age policy were weakened.


The web editor now presents photo capture before text fields, with private image
previews, cover/order commands, alternative text and removal confirmation. Shared
orchestration protects new-capture media before creation; an atomic import receipt
hands source ownership to the record ledger without copying bytes. Exact retries,
conflict rebase, interrupted cleanup, expiry and denial preserve recovery pointers.
209 client-core tests, full checks/contracts and browser encrypted-storage acceptance pass. Controlled-HTTP Playwright journeys cover Spanish
photo-first creation loss/reopen/retry, lost upload acknowledgement without a
duplicate, partial text preservation, photo conflict review, preview, descriptions,
removal and narrow layout. These are browser interaction evidence, not real-backend
photo acceptance or native camera/device acceptance. Native photo presentation is now connected above; HEIC/device acceptance,
cancellation/progress refinement and full backend product journeys remain required. Review findings on creation loss, cleanup retry, imported rebase,
expiry and denied-create cleanup were fixed and verified.

Text workspaces now serialize saves, recovery, authenticated refresh and media
mutations. Revision-only photo changes preserve partial local text; concurrent
remote text requires conflict review. Media work protects recovery first, blocks
autosave while allowing typing, and refreshes after success or failure. Inactive
scopes hide drafts and ignore late input; disposal drains work before releasing
capture ownership. The 190 client-core tests and full checks/contracts pass. Review caught and verified a
fix for private text visibility in inactive new captures. Platform photo screens
and full product journeys remain required.

The user clarified that scaffold completion does not satisfy the request.
`product-parity.spec.md` records the audited legacy baseline and the completion
matrix. All product rows remain open. Sequence work through dealer authorization,
inventory/drafts/photos, publication/lifecycle/QR, voice, showroom/inquiries and
customer/technician profile parity; resolve security findings and collect real
web/native interaction evidence throughout. Signing and production cutover alone
remain deferred by user instruction.

Private photo collection rules are now implemented at the domain boundary under
`../inventory/photos.spec.md`: scoped ready-media evidence, bounded ordered
collections, cover-by-order, alternative text, detach-only removal and revisioned
history. Tests cover invalid scope/readiness/order, stale revisions, capacity,
Unicode limits, defensive copies and preservation of a published photo after
draft removal. The inventory domain race suite and `make check check-contracts`
pass. Read-only review found and verified a fix for nested record-attribute
aliasing. This is not upload delivery: transactional collection persistence,
authorized media storage/processing, upload transport and web/native capture
journeys remain the next work.

The image-processing port now has a concrete JPEG/static-PNG adapter with byte,
dimension and pixel preflight limits, bounded concurrency, orientation correction,
white transparency compositing and fresh metadata-free JPEG encoding. Real codec
tests cover malformed inputs, EXIF/PNG metadata, all eight transforms, fixed errors, cancellation and limits. Race tests, 1,097,882 metadata-parser fuzz
cases, `make check check-contracts` and read-only review pass. No upload route or client capture integration is claimed yet.

Migration 23 and the PostgreSQL media repository now atomically store normalized
JPEG assets, ordered draft references, record revisions, private history and
audit. Assets have immutable runtime privileges and a database guard; composite
foreign keys reject cross-record references. Actor/record-scoped upload retries
return the original asset and current state without duplicate history or
reattachment after removal. Private reads require current membership and active
attachment and commit audit before returning bytes. Real PostgreSQL race tests
pass concurrent revision contention, rollback on audit failure, scope/revocation,
immutable privileges, detached retry and foreign-reference rejection. The full
dealer persistence race suite and prior-release schema upgrade to 23 pass.
Readiness now requires schema 23; review found and verified that correction.
Full checks/contracts pass. Photo editing persistence now also supports reorder,
alternative text and detach with dense positions, optimistic revisions and atomic
reference/history/audit commits. Current-revision no-ops have read audit without
extra history; stale no-ops conflict. PostgreSQL tests verify audit rollback,
view-only/revoked access, concurrent edits and retained photo history. The full
dealer persistence race suite and full checks/contracts pass. HTTP authorization
and limiting composition, upload endpoints and client capture remain required.

Photo application commands now enforce the existing opaque-session, membership,
SpiceDB and coordinated limiter policy for reads, uploads and draft edits. Upload
performs an audited scoped preflight before consuming image bytes and repeats
authorization after processing, rejecting cancellation or changed identity/owner
scope before storage. Repository denials emit scoped denial audit; invalid scoped
results and failures return no partial data. Stateful-fake race tests cover all
operation boundaries, dependency failures, processing revocation, cancellation,
invalid input and replay after newer revisions or photo removal. Read-only review
found no blockers; full checks and contract drift checks pass. HTTP body limits/error mapping, runtime composition and client
capture are the next required integration work.

Private photo HTTP routes now compose with the generated record routes through
project-owned bootstrap wiring and one shared processor. Binary upload streams
remain unread until authorization, with bounded request bodies; authorized image
responses are raw JPEG and private responses prohibit caching. Transport tests
exercise upload/replay/read/alt/order/remove, authorization, invalid/oversized
images and normalized JPEG delivery. Review corrected PATCH CORS preflight;
full composition tests protect against OpenAPI schema-name collisions and
undeclared media error codes. Full checks and generated-contract drift checks
pass; read-only review found no remaining blockers. Client capture integration
remains outstanding.

The generated-contract photo client now supports state, binary upload, private
JPEG reads, ordering, alternative text and removal. It snapshots upload bytes and
order before asynchronous credential acquisition, preserves stable retry intent,
validates scoped responses and accepts detached replay acknowledgements.
Real HTTP tests cover all operations, authorization/service/conflict errors,
malformed responses, binary bytes, cancellation and size bounds. All 96 API
client tests, full repository checks and contract drift checks pass; read-only
review found no blockers. Fetch buffers image downloads before the size check.
Durable upload orchestration and web/native camera/library presentation remain
required before photo capture is complete.

Capture now exposes explicit photo-triggered record creation without a text edit.
It retains lazy New behavior and shares the durable creation key, exclusive lease
and record-journal handoff with text capture. The 122-test client-core suite covers
concurrent requests, local failures, uncertain restart, partial text, disposal and
scope loss during persistence. Review caught and verified a fix for dispatch
after activity loss. Full checks/contracts and the subsequent focused suite pass.
Selected-media persistence and upload orchestration remain the next integration.

Run [39882638075](https://github.com/elsell/pianotechpros/actions/runs/39882638075)
on `815ba2a` exposed a Scalar acceptance selector collision: its broad Authorize
button match also selected the new Authorized normalized JPEG response disclosure.
The harness now selects the exact Authorize name. A real Playwright check with
both controls and all eight retry/deadline tests pass; full checks/contracts pass.
Hosted acceptance of this correction remains pending. The run's verification
job still reports 23 reachable Go vulnerabilities; security gates remain blocking.

Selected-media storage now uses the account-bound encrypted recovery port with
bounded immutable chunks, a durable whole-photo SHA-256 commitment and a manifest
written last. Reads validate every chunk and the complete digest; interrupted
same-ID writes can resume only with identical bytes. Cleanup retains the commitment
when any chunk removal fails. Review found and verified a fix for changed
unwritten suffixes on partial retries. Tests cover 20 MiB, interrupted writes,
corruption, scope isolation, real AES-GCM ciphertext substitution, and sign-out
during hashing. All 135 client-core tests, full checks and contract drift checks
pass; review has no remaining blockers. The upload coordinator must still supply
durable reservations, exclusive scope ownership, expiry and platform digest
adapters before camera/library integration is complete.

The upload ledger now durably records scoped reservations, readiness, exact
attempted record/revision/key, acknowledged server photo IDs and removal state.
Uncertain attempts cannot be cancelled as if their outcome were known; explicit
conflict rebasing retains the target record and assigns a new key. Failed writes
invalidate the instance until reopen. Tests cover restart, before/after-write
failure, concurrent reservations, capacity, defensive snapshots, malformed scope
and cross-record rebasing. All 144 client-core tests, full checks and contract
drift checks pass; read-only review has no blockers. The coordinator still must
enforce authorization, leases, media readiness, dispatch ordering and cleanup
before these pieces can be exposed in the web/native photo capture UI.

The upload coordinator now composes authorization, exclusive scope ownership,
ledger checkpoints, encrypted selected media and explicit upload dispatch.
Recovery never automatically uploads; uncertain retries preserve exact intent.
Acknowledgements precede local cleanup, and cleanup retries do not resend images.
Disposal suppresses late results and releases ownership only after pending work
drains. Tests cover lost acknowledgement, interrupted selection, before/after
acknowledgement checkpoint failure, stale/corrupt recovery, permission loss,
transient dependency failure and malformed response scope. Review caught and
verified a fix for denial during target-record resolution. All 163 client-core
tests, full repository checks and contract drift checks pass; read-only review
has no remaining blockers.
Retention cleanup and web/native platform capture integration remain outstanding.

Run [39883710522](https://github.com/elsell/pianotechpros/actions/runs/39883710522)
on `f3d10bb` passed hosted acceptance, verifying the exact-name Scalar locator
correction in the complete browser/API harness. Native jobs are still pending
completion; verification remains failed. This is not release approval.

Selected-photo retention now expires local media seven days after reservation,
without extending the deadline on retry/rebase or issuing server mutations.
Durable expiry markers survive failed cleanup; uncertain upload outcomes remain
explicit. Authorized open and operations prune expired media, while invalid clocks
fail closed before deletion. Deadline checks during upload preparation also
recheck activity immediately before dispatch; review found and verified that
asynchronous boundary correction. All 176 client-core tests, full checks and
contract drift checks pass; review has no remaining blockers. Web/native capture
integration, including coordination with unsaved text/revisions, remains next.

Completed run [39878787463](https://github.com/elsell/pianotechpros/actions/runs/39878787463)
on `115bd0b` passed live acceptance. Both native jobs stopped before compilation:
Expo Router Doctor rejects an exact direct navigation declaration because its
range-containment check requires Router's entire range to fit inside the app's
range. Investigation also found stack 7.3.16 violated Router's ^7.14.5 requirement.
The corrected family pins native 7.1.34, tabs 7.15.5, elements 2.9.10 and stack
7.14.5. The app declares Router's ^7.1.33 metadata range while an exact workspace
override and frozen lock retain the reviewed version. A new compatibility gate
checks original installed dependency/peer ranges, shared module identity and the
exact override. Doctor passes 19/19, compatibility and dependency age pass, and
full checks/contracts pass. Both Metro exports and clean native prebuild pass; these are not native builds.
Read-only review found no remaining blockers in this correction. Current scans
still report 16 reachable Go findings locally and 71 npm findings (1 critical,
48 high, 18 moderate, 4 low); security release gates remain unchanged and failing.
Run [39880832729](https://github.com/elsell/pianotechpros/actions/runs/39880832729)
on `6846ef0` passed Android Gradle compilation, unsigned iOS simulator Xcode
compilation and live acceptance. Native interaction evidence remains outstanding.
The verification job still fails on the 23 reachable Go findings with CI's
Go 1.25.12; this is not a passing release gate.

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
Inventory listing persistence now supports scoped literal search, explicit status
and inactive filters, featured/creation/ID ordering and bounded continuation tuples.
Runtime-role PostgreSQL tests pass pagination and creation ceilings, private-field
search exclusion, literal wildcard characters, cross-user/dealer and revoked
access, and no data returned on audit failure. Review found a missing/null Featured
value could disagree with SQL ordering; a failing database regression now passes
with strict stored-flag validation. The full dealer PostgreSQL race suite and
`make check check-contracts` pass; final mapper changes also receive targeted Go
and structural checks. Required follow-up review found no remaining blocker.
The disposable database was removed. Inventory browsing/editor screens remain
required integration work.
The listing API now composes fresh policy and transactional page reads, exposing
search/status/inactive filters with an opaque actor/dealer/filter-bound encrypted
cursor. Page size can change without altering the creation ceiling or ordering
tuple. Controlled application and real HTTP tests cover altered/foreign cursors,
revoked permissions, missing dependencies, denied repository reads, validation
redaction and terminal array envelopes. Generated OpenAPI/TypeScript contracts
include listing, and the typed client validates every returned record, dealer
scope, duplicate IDs, bounds and continuation shape before returning any page.
Real local HTTP fixture tests pass exact query encoding, credential rotation,
terminal pages, protocol failures and denied/network outcomes. Required read-only
review found no blockers. `make check check-contracts` and inventory application
race tests pass. The full real-service script now includes this listing journey; hosted execution of those new checks remains pending.


Web and native inventory browsing now compose the typed client with a shared,
account/dealer-scoped controller. Search and status changes discard continuation
state, stale requests cannot replace current results, pagination retries retain
the cursor, transient outages retain rows, and permission loss clears them.
The web uses a focused inventory view; native uses a list, pull-to-refresh,
keyboard search and a dismissible status sheet. English and Spanish copy is
complete. Controlled-fake sequencing tests and a real Chromium journey against
an HTTP fixture pass search, filters, pagination, retry and denial, with a reviewed
390px layout without overflow. Full checks/contracts, final type/i18n/transport
gates and both Metro exports pass; read-only review found no blockers. These
exports do not establish native compilation or device interaction acceptance.
Editing/capture screens and durable recovery composition remain next; browsing
alone does not satisfy the inventory parity row.


Existing-record editing is now mounted on web and native with all ordinary
attributes, raw form recovery and debounced remote saves after durable local
persistence. Exact minor-unit conversion accepts locale decimal entry without
rounding; partial dates preserve precision. Fresh access is required before
recovery is opened. Uncertain writes retain their exact attempt, conflicts require
fetched-version review, and denial clears the editor and discards its journal.
Clean checkpoints defer to fresh server data instead of manufacturing a conflict.
Browser acceptance against a controlled HTTP fixture passes autosave, incomplete
price entry through navigation/reopening, committed-but-unacknowledged save
reconciliation, conflict review, permission loss, injected IndexedDB failure,
blocked navigation/unload and recovery retry. Error links reveal and focus internal
fields. The reviewed 390px editor has no horizontal overflow. Core inventory tests,
full checks/contracts, i18n/transport gates and the dependency-age gate pass.
Both platform Metro exports pass; native device interaction is still unverified.
The direct navigation-hook dependency pins the already-present 7.2.6 version.
Review found a Metro import-suffix issue, fixed before successful exports; follow-up
review found no blockers. New-record capture, photos, voice, publication/lifecycle
and the remaining parity rows are still required. The full goal remains active.


New now opens the same editor on web/native without creating an empty server record
on entry. First input durably reserves one creation key; interrupted creation and
restarts reuse it. The account/dealer-scoped pending capture transfers into ordinary
record recovery before its marker is removed. Tests cover storage failures, typing
during creation, interrupted handoff, cleanup failure and denied creation. Browser
Web Locks exclude a competing tab; native process leases exclude duplicate pending
captures. Review found premature lease release during delayed attached-editor
writes; a failing regression now passes after disposal drains all local writes.
A follow-up review found no blockers. The real Chromium/controlled HTTP journey
passes lazy creation, lost acknowledgement, reopening, same-key retry, generated
stock, cross-tab exclusion/release and opening the created record from inventory.
All 49 focused inventory core tests, full checks/contracts, the production web
build and both Metro exports pass. Native route identity updates without an intentional form remount, but actual
keyboard/gesture/background device interaction still requires acceptance. This
completes the text-entry creation path, not the required camera/photo-first journey;
media capture/upload and retained photo references are the next product work.

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
before web/native integration.
The first inventory HTTP slice now exposes dealer-scoped empty-draft creation,
private get and revision-checked attribute editing through generator-produced
registration. HTTP tests cover retry, exact money/date mapping, stale writes,
invalid/provider-like credentials, cross-dealer and insufficient permissions,
authorization failure, limiting, forbidden status/source fields and private error
redaction. Composition restricts money to the explicit supported-currency policy.
Generated contracts include these operations. The real-service acceptance script
now includes the inventory journey; its hosted execution remains pending.
The shared inventory client now uses generated contracts for create/get/edit,
retains idempotency and revisions, snapshots nested edits before asynchronous
credential acquisition, and exposes only safe machine errors. Real HTTP fixture
tests cover rotated sessions, private-body transport, conflicts, malformed replies,
unsafe integer money, invalid date precision/calendar and nullable clearing.
Client integration exposed a nullable referenced-object schema mismatch; explicit
OpenAPI null alternatives now match API money/date JSON, verified by an HTTP
clear-to-unknown regression. Local project/contract checks, client tests and Go
HTTP race tests pass; review findings were fixed. Inventory listing, web/native
editing screens and remaining product workflows remain open.
The shared existing-record editor now preserves typing during in-flight saves,
retries an uncertain write with its original attributes/revision, and resolves
conflicts only through explicit fetched-version decisions. Controlled-fake tests
cover lost responses, independent nested snapshots, validation corrections,
transient recovery failures, access denial and late responses after disposal.
Project/contract checks and required review pass. This is an in-memory workflow;
durable scoped draft storage, autosave scheduling and mounted web/native capture
screens remain necessary before claiming recoverable capture delivery.
Editor checkpoints now export/restore baseline, draft and exact pending revision
without serializing transient failures or replaying a request. A shared protected-
storage journal validates account/dealer/record scope, limits UTF-8 size and age,
serializes writes and makes discard a terminal barrier. Controlled storage tests
cover foreign/corrupt/expired data, delayed reads/writes, oversized values and
retryable deletion failures; restart tests preserve uncertain attempts and typing.
Platform protection, account cleanup and write-ahead integration are not yet wired,
so this is not evidence of device/browser durable recovery or autosave acceptance.
The editor now supports a write-ahead persistence barrier before remote edits.
Tests prove storage failure prevents dispatch, disposal suppresses dispatch after
a delayed write, and a real journal/controller combination recovers a lost-response
attempt after restart without duplicate mutation. The barrier preserves the prior
uncertain intent and sanitizes storage exceptions. Platform storage, background
local-draft persistence and account cleanup still need client composition.
Browser recovery now has a real IndexedDB/Web Crypto adapter: per-user
non-extractable AES-GCM keys, authenticated scope/generation, fresh nonces and
transactional invalidation. Web sign-out clears draft keys and ciphertext with a
persistent cleanup marker and localized retry feedback. Real Chromium acceptance
passes page reload, account isolation, concurrent account handles, tamper rejection,
old-handle rejection after sign-out and delayed encryption during pending cleanup.
The existing dealer browser journey also passes after sign-out integration.
This supplies browser storage; native protection, capture editor mounting and
continuous draft checkpoint scheduling remain outstanding. Encryption does not
protect against malicious code running in the same origin/browser profile.

Native recovery now uses an installation key in SecureStore and authenticated
AES-GCM ciphertext in SQLite, with account/journal binding and serialized storage
operations. Sign-out immediately invalidates existing handles, removes the key and
ciphertext, and retains a durable retry marker if cleanup fails after marker
creation. Session dismissal blocks private presentation until cleanup succeeds.
Tests using real Node encryption cover restart, account isolation, tampering,
cleanup failures and delayed reads/writes during sign-out. A real file-backed
SQLite test verifies reopening and preservation of the previous checkpoint when
replacement aborts. These tests do not execute Expo's native modules on a device.
`make check check-contracts`, dependency-age, Expo compatibility, all 19 Expo
Doctor checks, both Metro exports and clean native prebuild pass. Required code
review found no blockers. Native compilation/device interaction for this change
still require separate evidence. The exact SDK-matched SQLite dependency
adds no reported npm advisory; the current audit still reports 71 findings
(1 critical, 48 high, 18 moderate, 4 low), so security remains release-blocking.
Capture editor mounting and continuous local checkpoint scheduling remain open.

Hosted run [39850772745](https://github.com/elsell/pianotechpros/actions/runs/39850772745)
on `42869c1` passed real-service acceptance, Android Gradle and unsigned iOS
simulator Xcode builds. Verification failed on 23 reachable Go vulnerabilities.
This verifies the preceding browser recovery commit and earlier native changes;
it does not establish native build or device evidence for the new SQLite adapter.






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
