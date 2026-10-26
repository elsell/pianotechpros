# Web-only parity acceptance audit

## Scope and decision

Initial audit date: 2026-10-25. Initial reviewed rebuild source: main commit
`689308b29e2349805124420bae243d3f3f8bcf3a`. The baseline and required behaviors
remain those in `product-parity.spec.md`; this document does not narrow them.

**The rebuilt website is not yet proven 100% feature-complete against the legacy
site.** The named product surfaces are implemented, but coverage mixes real
backend tests, controlled HTTP browser fixtures and separately executed persisted
browser journeys. Their composition must not be described as universal end-to-end
coverage. No percentage is assigned. Mobile QA, app-store signing, a new hostname
and GitOps are separate from this web parity decision.

The baseline table is a source/coverage audit; the dated execution sections below
record subsequent results. A test listed in the baseline table
is evidence of the assertions and integration surface it defines; its existence
alone is not evidence of a passing run. Preserve exact-commit CI results and
named runtime evidence when closing a row. No row is promoted to complete by
this audit. The existing roadmap records prior execution evidence and limitations.

## Evidence types

- Real browser/service: normal browser interactions through the application API
  and isolated persistent services; no route substitution for the behavior tested.
- Browser fixture: real web presentation against a controlled HTTP implementation;
  useful for deterministic errors, races, accessibility and retention, but not
  proof of the real backend connection.
- Backend: real HTTP/application/storage/authorization tests, independently of UI.

The recurring `scripts/live-acceptance.sh` runs real Dex browser sign-in, real API
and storage/authorization suites, and several browser fixture suites. In particular,
`dealer-web-suite.mjs` starts a web development server; its dealer browser script
supplies a controlled HTTP API. Customer, technician, banner, showroom and inquiry
browser scripts also supply controlled HTTP APIs, including their built-web runs.
The word "live" in the runner name does not change those boundaries.

## Feature-by-feature web closure requirements

Paths below are repository-relative. All IDs refer to `product-parity.spec.md`.
A remaining check indicates missing or insufficient audited proof unless an
implementation gap is explicitly identified.

