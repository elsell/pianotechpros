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

Continuation tokens at the application boundary must be integrity protected and
bound to the exact showroom and normalized filters; they cannot confer visibility.
Pagination is a live traversal, not snapshot isolation: publish, unpublish and
featured edits can move records between pages. Refresh starts a new traversal.
Do not invent a stable total count from page size. Signed continuation transport,
collection routes and client filtering remain required beyond the repository.

## Individual read API contract

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

## Read API verification

Domain tests cover unpublished/malformed/zero-value profiles, field allowlisting,
foreign dealer publications, hidden publications, availability-only overlays,
private-edit isolation, hidden prices, copied nested fields and ordered photos,
and photo IDs absent from the current publication. Repository/HTTP tests must
add concurrent unpublish, unknown/foreign identifiers, dependency failure,
malformed stored snapshots, bounded literal queries and retained-photo delivery.
Browser journeys must verify the public UI and rendered metadata contain only
the published projection, including after private edits and lifecycle changes.
