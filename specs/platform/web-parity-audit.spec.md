# Web-only parity acceptance audit

## Scope and decision

Audit date: 2026-10-25. Reviewed rebuild source: main commit
`689308b29e2349805124420bae243d3f3f8bcf3a`. The baseline and required behaviors
remain those in `product-parity.spec.md`; this document does not narrow them.

**The rebuilt website is not yet proven 100% feature-complete against the legacy
site.** The named product surfaces are implemented, but coverage mixes real
backend tests, controlled HTTP browser fixtures and separately executed persisted
browser journeys. Their composition must not be described as universal end-to-end
coverage. No percentage is assigned. Mobile QA, app-store signing, a new hostname
and GitOps are separate from this web parity decision.

This is a source/coverage audit, not a new execution result. A test listed below
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
   records; preserve it in recurring acceptance before treating that row as closed.
5. Finish remaining showroom filtering/gallery/contact, complete lifecycle,
   provider, accessibility and device evidence from the table above. Live
   Turnstile public test-key Siteverify responses were observed without the
   required `inquiry` action; they do not prove an enabled successful inquiry
   path. Keep exact hostname/action validation intact. Dedicated non-production
   Gemini and Turnstile configuration remains requested; never borrow legacy
   production credentials. Screen-reader, broader supported-browser and native
   interaction acceptance remain separate requirements.

Production-readiness additionally requires the security/configuration/release
contracts already specified under platform. Existing reviewed dependency
mitigations remain subject to exact-commit evidence; this audit waives no gate.