| ID | Existing implementation and evidence surface | Required web closure evidence |
| --- | --- | --- |
| ID-01 | `web-browser-acceptance.mjs`: real Dex PKCE, Spanish rendering, reload and logout; session-rotation suite covers stale credentials | Record supported-provider compatibility and web failure/revocation journeys; Dex success alone does not prove a live Google integration |
| DL-01 | `dealer-api-acceptance.py` real creation/editing; `dealer-web-acceptance.mjs` fixture onboarding/retry/conflict | Browser create with duplicate slug rejection, reload and edit through real API |
| DL-02 | Dealer UI and API settings/public projection checks | Persist every required setting from web; inspect rendered public/private separation against that saved record |
| DL-03 | `banner-web-acceptance.mjs` built-web upload/review/retry/removal fixture; backend banner storage tests | Real browser upload, replace/remove and public image delivery on the same dealer |
| DL-04 | Real API staff/invitation/role boundaries plus fixture browser administration/join | Two real browser users: invite, accept, permission changes, revoke and denied old access |
| IN-01 | Real API listing/search/filter/pagination; fixture browser inventory | Locate persisted records by required search fields and filters through actual web/API connection |
| IN-02 | Fixture browser lazy New, protected capture, lost-create retry; real API draft idempotency | Real browser New/photo-first path, no premature required fields, retry without duplicate creation |
| IN-03 | Shared field contracts and fixture browser compact editor; real API update/validation | Web save/reopen of the complete field inventory, partial date precision and exact money values |
| IN-04 | Fixture browser recovery, IndexedDB, ownership, conflict, outages; backend revision coverage | Real browser reload/navigation and competing real-session edits, with persisted result assertions |
| PH-01 | Real API photo upload/private read; fixture browser upload/retry and protected media recovery | Browser-selected bytes reach real processing/storage; permission/cancel/failure preserve draft and other photos |
| PH-02 | Fixture browser order, preview, description and confirmed removal; backend photo commands | Real persisted ordering/cover/removal plus keyboard and return-position interaction |
| PH-03 | `dealer-api-acceptance.py` real snapshot photo retention/public delivery | Web removes draft photo; anonymous browser still sees prior publication until explicit republish |
| VO-01 | `voice-recorder-acceptance.mjs` real Chromium recorder with synthetic microphone; provider HTTP tests | Real configured speech provider with representative audio; permission/interruption/stop/retry in supported browsers |
| VO-02 | Typed field validation/Undo tests and fixture browser proposal review | Real provider output reaches web review; accepted field changes persist only after explicit Apply and save; Undo preserves later edits |
| PU-01 | Real API readiness/publish; fixture browser review/focus/cancel/conflicts | Actual browser readiness focus and confirmed snapshot publication, checked from anonymous browser |
| PU-02 | Real API private-edit isolation/unpublish; fixture browser lifecycle review | Simultaneous owner and anonymous browser prove last snapshot stability and explicit unpublish |
| LC-01 | Real API sale/correction/status snapshot behavior; fixture browser sale review | Full specified transition set through web with persisted price/history and private-edit isolation |
| LC-02 | `inventory-history-persisted-acceptance.mjs` real service browser journey for bounded history and voice origin | Retain exact-run evidence; add this standalone script to reproducible recurring acceptance with synthetic setup |
| QR-01 | `inventory-scan-persisted-acceptance.mjs` real service browser flow; fixture scan failures and action review | Retain exact-run evidence and automate fixture provisioning; browser print/scan usability remains separate from token authorization |
| SH-01 | Real API public projections; built showroom fixture renders brand, trust notes, images and fallbacks | Render a real persisted dealer/publication with actual processed photos/banner |
| SH-02 | Real API public filters and built showroom fixture; **gap at audited base:** showroom presentation always renders filters without a catalog-size/usefulness condition | Implement hiding unhelpful filters for small catalogs; verify real catalog filtering and sold/private exclusion |
| SH-03 | Built showroom fixture gallery/contact/share/related records; real API public detail | Real listing gallery and related links plus keyboard/touch and contact/share behavior |
| SH-04 | Built showroom fixture canonical redirects, SSR metadata, JSON-LD and private sentinel checks | Crawl rendered pages backed by real saved/public snapshots, checking exact canonical and private-field exclusion |
| SH-05 | Built crawler fixture and no-origin rejection; real database catalog visibility/race tests | Fetch sitemap/robots/discovery text against real publication changes; verify public URL scope |
| IQ-01 | `inquiry-persisted-browser-acceptance.mjs` real anonymous submission to owner inbox; backend transactional tests | Preserve exact execution and make synthetic provisioning/run part of recurring acceptance |
| IQ-02 | Backend honeypot/abuse/Turnstile adapter tests; browser fixture challenge and rate-failure responses | Configured real verification round trip using safe provider test configuration; no production keys/data; real rate-limit/bot path assertions |
| IQ-03 | Persisted browser inquiry read/reload plus fixture inbox races/contact/denial | Automate persisted journey and verify submitted snapshot remains unchanged after owner edits |
| CU-01 | Built `customer-web-acceptance.mjs` fixture recovery/conflict/validation; real Go HTTP/PostgreSQL/SpiceDB suites | Browser create/edit/reload of business, multiple locations and linked pianos through real API; cross-user denial |
| TE-01 | Built `technician-web-acceptance.mjs` fixture editing/recovery; real Go backend boundary suites | Real browser profile save/reopen, service-area/preferences and separate-user privacy |
| TE-02 | Fixture browser partial rule recovery, timezone independence and removal; real domain/persistence validation | Real browser weekly/effective-date save/reopen with timezone semantics, duplicate/invalid rejection and request preference |

## Small-showroom correction

The follow-up implementation now omits the filter panel for zero/one initial
results with no continuation, preserves it for active filters and pagination,
and retains an Include sold pianos link. The legacy read-only source threshold
was greater than one listing. The new regression failed before the change and
passes against development and built web servers; zero/one/two records, filtered
empty results, current/next cursors and sold discovery are covered. Svelte checks
and the shared locale gate pass; the single-listing screenshot was inspected.
This fixes that presentation gap without claiming SH-02's remaining composed
real-catalog acceptance or the whole website complete.

## Current execution evidence and remaining sequence

1. The normal-PKCE customer/technician profile journey passed fresh-account CI
   run `40218708883`, source `2ffaedb09c5d6bc1cc4babb706453ccd82960615`.
   It verifies business/two locations/linked piano, weekly timezone/effective
   dates, persisted reload/edit and separate-user isolation.
2. PR #72 merged the recurring real-service inquiry/history/scan, photo-first
   publication, dealer settings/banner and two-user staff journeys. Combined
   acceptance and both native builds passed run `40221325565` at exact source
   `4a985595e2486cd1001a51a3c45778a0e8639f87`. This includes inquiry snapshot
   preservation, history 20+5 pagination, private scan continuation, viewer
   restrictions and revocation of an existing browser session.
3. PR #74 merged complete inventory fields, protected invalid-date recovery,
   two-session conflict reconciliation and real publication discovery. Combined
   acceptance and both native builds passed run `40221328970`, exact source
   `04b91066379a085ea63f54c512e4444b429fe915`. Canonical URLs, exact-price JSON-LD,
   robots, localized discovery and sitemap removal after unpublishing passed.
