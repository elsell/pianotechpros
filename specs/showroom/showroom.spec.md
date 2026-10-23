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

## Verification

Domain tests cover unpublished/malformed/zero-value profiles, field allowlisting,
foreign dealer publications, hidden publications, availability-only overlays,
private-edit isolation, hidden prices, copied nested fields and ordered photos,
and photo IDs absent from the current publication. Repository/HTTP tests must
add concurrent unpublish, unknown/foreign identifiers, dependency failure,
malformed stored snapshots, bounded literal queries and retained-photo delivery.
Browser journeys must verify the public UI and rendered metadata contain only
the published projection, including after private edits and lifecycle changes.
