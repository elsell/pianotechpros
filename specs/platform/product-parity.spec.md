# Feature-complete rebuild contract

## Baseline and completion rule

The requested deliverable is a working product on web, iOS and Android, not a
platform scaffold. The legacy source baseline reviewed read-only is commit
`3509f7e0a7bc32df17ef63dd4d0fcff00c8a170d`. This specification records behavior,
not copied implementation. No legacy configuration, credentials or data belongs
in the public repository.

Evidence reviewed: legacy vision, shop-owner and buyer-showroom specifications;
all API route declarations; dealer input/output schemas and authorization schema;
inventory/status/public-inquiry implementations; frontend page inventory; backend
dealer/customer/identity test declarations; and inventory browser acceptance
journeys. Source/test presence establishes baseline scope, not proof that every
legacy behavior works. Existing browser tests use simulated backend responses;
rebuild acceptance must exercise real application boundaries.

Every row below requires implemented API behavior, appropriate web/native
presentation, adversarial boundary coverage, and recorded interaction evidence.
Rows remain incomplete until those artifacts exist and pass. A specification,
stub, fixture-only adapter, mock response, successful export or native compilation
does not complete a product journey. Platform-specific equivalents preserve the
task, not identical markup. Public crawler endpoints apply to web; native clients
must preserve sharing and public-listing navigation.

## Parity matrix

All product rows are currently **not implemented** in the rebuild. Authentication
has working foundation/browser evidence but still needs device interaction QA.

| ID | Required behavior | Legacy evidence | Completion journey |
| --- | --- | --- | --- |
| ID-01 | Google-compatible OIDC sign-in, session restore, logout, error recovery | auth routes; identity tests | Real provider exchange, opaque session use, offline native restoration, revocation and cross-user denial |
| DL-01 | Dealer onboarding and unique showroom slug | dealer routes/schemas; DealerSetup | Create profile, validate duplicate slug, reopen and edit on each client |
| DL-02 | Contact/address, description/tagline, website, accent, showroom visibility, appointment/delivery/warranty/service notes | dealer schema; settings page | Save settings and verify only intended public data appears |
| DL-03 | Banner upload/remove, alt text and fallback image | dealer/banner routes; showroom pages | Replace/remove banner without broken public imagery |
| DL-04 | Explicit dealer membership and staff permissions | legacy owner relations; requested staff scope | Owner/editor/viewer boundaries, invitation/revocation and cross-dealer denial; owner-only membership administration |
| IN-01 | Inventory list, search, status/inactive filters, featured ordering | inventory list route; inventory page | Locate by stock/title/make/model; sold/archive hidden by default and discoverable deliberately |
| IN-02 | Lazy draft creation; generated editable stock/title | create route; New page | New to camera in two taps with no required setup fields |
| IN-03 | Complete compact editor | inventory schemas; New/detail pages | Edit every field, preserve unknown values, partial dates and money precision |
| IN-04 | Autosave, truthful save status, recoverable draft and revision conflict handling | update route; autosave browser test | Navigate/reload/background/fail/retry without accepted data loss or silent overwrite |
| PH-01 | Camera/library selection, independent upload progress/retry, private fetch | photo routes; New/detail pages | Denied permission and failed upload retain text and other photos |
| PH-02 | Cover/order, accessible move controls, remove, full-screen preview | order/delete routes; owner workflow | Reorder by touch and keyboard, return to same editor position |
| PH-03 | Published photo retention and scoped public delivery | versioning; public photo route | Removing a draft photo leaves its live snapshot intact until republish |
| VO-01 | Microphone permission/listening level/stop/processing states | dictation routes; audio utility; browser tests | Real audio transcription, cancellation and failure recovery; no overlapping recording |
| VO-02 | Typed extraction for every editable field; confidence/evidence; focused ambiguity; additive changes | proposal schemas/utilities/tests | Validate provider output; ignore blanks; review/Undo changes; no lifecycle or photo mutations from model output |
| PU-01 | Readiness feedback and explicit publish/republish | publish route; readiness/browser tests | Missing requirements focus before confirmation; atomically publish public snapshot only |
| PU-02 | Unpublish independent from sale; private edits never leak live | unpublish/status/versioning | Buyer sees last snapshot throughout autosave, voice and photo editing |
| LC-01 | Draft/available/reserved/in-service/sold/archived transitions, correction and history | status enum/route; QR/archive test | Sell asks sale price, defaults to list price; status-only live update preserves other draft edits |
| LC-02 | Append-only versions and lifecycle history; no destructive inventory delete | versioning and detail response | Each mutation records actor/source/changed fields/time atomically; recent history visible |
| QR-01 | Stable printable/displayable QR label and authenticated scan action view | QR/scan routes; scan page | Scan to identify and manage piano; opaque token never grants permission; fast unpublish |
| SH-01 | Dealer-branded showroom, trust notes, featured/available fallback imagery | showroom routes/pages/spec | Public browsing shows current published pianos with calm, photo-led presentation |
| SH-02 | Search/type/price/availability filters, hide unhelpful filters in small catalogs | showroom spec/pages | Filter without leaking private or unpublished records; sold excluded from available counts |
| SH-03 | Listing detail, gallery carousel, related pianos, call/email/share | public detail page; carousel test | Keyboard/touch gallery, clear availability and price-on-request, functioning contact links |
| SH-04 | Canonical readable URLs, UUID fallback, metadata/JSON-LD, alt text and loading priorities | public URL/SEO utilities; metadata tests | Crawl rendered public pages; no hidden prices or private fields in source/metadata |
| SH-05 | robots, sitemap and public discovery text | crawler routes/tests | Only published showroom/listing URLs included; authenticated surfaces excluded |
| IQ-01 | Anonymous inquiry form tied to current public piano snapshot | public inquiry route/test | Persist name/email/optional phone/preference/message before success; no account required |
| IQ-02 | Honeypot, CAPTCHA port, rate limiting, generic bot success | anti-abuse adapter; inquiry protection test | Bot-filled submission is ignored; invalid challenge/dependency failure fails closed when configured |
| IQ-03 | Dealer inquiry inbox, unread/read state, buyer contact and submitted snapshot | dealer inquiry routes; inbox page/test | Authorized dealer reads/marks read; public edits do not rewrite historical inquiry context |
| CU-01 | Customer personal/business profile, multiple service locations and owned pianos | customer-profile route/page/test | Validate business name, unique location keys and piano references; isolate private records |
| TE-01 | Technician contact/business/bio, origin/service radius/travel limit, supported services/piano forms | technician-profile route/page/identity tests | Edit and reopen profile; searchable profile requires suitable services and forms |
| TE-02 | Weekly availability with timezone/effective dates and request-without-availability preference | availability component/test; technician schema | Validate time/date windows and weekday uniqueness; preserve local-time semantics |

