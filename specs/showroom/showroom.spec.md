# Public showroom and listing delivery

## Visibility and public data

Public delivery is a separate read boundary. Anonymous visitors may read only a
currently published dealer showroom and its currently visible piano publication.
Every profile, listing, photo, related-listing, metadata and discovery request
must recheck those conditions. Authentication is not required to view deliberate
publications and does not make hidden material public. Private dealer/inventory
routes retain their existing session, membership, SpiceDB and audit requirements.

The public dealer projection contains only dealer ID, slug, name, business contact
details, address, description/tagline, accent, banner alt text and the appointment,
delivery, warranty and service notes. Never serialize dealer ownership, membership,
revision, timestamps or the private entity. Validate persisted profile values
before projection; do not silently normalize corrupt data. An unpublished or
missing showroom is unavailable. A malformed published profile fails closed.

Public piano content comes exclusively from the validated retained publication,
never the current private working record. The publication must belong to the
requested showroom, remain visible, and have available, reserved or sold status.
The existing inventory public allowlist is authoritative, including suppression
of hidden prices. Private edits and draft photo removals leave this snapshot
unchanged until explicit republishing. Selling overlays availability without
copying private edits. Unpublishing either the showroom or piano hides delivery.

A photo request additionally requires membership in the current public snapshot's
ordered photo references. An old publication revision, known UUID, draft photo or
foreign dealer's photo is not sufficient. The media adapter must enforce this
check in the same scoped read as fetching bytes; it cannot expose arbitrary blob
keys. Responses and defensive copies must not let a caller mutate later reads.

## Public application boundary and presentation

The first persistence operations read a profile by exact slug, a piano by that
slug and record ID, and photo bytes by slug, record ID and photo ID. Invalid or
oversized lookup identifiers fail before storage access. A public listing result
includes its public dealer profile so both parts come from one visibility check.
No actor ID is accepted by these deliberately anonymous ports.

PostgreSQL locks the published dealer row for shared access, then the scoped
record's identity/revision/status row, until the projection and any requested
photo bytes are read. Publication commands and profile edits take conflicting
locks, so a read waiting behind an unpublish observes the committed hidden state.
This establishes a read linearization point, not revocation of bytes already
delivered to a visitor. Never load private working attributes for public content;
read and validate the immutable snapshot and current availability pointer instead.
Check stored photo bytes against their digest and dimensions before returning
them. Errors return zero values, including after a transaction completion failure.

The forthcoming repository port must select publication visibility and showroom
visibility together, with scoped identifiers and bounded queries. It must expose
only public projections and must not call private user-scoped repository methods
without a user. Source-based coordinated rate limiting applies to public routes;
public browsing must not create unbounded authenticated audit events. Missing,
hidden and foreign-scope identifiers use the same not-found response. Dependency
or malformed-storage failures return no partial content. Initial responses use
no-store so a stale cache cannot undo unpublishing.

Delivery must complete SH-01 through SH-05 and PH-03 in the parity contract:
photo-led branded browsing, literal search and type/price/availability filters,
gallery and related pianos, contact/share links, readable canonical URLs with UUID
fallback, safe metadata and discovery. Sold pianos are excluded from available
counts. Price filtering must never reveal hidden prices or compare unlike
currencies. These HTTP, persistence and client behaviors remain required; domain
projection tests alone do not establish delivery or product completion.

## Public collection semantics

Collection reads are scoped to one currently published showroom and return only
visible available/reserved/sold publication snapshots. The default availability
filter includes available and reserved pianos; `all` also includes sold, and each
of those three statuses can be selected explicitly. Draft, in-service and archived
records are never public collection entries. Form filtering uses the five known
piano forms. Search is a trimmed case-insensitive literal substring of published
stock number, title, make or model, limited to 120 Unicode code points with no
control characters. Percent, underscore and backslash are literal search text.

Price bounds are inclusive integer minor units from zero through the shared safe
integer maximum. Bounds require one uppercase three-letter currency; a currency
filter can also be used alone. Hidden or absent prices never satisfy a currency
or price filter, and different currencies are never compared. Min must not exceed
max. Normalize/copy filter values before storage so callers cannot mutate bounds
while a query is in progress.

Pages contain at most 100 pianos. Ordering is published featured first, then record
ID ascending. Repository continuation tuples contain the last featured flag and
ID, and queries fetch at most limit+1 candidates. Each returned candidate is
validated through the retained-publication mapper while the showroom visibility
lock is held. The public profile and page share that transaction. No private
working attributes participate in filtering, ordering or projection. Empty pages
still verify showroom visibility; errors return no profile or partial records.
Persisted snapshots must contain an explicit non-null boolean `Featured`: missing
or null values and case-variant keys fail restoration rather than allowing SQL
ordering and decoded continuation tuples to disagree.

Continuation tokens at the application boundary must be integrity protected and
bound to the exact showroom and normalized filters; they cannot confer visibility.
Pagination is a live traversal, not snapshot isolation: publish, unpublish and
featured edits can move records between pages. Refresh starts a new traversal.
Do not invent a stable total count from page size. Signed continuation transport,
collection routes and client filtering remain required beyond the repository.