4. Separate photo-management and complete publication journeys passed locally
   in Chromium, Firefox 151 and Linux WebKit 26.5 against isolated real services.
   Photo-management acceptance and both native builds passed run `40221559445`
   at `e3c90f4a6283a3d90492f0be7cc1d84787f34435`; PR #75 merged. The one-off Firefox/WebKit
   checks are not Safari or native iOS acceptance. A local real-browser inventory
   check also passed stock/title/make/model search, featured ordering, exact
   30+1 pagination without duplicates and sold-filter exclusion using 31 synthetic
   records; item 5 records its subsequent recurring acceptance. The separate
   all-status extension passed the recurring run described below.
5. PR #80 merged inventory browse, complete lifecycle and public gallery/contact/
   sharing/filter journeys. Combined real-service acceptance passed run
   `40224029059` at source `2ff7f16e45ad538ecc45d7a5739f515c39561976`.
   The log records exact 31-record browsing, all six lifecycle transitions,
   immutable sale correction history, public gallery keyboard interaction,
   canonical clipboard/contact/related links and title/type/currency/price filters.
   This supersedes the recurring-CI gaps for those specific assertions, not the
   full baseline table. PR #81 subsequently merged exact six-status filtering
   after run `40365056103` passed at source
   `84783cef6cdd2cbb5d5f9f89a670509468a70d00`.
6. Finish provider, accessibility, broader supported-browser and device evidence
   from the table above. Live
   Turnstile public test-key Siteverify responses were observed without the
   required `inquiry` action; they do not prove an enabled successful inquiry
   path. Keep exact hostname/action validation intact. Dedicated non-production
   Gemini and Turnstile configuration remains requested; never borrow legacy
   production credentials. Screen-reader, broader supported-browser and native
   interaction acceptance remain separate requirements.

Production-readiness additionally requires the security/configuration/release
contracts already specified under platform. Existing reviewed dependency
mitigations remain subject to exact-commit evidence; this audit waives no gate.

## Recurring inventory browse acceptance

The isolated real-service acceptance runner must provision 31 uniquely named
private inventory records using the normally signed-in browser's application
session, then exercise the website's stock/title/make/model searches, featured
ordering, 30+1 cursor pagination and sold exclusion. Assert the complete expected
record set without duplicates after loading more. Provision through the real API;
do not substitute HTTP responses. Require loopback web, identity and API origins,
keep credentials in memory, and respect the unchanged audit rate limit. A local
pass alone does not establish the recurring CI result or close all IN-01 filters.

Local execution of this recurring script passed on 2026-10-25 with synthetic
marker `Browse3d5c1bb6`: all four search fields, featured-first ordering, exact
31-record set across pagination and exclusion of drafts from sold results.
Recurring CI passed run `40224029059` with marker `Browsef0a86197` for these
search/order/pagination assertions. All-six-status filter coverage is separate.

## Persisted web lifecycle acceptance

Exercise a new synthetic photo-first draft through publication, reserved, sold,
sale correction, in-service, available, draft and archived states using ordinary
browser review and confirmation. Check sale amount defaults to asking price,
explicit override persists in append-only history, correction adds a new event,
and lifecycle-only changes retain the published snapshot's other fields despite
private edits. Hidden states and unpublishing must remove anonymous access;
returning to available must not silently republish. Run through isolated real
services with unchanged authorization and rate limits. No completion claim until
actual execution passes. Pace the two halves across fresh audit windows; never
relax rate limits or retry a rejected mutation.

The paced real-service journey passed locally on 2026-10-25 for synthetic record
`4b78e80e-ed4d-488e-8fe1-107e3823f68c`, including explicit unpublish independence,
sale defaults/override, immutable correction history, all six lifecycle states,
private-edit isolation and no silent republication. Recurring CI passed run
`40224029059` for record `54aa4ae3-6180-403e-b60c-3004f83c2a18`.

## Persisted public listing interactions

Use normal owner sign-in to create and explicitly publish a synthetic listing
with two processed photos. Provision a reserved synthetic contact phone through
the authorized real API after the parent fixture tests empty-phone behavior.
In an anonymous browser verify keyboard and narrow
viewport gallery navigation, exact canonical clipboard URL, contact links from
persisted dealer data, related listing navigation and no horizontal overflow.
Save a screenshot for visual inspection. Do not substitute API responses, launch
phone/email applications or treat desktop Chromium as native device acceptance.

Local real-service execution passed for synthetic record
`ad64c5c3-d352-4df4-8654-f16afacdd5b6` on 2026-10-25. The 390px full-page
screenshot was inspected: gallery controls, contact actions, inquiry form and
related cards remain readable without horizontal overflow. Synthetic color-block
photos establish processing and layout behavior, not photographic quality.
Recurring CI passed run `40224029059` for record
`2ea9f917-69f8-4ecc-925f-8fbaa78d08be`. Actual touch/device acceptance remains open.

