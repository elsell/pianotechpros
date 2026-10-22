# Private inventory record contract

## Fields and exact values

An inventory record belongs to one dealer, identified explicitly at creation.
Its private draft contains stock number, optional display title, featured flag,
physical form, independent player-system flag, condition, make/model/serial,
manufacturing date with explicit precision, size, finish, asking price and price
visibility, location, public description, acquisition cost and private notes.
Sale price belongs to lifecycle history, not ordinary editable attributes.

Physical form accepts grand, full_size_upright, studio_upright, console or spinet;
condition accepts new, used, restored, rebuilt, consignment or other. Empty form
and condition represent unknown draft facts and are valid until publication.
Manufacturer/model and size/finish accept custom text. Field bounds are Unicode
code-point counts: stock 80, title 240, make/model 160, serial 160, size 80,
finish/location 200, public description/private notes 10000. Trim surrounding
whitespace and reject invalid UTF-8 without silently truncating values.

Manufacturing date is either absent, year, year/month or complete calendar date.
Represent it as numeric year/month/day: zero month/day means unknown precision;
a day without a month is invalid. Years range from 1 through 9999. Validate real
calendar days including leap years without converting partial dates to invented
January dates. Do not infer precision from timestamps or a timezone.

Money is absent or an exact nonnegative integer minor-unit amount with a
three-uppercase-ASCII-letter currency identifier. Lexical validation does not
claim that an identifier is an ISO-recognized currency; application configuration
must constrain supported currencies before persistence/API delivery. Zero is a
known price, distinct from absent. Limit amounts to 9007199254740991 so generated
JavaScript contracts preserve integer precision. No floating-point money exists
in the domain. Hidden asking price and acquisition cost never enter public
projections. Public projection is a separate publication operation, not entity
serialization.

## Initial draft

Creation requires nonblank record/dealer identifiers and a supplied generated
stock number; identity/stock generation belongs to injected application ports.
Capture creates lazily on the first durable edit/upload, with no required piano
facts. Start revision 1 with draft status and explicit injected creation time.
Copy pointer-valued date/money inputs when validating attributes so mutation of
caller-owned input cannot change the validated value. Display title uses an
explicit title first, then make/model joined by a space, then stock number; it
never invents facts or untranslated generic presentation copy.

## Boundary and next slices

These domain values do not authorize reads, persist themselves, publish data or
call external services. Application commands must enforce dealer membership and
SpiceDB, scoped repositories, revision checks, coordinated rate limits and atomic
audit/history before exposing routes. Add persistence/HTTP only after specifying
and testing those policies. Lifecycle, photos, durable recovery, publication and
client capture acceptance remain required by capture.spec.md and the parity matrix.

## Revision commands and lifecycle history

Ordinary attribute replacement requires the caller's exact revision and validates
all fields, including a nonempty stock number. It cannot change record/dealer ID,
creation time or lifecycle status. Each actual change increments the revision and
returns a separate private history event naming changed fields, actor, source and
injected timestamp. Reject empty changes. Sources are manual or voice; voice can
only change attributes, never lifecycle. Revision exhaustion fails closed.

Statuses are draft, available, reserved, in_service, sold and archived. Distinct
status transitions are explicit manual commands; leaving sold/archived or returning
to draft requires a nonblank correction reason. A sold command requires an
explicit exact sale price; the client may prefill asking price but must confirm it.
Sale price appears only in the private history event. A same-status sold correction
requires a reason and records a new event. Other same-status commands are rejected.
Never rewrite earlier events. Reasons are bounded to 1000 Unicode code points.

Commands reject stale revisions, invalid actor/source/time and timestamps older
than the current record. Returned records, history field lists and sale prices do
not alias caller-owned values. Status changes never apply an attribute payload;
they retain the already committed draft. They do not publish the draft or grant
visibility. Persistence must atomically save the next revision, immutable history,
audit and any required publication-status projection. Archiving removes public
visibility; correcting archive never automatically republishes. Those transactional
and snapshot semantics remain required before any lifecycle endpoint is exposed.
