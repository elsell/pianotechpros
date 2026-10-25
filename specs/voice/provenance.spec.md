# Inventory voice provenance

Accepted suggestions remain ordinary editable draft values. Their provenance is
private input-method metadata, not an assertion that a model verified a fact.
It never grants permission or affects publication visibility. Raw audio,
transcripts, evidence and provider credentials are not persisted in inventory
history, audit or draft recovery.

## Attribute revision

A revision may combine manual and accepted voice changes. An attributed revision
accepts an explicit list of attribute fields reported as voice-origin changes;
all other changed attributes are manual. Reject duplicates, unknown/protected
fields, more than eighteen fields and voice labels for unchanged attributes.
Normalize/validate attribute values before determining changes. Money and partial
dates are atomic attributes. Labels cannot alter ID, dealer, revision, timestamps,
lifecycle, ownership or publication.

Every changed field receives exactly one private history source. The event source
is manual for all-manual edits, voice for all-voice edits, and mixed only when both
occur. Mixed is not a valid legacy whole-command source and cannot be used for
lifecycle, publication, photo or dealer commands. Existing uniform revision calls
retain their behavior and produce consistent field sources. Returned metadata
must not alias caller-owned collections.

## Durable client and persistence integration

Before release, the shared editor journal must retain attribution for accepted
voice values through recovery and lost acknowledgements. A later manual edit to
a field clears its voice attribution. Conditional Undo restores only fields that
still match the applied value and records the restoring edit as manual; it must
not relabel unrelated fields. Autosave sends only attribution for its actual
changed fields, with the same revision as its attribute payload. Server-side
normalization may reject misleading labels rather than inventing attribution.

The authenticated scoped edit endpoint must validate this metadata and atomically
commit field sources with inventory revision, immutable history and audit. History
schema changes require migration guards and PostgreSQL tests. Old history retains
its original source; it is never rewritten to fabricate field-level evidence.
Source metadata stays out of public showroom DTOs. Client recovery, transport,
persistence and adversarial boundary acceptance remain required after the domain
contract is implemented.

## PostgreSQL history guard

Migration 27 adds nullable private `field_sources` metadata. Existing rows remain
null and immutable. New attribute-history inserts require an exact source map for
all actual changes against the preceding immutable record snapshot (including
snapshots nested by photo/publication commands). The inserted attribute snapshot
must match the current scoped inventory revision. Source values are manual or
voice, and the aggregate source must match the map. Other history kinds reject
field metadata and mixed sources. The existing matching-audit and append-only
guards remain in force.

The attributed repository operation uses the existing dealer authorization lock,
scoped record lock, exact revision check and transaction. A failed metadata guard,
audit write or history insert rolls back the inventory update. Downgrade refuses
to discard any recorded field metadata; migration tooling cannot silently erase
provenance. Runtime credentials retain no migration or history rewrite powers.

## Authenticated edit transport

The existing inventory PUT accepts optional `voiceFields`, an array of at most
18 canonical attribute names. Omission means a manual revision. Authentication,
SpiceDB policy, coordinated limiting and scoped transactional repository checks
apply identically to manual and attributed edits. The service never accepts a
caller-supplied aggregate source. Duplicate, unknown, protected and unchanged
labels are rejected without committing attributes, history or audit success.
Metadata is input-method attribution claimed by the authenticated editor; it is
not proof of a provider result. Public and ordinary inventory response DTOs do
not expose private field attribution. Generated OpenAPI describes the optional
input, and existing clients that omit it retain manual behavior.

The shared generated-contract client snapshots the optional field list together
with attributes and expected revision before asynchronous credential lookup.
Later caller mutations cannot change the attribution sent for that revision.

## Editor checkpoint ownership

The editor checkpoint stores optional voice-field lists for the current draft and
for a pending write separately. Missing lists in version-1 checkpoints mean
manual work. Lists contain only unique allowed attribute names; invalid metadata
fails recovery validation rather than being silently dropped. Copies returned to
callers never share mutable lists with editor state.

An injected field-difference policy identifies actual changed fields. Manual
changes clear voice labels only for those changed fields. Explicit voice Apply
may label only fields it changes. The save attempt snapshots both attributes and
attribution before durable attempt persistence; later typing cannot alter either.
Retries after uncertain delivery use that original pair. Acknowledging a save or
resolving its lost acknowledgement removes labels for values now equal to the
new baseline, while preserving attribution for later unsaved changes. Keeping
local conflict edits retains their input-method labels; choosing the server
version clears them. Account denial and disposal clear all in-memory attribution.
The form adapter may normalize valid values when computing save-field differences;
raw input changes still clear attribution even if normalization erases the change.

While a write is pending, a later accepted voice value may equal the old baseline
but differ from the pending value. Retain that origin relative to either baseline
until the pending outcome is resolved; otherwise a retry or recovered commit would
incorrectly turn the later voice edit into a manual edit.

## Form and client integration

Web and native Apply pass only the fields actually changed by the accepted
proposal into the shared form workspace. Undo uses the ordinary manual-change
path. Capture must attach an authorized record before accepting attributed
changes; it must never drop provenance in the pre-record intent journal.

Form attribution treats amount/currency/decimal and year/month/day as atomic
attribute groups. Raw manual corrections clear the group's label even when the
normalized value is unchanged. Save labels compare normalized wire attributes,
so whitespace or numeric formatting alone cannot claim a voice revision.