## Inventory field contract

Editor parity includes stock number, display title, featured flag, physical form
(grand/full-size upright/studio upright/console/spinet), independent player-system
flag, condition (new/used/restored/rebuilt/consignment/other), make/model/serial,
manufacturing year or month/day with explicit precision, size, finish, list price
and visibility, location label, public description, acquisition cost and private
notes. Sale price belongs to sale history. Money uses integer minor units at the
API boundary and localized currency-unit input. Dates must not invent precision.

Private serial, cost, notes, sale price, QR token and history never enter public
DTOs, listing URLs, metadata or inquiry public snapshots. An opaque QR token may
appear in its dedicated authenticated scan link; it identifies a record but
confers no permission. Exclude scan tokens from analytics, logs and referrers,
and require the same session/SpiceDB policy as direct record access.
Public status can only expose
published available/reserved/sold records. Archiving retains history and removes
public visibility. Correction creates a new event; it does not rewrite history.

## Native quality and security gates

Follow capture.spec.md and native-experience.spec.md for task-first interaction
design, recoverable drafts, reversible voice and explicit publication. All copy
uses complete shared English/Spanish catalogs. Validate keyboard, large type,
screen readers, dark mode, navigation/dismissal, interruptions and permissions.
Record named build/device evidence; compile-only evidence is insufficient.

Every authenticated product read/list/mutation/denial uses scoped repository
ports, SpiceDB, coordinated principal limits and structured audit. Mutations and
audit/history commit atomically. Failure of authorization or audit never falls
back to unaudited access. Dealer ownership/staff policy must be specified and
adversarially tested before any protected product route returns records.

Security findings require reviewed dependency updates or a concrete, justified
mitigation with reachability evidence; do not lower gates to declare completion.
Real media/speech/CAPTCHA adapters must work through ports, not only test fakes.
Missing external credentials are explicit integration blockers, not completed
features. Never obtain credentials from legacy production configuration.

## Deliberate exclusions

The legacy vision explicitly excludes checkout/POS, accounting, marketplace-wide
search, buyer favorites, financing and service appointment scheduling. Existing
customer/technician profile surfaces remain in parity despite their secondary
role. Inquiry email delivery was explicitly deferred in the legacy implementation;
the inbox is required, outbound email is not silently assumed.

Store credentials/signing and production cutover are deferred by the user. Keep
legacy deployment, GitOps, DNS and live data untouched. No other feature row may
be dropped or relabeled complete simply because implementation is inconvenient.
