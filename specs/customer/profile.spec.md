# Customer profile and owned pianos

## Product contract

CU-01 preserves the reviewed legacy customer-profile behavior: personal/business
identity, contact details, multiple service locations and privately owned pianos.
Behavioral provenance is legacy commit
`3509f7e0a7bc32df17ef63dd4d0fcff00c8a170d`, customer route/schema/page and setup
tests. No implementation or data is imported. A customer is an account-owned
profile, not a dealer, tenant, inventory listing or exclusive account role. A
user may independently have customer, dealer and technician capabilities.

Each user has at most one customer profile with a server-generated immutable ID,
immutable owner user ID, optimistic revision and UTC creation/update timestamps.
Profile attributes contain name, personal/business flag, optional business name,
email, optional phone, service locations and owned pianos. Business name is
required when the business flag is true. Email is an exact mailbox without a
display name. Values are private; none enter showroom or crawler projections.

There are 1–50 service locations and 0–200 pianos. Each location has a stable
profile-local key, label, street lines, city, region, postal code, IANA timezone
and optional notes. Each piano has a stable profile-local key, location key,
nickname, physical form, optional make/model/serial/manufactured year, independent
player-piano flag and notes. A piano must reference one of this profile's
locations. Location and piano keys are each unique within their collection;
they are not global resource IDs or authorization grants. Keys use 1–50 ASCII
letters, digits, underscores or hyphens and are preserved exactly. Clients create
opaque keys once when adding a row and retain them through retries and saves.

Limits count Unicode code points after trimming outer whitespace: profile and
business names 200, email 320, phone 32; location label/city 100, street lines 200,
region/timezone 64, postal code 3–20, notes 2000; piano nickname/make/model/serial
100 and notes 2000. Required location fields are label, first street line, city,
region, postal code and timezone. Nickname and form are required for a piano.
Reject invalid UTF-8 and control characters; multiline notes may contain tabs
and line breaks. Forms are grand, full_size_upright, studio_upright, console,
spinet and other. The legacy upright choice maps to full_size_upright. An unknown
manufacturing year remains absent; supplied years are 1700–2100 as in the baseline.

Timezone validation uses an injected catalog, not the server's local timezone or
an environment lookup in domain code. Accept UTC and supported IANA zone names;
reject Local, arbitrary offsets, traversal paths and unknown names. Domain
construction and revision copy nested slices and optional year values. Callers
cannot mutate accepted state through retained input references. Clocks are
injected; timestamps use UTC microsecond precision. Revisions are positive safe
JSON integers. A stale revision cannot overwrite accepted edits, and a no-op
preserves revision/time while still requiring an audited application interaction.

## Authorization, persistence and transport

Creation authenticates an opaque application session with api:user scope, uses
the principal limiter, and binds the new profile to the caller. A database unique
owner constraint and principal-scoped idempotency prevent duplicate profiles.
Profile, owner relationship outbox and creation audit commit atomically. Pending
authorization publication is explicit; it never returns the profile as ready.
Bootstrap creation cannot name another owner or a preexisting profile ID.

Read/update require both a persisted owner match and fully consistent SpiceDB
customer:view/customer:update permission. A customer object has only an owner
relation to user; no implicit dealer or technician access is granted. Missing,
foreign and unauthorized IDs return indistinguishable not-found errors.
Dependency failures fail closed. Every authenticated read, no-op, successful
mutation and denied decision is audited through the bounded principal budget;
mutations and audit writes are one transaction. Audit metadata excludes personal
fields and request bodies. The API credential remains behind the existing typed
authorization proxy without schema-write capability.

Repository reads require an actor ID. Nested keys are scoped to the profile in
storage, and saves retain unchanged keys instead of deleting and recreating all
locations/pianos. Aggregate updates include an expected revision and at most
1 MiB of input. Removal by omission is allowed only through an explicit client
confirmation; a referenced location cannot be removed while its piano remains.
Removing customer data never mutates dealer inventory or deletes audit history.
Profile deletion is not a generic CRUD capability. Generated operations remain
fail-closed until these policies have adversarial tests and real adapters.

## Web and native experience

Provide a dedicated personal profile entry independent of the selected shop.
Use a compact identity/contact form and separate location and piano lists with
clear summaries. Editing a location/piano opens a focused sheet or native detail
screen with appropriate email/phone keyboards, labeled form/year controls and a
searchable timezone choice. Choose platform interactions before layout components.
Adding the first location is guided; adding a piano requires choosing an existing
location without reentering its address. All labels/errors/accessibility text
come from the shared English/Spanish catalog.

Keep edits recoverable through navigation, backgrounding and transient failures.
Validate locally before submission; focus the first invalid field. Save status
must reflect server acceptance. Conflicts retain the draft and offer explicit
reload/review rather than silent overwrite. Removing a location or piano requires
confirmation naming the affected item; a location with linked pianos explains
the required reassignment. Keyboard, screen-reader, large-text and device
interaction acceptance remain release requirements on each platform.

## Required evidence

Cover personal/business validation, Unicode limits, malformed email/timezone,
duplicate keys, unknown/cross-profile references, bounded collections, optional
years, defensive copies, stale revisions and injected-clock behavior. Persistence
tests cover duplicate creation races, idempotency, stable nested keys, audit
rollback, cross-user access and authorization readiness. Endpoint tests cover
missing/malformed/expired sessions, wrong identity/provider credentials,
insufficient permission, revoked access, limiter/dependency failures and legitimate
access. Real web/native journeys create, edit and reopen the complete profile,
retain edits after errors, reassign pianos and confirm removals. CU-01 remains
incomplete until these product and interaction requirements are verified.
