# Technician profile and weekly availability

## Product contract and provenance

TE-01 and TE-02 preserve the technician profile behavior reviewed at legacy commit
`3509f7e0a7bc32df17ef63dd4d0fcff00c8a170d`. Behavioral evidence is the technician
profile route/request validators, profile types and service, profile page and
weekly availability component/test. No implementation, configuration or data is
imported. The account owns at most one technician profile independently of its
customer profile and dealer memberships. Technician is a capability, not an
exclusive account role or tenant.

The aggregate has a server-generated immutable ID, immutable owner user ID,
positive optimistic revision and UTC creation/update timestamps. Attributes are
contact name/email/phone, optional business name and public biography, searchable
preference, request-without-published-availability preference, service origin,
service radius, optional driving-time limit, supported services/piano forms and
weekly availability rules. The searchable preference is retained configuration;
it does not create a public endpoint or disclose the service-origin address.
A public directory or publication projection requires its own explicit contract.

Contact name is required (200 Unicode code points), email is a required exact
mailbox (320), phone is optional (32), business name optional (200), biography
optional multiline text (2000). Empty business name is allowed: the legacy
technician does not have the customer's business flag/name requirement. Trim
outer whitespace; reject invalid UTF-8, unpaired surrogates in clients and control
characters except tabs/newlines in biography. Optional text normalizes to empty.

The service origin requires label (100), first street line (200), city (100),
region (64), postal code (3–20) and an IANA timezone (64). Second street line is
optional (200). There is exactly one origin; it is not a customer location and
never implicitly shares that profile's address. Radius is an integer 1–500 miles.
Driving-time limit is absent or an integer 1–1440 minutes; absent does not become
zero. Preserve miles as the stored product unit and localize presentation without
silently changing the underlying radius.

Supported service codes are tuning, voicing, regulation, repair and other.
Supported piano form codes are spinet, console, studio_upright, upright, grand and
other, matching the legacy technician vocabulary. Do not silently collapse studio
upright into upright or substitute customer form codes. Each selection is unique;
unknown codes fail validation. Non-searchable profiles may leave selections empty.
A searchable profile requires at least one service and one form, and either at
least one weekly rule or explicit acceptance of requests without availability.
The baseline checks presence of a rule, including unavailable rules; do not
invent appointment booking or reinterpret the flag as a reservation guarantee.

## Weekly local-time rules

There are zero to seven rules, at most one per weekday. Each rule has a stable
profile-local opaque key, rule kind available/unavailable, recurrence weekly,
weekday 0–6 (Monday–Sunday), local start/end time, IANA timezone, and optional
inclusive effective start/end dates. Keys use 1–50 ASCII letters, digits,
underscores or hyphens, are unique, and survive edits/retries. They are not
resource identifiers or independent authorization grants.

The editor's time controls use minute precision, as in the legacy weekly editor;
wire values are canonical HH:MM. Start must precede end within one local day;
reject equal, overnight and 24:00 ranges instead of silently splitting them.
Effective dates are real Gregorian YYYY-MM-DD calendar dates; either bound may
be absent and, when both are present, start must not exceed end. Never convert
these dates or wall-clock times to UTC instants. Each rule retains its chosen
zone even if the service origin changes. This slice stores recurring local-time
intent; it neither books appointments nor promises a DST occurrence policy.

Timezone validation uses the shared reviewed IANA catalog through an injected
port. Reject Local, arbitrary offsets, traversal and unknown names. The domain
must not read environment variables or depend on the host timezone database.
Normalize equivalent selection ordering so reordering a set alone is a no-op;
retain rule identity and represent rules consistently in weekday order. Copy
all slices, rule values and optional numeric/date values at domain boundaries.

## Persistence, authorization and API

Use explicit create, own-profile read and revision-checked update operations;
never rely on unversioned upsert. Creation uses the current opaque application
session with api:user scope, principal limiter, a principal-scoped idempotency key
and a unique owner constraint. Profile, owner relationship outbox, idempotency
result and audit event commit together. Replays cannot regrant revoked ownership.
Authorization publication readiness is explicit and never bypassed on a retry.

Read/update require a persisted owner match and fully consistent SpiceDB
technician:view/technician:update permission. No implicit customer, dealer,
staff or email-based access exists. Repository operations require the actor ID.
Missing, foreign and unauthorized identifiers are indistinguishable; dependency
failure fails closed. The API runtime credential remains behind the typed
capability proxy and cannot write schema. There is no generic profile delete.

Authenticated reads, lists if introduced, no-op saves, mutations and denials emit
structured bounded audit events. Mutations commit atomically with audit. Do not
put addresses, contact details, biography, request bodies or credentials in audit
metadata. Runtime database credentials cannot alter audit history or migrate the
schema. Persistence restores validated state without changing timestamps or
revision. Revisions stay within the JSON safe integer range; stale revisions,
clock regression and exhaustion never overwrite state. A no-op preserves the
revision/timestamps but still requires authorized, audited application handling.

Huma owns the OpenAPI contract; clients use generated types behind API adapters.
Profile responses contain ID, revision/timestamps and attributes, never owner
selection or provider tokens. Requests reject extra fields and bound input to
1 MiB. Availability removal is an explicit draft operation, not a request to
remove audit history. Protected generic generated routes remain fail-closed
until actual policy and adversarial tests exist.

## Web and native interaction

An account-level technician entry is independent of shops and customer setup.
Use contact/business, service area, supported work and weekly availability
sections. Native interactions use focused screens or sheets, platform keyboards,
searchable timezone choices, localized multi-selection and time/date controls.
Choose interactions before assembling components. A day row summarizes its kind,
local-time window and timezone; editing opens that one rule. Do not display raw
weekday codes, rule keys or JSON to users.

Adding a rule chooses an unused weekday, preserves an opaque key through edits,
and requires explicit time/zone values or clearly visible editable defaults.
Removing a rule requires confirmation naming the affected weekday. Switching
searchability/preferences never silently adds services, clears availability or
changes the origin. Local validation explains requirements and focuses the first
invalid control, opening a choice sheet when that is the appropriate control.

All copy, errors, accessibility names and formatted dates/numbers use the shared
English/Spanish catalog. Preserve incomplete text/date/time input in a protected
API/user-scoped draft. Persist immutable pending commands before dispatch, retain
newer edits across uncertain exact retries, and make revision conflict choices
explicit. Navigation awaits protection and retains the screen on storage failure.
Authorization must precede restoring cached private values. Session loss and
resource denial clear private presentation and protected state; old-token 401s
cannot erase a newer credential's edits. Exclusive ownership and failed cleanup
must survive route remounts without stale writers replacing newer drafts.

## Required evidence

Use TDD with controlled fakes and real boundaries. Cover Unicode/email limits,
all enumerations, duplicate selections/days/keys, radius/travel bounds, empty
optional values, searchable prerequisites, time ordering, leap-day/date ordering,
zone rejection, copy isolation, stale/no-op/exhausted revisions and injected clocks.
Persistence tests cover owner uniqueness, creation races, exact idempotency,
atomic audit/outbox rollback, cleanup privileges and validated reloads.

Endpoint tests include absent/malformed/expired credentials, rejected provider
credentials, cross-user and revoked access, insufficient permission, dependency
and limiter failures, readiness and legitimate create/read/update. Real client
journeys create and reopen contact/origin/service choices and weekly rules,
preserve partial edits through interruption, resolve conflicts explicitly and
confirm removals. Verify web keyboard interaction and native keyboard, Back,
large type, screen reader, dark mode and interruption behavior. Builds, exports,
unit tests and these specifications alone do not complete TE-01 or TE-02.