The collection application accepts filters, a limit (default 30, maximum 100),
and an opaque continuation token; raw continuation tuples are never client input.
Tokens use AES-GCM with a context-derived key from the configured cursor signing
key (at least 32 bytes), a fresh cryptographic nonce, and a versioned showroom
context distinct from private inventory tokens. Bind the token to the exact slug
and all normalized filters including page size. Reject tampering, malformed or
oversized tokens (maximum 4096 bytes), incompatible versions and changed bindings
before repository access. Key rotation invalidates old tokens. Every page still
rechecks publication visibility. Missing repository/key fails closed. Errors
discard all content and tokens. Emit bounded typed outcome probes without query
values. Repository pages must respect scope, size and nonempty continuation.

## Individual read API contract

`GET /v1/showrooms/{slug}/pianos` exposes collection browsing with optional
`search`, `form`, `availability`, `currency`, `minPrice`, `maxPrice`, `limit`, and
`cursor` query parameters. `data` contains `profile` and `pianos`; `meta.nextCursor`
is present only when another page exists. Price parameters retain the distinction
between absent and zero. Invalid filters/cursors return a generic 400; Huma's
structural parameter validation may return 422. The collection shares the same
anonymous access, source-limiter proof, no-store headers and generic failures as
individual reads. Application bootstrap injects the configured cursor key without
adding environment access to application or adapter code.

`GET /v1/showrooms/{slug}` returns `data` containing the public dealer profile.
`GET /v1/showrooms/{slug}/pianos/{id}` returns `data.profile` and `data.piano` from
the same scoped read. `GET /v1/showrooms/{slug}/pianos/{id}/photos/{photoID}` returns
normalized `image/jpeg` bytes. These operations declare no OIDC security requirement;
an Authorization header grants no extra access. All responses are no-store with
no-referrer and nosniff headers. Unknown/hidden/foreign resources return the same
404 `not_found`; storage/configuration failures return 503 `unavailable` without
storage error text. The contract reuses only the existing public listing DTO.

Every public route requires proof in its request context that the server's
coordinated source limiter accepted that request. Missing limiter/clock composition
fails closed before storage. This proof is created only by the server middleware,
not from a client header. The existing trusted-proxy policy chooses the source.
Rate-limit rejection or dependency failure must not reach the repository. Public
read application services emit typed operation/outcome probes without profile,
record, photo, search, credential or contact values. Repository errors always
discard any accompanying data before serialization.

## Public web delivery

Public web routes live at `/showrooms/{slug}` and
`/showrooms/{slug}/pianos/{id}`. Server rendering uses the generated public API
adapter with no application credential, cookies or redirect following. Profile,
listing and page payloads are structurally validated and scoped before rendering;
unknown/private fields, malformed money, unsafe links and foreign identifiers
fail closed. API failures become localized unavailable/not-found states without
upstream error details. HTML and photo delivery are no-store. A same-origin photo
route obtains only the scoped public JPEG through that adapter, preserving the
existing image CSP rather than permitting arbitrary remote image origins.
The client boundary gate permits pure URI-component encoding, SvelteKit's page
state reader, and response construction in `+server.ts` handlers. These permit
safe links and returning already-fetched JPEG bytes, not direct network access;
fetch/WebSocket and alternate transport imports remain rejected in those files.

Browsing uses a photo-led card grid, an explicit filter submission, visible
availability and price-on-request, and continuation links retaining the exact
filters. Detail presents the selected photo, keyboard-operable previous/next and
thumbnail controls, business contact links and public specifications. Back to
showroom remains available. All interface and accessibility copy uses the shared
English/Spanish catalog. Content is escaped, and contact targets come only from
validated public profile data. This first web delivery still requires subsequent
readable canonical aliases, related pianos, structured discovery metadata,
responsive interaction acceptance and inquiry delivery before parity is complete.

## Read API verification

Domain tests cover unpublished/malformed/zero-value profiles, field allowlisting,
foreign dealer publications, hidden publications, availability-only overlays,
private-edit isolation, hidden prices, copied nested fields and ordered photos,
and photo IDs absent from the current publication. Repository/HTTP tests must
add concurrent unpublish, unknown/foreign identifiers, dependency failure,
malformed stored snapshots, bounded literal queries and retained-photo delivery.
Browser journeys must verify the public UI and rendered metadata contain only
the published projection, including after private edits and lifecycle changes.

## Readable listing URLs

A published listing uses a bounded readable title prefix followed by its immutable
UUID. The prefix derives only from the published title, never private editor
fields. Bare UUID links remain valid and resolve to the same current publication.
The shared pure URL policy recognizes a UUID only at the end of a complete path
segment; it never searches an arbitrary string for an embedded identifier.
Malformed segments fail before an API read. Existing opaque safe identifiers
remain usable without a readable alias. A stale title prefix resolves by ID and
canonicalizes only after the current published projection has been authorized.
Canonicalization uses a no-store temporary redirect. Locale negotiation remains
Accept-Language based; canonical paths drop all query parameters;
private identifiers, credentials and arbitrary query strings must not enter a
canonical public link. Media routes continue to use immutable IDs. No database
slug or redirect is written and no legacy implementation is imported.