## Persisted showroom filtering

Extend the real public-listing journey with exact-title search, matching and
nonmatching piano type, currency and inclusive minimum/maximum price boundaries.
After a private title edit, only the explicit published title is searchable.
Sold status disappears from default available results and appears through sold
and include-sold filters; explicit unpublishing removes it even from include-sold
results. Exercise browser form submission against persisted API data. This does
not replace large-catalog pagination or native touch acceptance.

The full corrected gallery/filter journey passed locally on 2026-10-25 for
synthetic record `96568d3c-f6ec-41fd-89d7-70016f12e788`. Each filter form opens
with an active initial search so the control remains accessible after sale or
unpublication leaves a small catalog. Recurring fresh-fixture CI passed run
`40224029059` for record `2ea9f917-69f8-4ecc-925f-8fbaa78d08be`.
Large public-catalog pagination passed the recurring run recorded below; native
touch evidence remains separate.

## Persisted inventory status filters

The recurring inventory browse journey must cover all six saved lifecycle states.
After its initial search/pagination checks, use a fresh audit window to transition
five synthetic drafts through the real API. In the browser assert exact sets for
each status, default active exclusion of sold/archived records, and all-status
30+1 pagination without duplicates. Do not weaken limits or replace API responses.

The complete extended inventory journey passed locally with synthetic marker
`Browseb6d735f3`: exact status sets, active exclusion, and all-status pagination
were checked against persisted records. Recurring CI passed run `40365056103`
with marker `Browseec912d1e`, including exact sets for six statuses, active
exclusion and all-status pagination. PR #81 merged in
`745a0e5b22b7e4c2d07d371e05cc1d7da31a886b`.

## Persisted large-showroom pagination

Provision 31 uniquely searchable, published synthetic records through the real
owner API, with processed photos and one featured record. Pace provisioning
across fresh audit windows without relaxing limits. An anonymous browser must
follow the rendered continuation link, retain search/type/currency filters,
and see the exact 12+12+7 record set without duplicates (the public client
requests 12 records per page). Reload the final page
and verify its stable contents and absence of a continuation. This is a new
acceptance requirement; do not claim a passing execution until recorded.

The first CI execution provisioned all 31 records but failed an incorrect
30-record first-page expectation. Public `showroomFilters` explicitly requests
12, unlike private inventory. Correct the test to follow both continuation
links and assert 12+12+7; this does not change product pagination behavior.

The corrected journey passed recurring run `40374312501` at exact source
`54ae198f09bc695fb17948826a3c916637824a27`, with marker `Cataloge84bb6c7`.
Its log confirms all 31 processed-photo publications, featured ordering, exact
12+12+7 pagination, retained search/type/currency filters, stable final-page
reload and no duplicate or extra continuation. Combined acceptance and both
native builds passed. PR #84 merged at
`89c3e34fe49c1744f9a2fffca485041450188035`. This closes this pagination evidence
gap, not the provider, screen-reader, supported-browser or native touch gates.

## Recurring showroom browser engines

Run the persisted public-pagination journey in Chromium, Firefox and WebKit
using the same 31 real published records. Each engine must independently follow
both continuation links, preserve filters, prove the exact 12+12+7 set, and
reload the terminal page. Log the engine and version. Use a fresh anonymous
context for each engine and pace engines across fresh public rate-limit windows;
never substitute API responses, suppress failures, or relax production limits.
CI installs browser binaries from the pinned Playwright version and their host
dependencies. This proves this journey only, not all website behavior or Safari
on an Apple device. Record execution before claiming any new engine passed.

Run `40378770317` at source `10ef2223de0ac54447a38bd00c3fd7e66ef551ae`
passed the complete acceptance job, including marker `Catalogca2b82df` in
Chromium 149.0.7827.55, Firefox 151.0 and Linux WebKit 26.5. Each engine logged
all six required pagination checks. Both native builds passed; verification
reported only the authorized node-forge finding with all 21 mitigation tests
passing. This is evidence for those engines and assertions, not physical Safari
or website-wide cross-browser parity. The subsequent documentation reconciliation passed fresh run `40382626453` at
`ef13ac221df11a26f247b9e0a97d91eeb11a8c16`, with marker `Catalogb562996f`
and the same three engine versions and six assertions. Both native builds and
combined acceptance passed; verification reported only the authorized advisory
with all 21 mitigation tests passing. PR #87 merged at
`f2ad82c3603873997f49cda118bc5384945ab2c4`.