Behavioral provenance: the reviewed legacy public URL utility used a normalized
title plus UUID and a bare-UUID fallback. This implementation independently
specifies stricter whole-segment parsing and publication-derived canonicalization.

## Related public pianos

A listing offers up to three other available pianos from the same published
showroom. Prefer matching physical form; if that yields none, use the showroom's
existing featured-first ordering across available forms. Fetch at most four
candidates per query and at most two queries, never an unbounded scan. Exclude the
current piano and non-available records. Conflicting showroom identity or malformed
results fail closed. Optional related-content failure leaves the main listing
usable with a localized unavailable notice and an ordinary showroom link; it
must never synthesize candidates from private inventory or cached editor data.
Cards use publication-derived readable links and scoped public thumbnails. All
copy and photo accessibility labels use the shared catalog.

## Structured discovery metadata

Public metadata is derived only from validated public showroom/listing DTOs.
It includes an absolute canonical URL, social title/description/image and escaped
JSON-LD for the showroom business and listing Product. Use only existing public
contact/address/stock fields. Never emit serial, private notes, cost, sale price,
QR tokens, draft values, fabricated ratings/reviews or a fake zero price. Offers
are present only when the publication exposes a price; amounts preserve exact
currency minor-unit precision. Availability reflects current public lifecycle
status. Reserved and sold records must not claim ordinary in-stock availability.

Absolute metadata URLs use an explicitly configured public web origin, never
Host/Forwarded headers, the API URL or an internal service address. Missing public
origin omits absolute discovery metadata while ordinary browsing remains usable;
production publication requires configuring the intended public HTTPS origin.
Invalid supplied origins fail startup validation. Local HTTP origins are allowed
only in explicit development mode. Canonical paths never copy query parameters.
JSON-LD serialization escapes HTML-significant characters so public text cannot
close a script element. Hero imagery loads eagerly; secondary images remain lazy.

References reviewed: Google Search Central's product-snippet guidance
(https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
and canonical URL guidance
(https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
Metadata does not promise rich-result eligibility or invent an offer when the
seller requests contact for pricing.

## Public link sharing

The public listing offers the platform share sheet when supported, with clipboard
copy as the desktop fallback. Share only the configured canonical public URL and
published title; never the request query, current private editor values, scan
tokens or credentials. Missing discovery origin reports sharing unavailable.
Sharing is an explicit user action. Cancellation is neutral, and permission or
clipboard failure offers a selectable public link without claiming success.
Disable repeated actions while pending; ignore completions after navigation or a
listing change. Native owner sharing must independently resolve the current
public projection before presenting a platform sheet; implementation and device
acceptance for that native entry point remain required.

## Crawler discovery

SH-05 provides `/robots.txt`, `/sitemap.xml` and `/llms.txt` without exposing
authenticated routes or private inventory. Robots permits public showroom pages
and their rendering assets, and discourages crawling authenticated surfaces. It
is a crawl hint, never an authorization mechanism. Without an explicitly
configured public web origin it disallows crawling and advertises no sitemap;
XML and discovery-text routes fail unavailable instead of guessing a hostname.

The root sitemap is an index of current published showroom sitemaps. A showroom
sitemap contains its canonical profile URL and current visible published listing
URLs, including reserved and sold publications. Paths derive from public titles
and immutable IDs. Discovery uses a dedicated anonymous repository/application
boundary with coordinated source limiting, no-store responses and publication
visibility checks serialized against writes. It must never enumerate private
repository methods or issue one full inventory request per listing. Only public
identity, slug, name and published listing ID/title may cross this boundary.

Reads and output are bounded. The initial capacity is 10,000 published showrooms
and 10,000 visible listings per showroom, each detected with a limit-plus-one
read. Overflow fails unavailable rather than silently publishing a partial
sitemap. XML is UTF-8, entity escaped, limited to 50,000 entries and 50 MiB;
absolute URLs are shorter than 2,048 characters and share the configured origin.
Do not invent last-modified timestamps from request time. Anonymous dependency
failures never reuse stale private or previously published data.

Discovery text identifies the product, links to the complete sitemap and lists
published showrooms with safe plain-text names and URLs. Shared English/Spanish
catalogs own all explanatory text. User text cannot inject Markdown links or
control characters. It does not claim any search engine or model consumes it.

Required evidence includes empty results, unpublished shops and pianos, private
title isolation, concurrent unpublication, malformed stored data, scope mismatch,
overflow, rate-limit/dependency failure, configured-origin enforcement, XML
escaping and crawler browser responses. The implementation is independent of
the reviewed legacy crawler routes; no legacy code is imported.

Protocol references: https://www.sitemaps.org/protocol.html and
https://developers.google.com/search/docs/crawling-indexing/robots/intro.
