# Shared customer editor

Framework-independent customer forms live in client-core. Form state retains
incomplete text (including manufacturing year) and stable child keys. Validation
returns ordered machine field paths/codes, never display copy. Count Unicode
code points, reject control/unpaired surrogate characters, validate mailbox
syntax, supported catalog timezones, year/form bounds, unique keys and local
piano references. Convert to wire attributes only after validation; blank year
becomes null and other optional text becomes empty text. Use defensive nested
copies at every public state boundary.

Adding a location or piano consumes an injected unique key once. Piano creation
requires an existing location. Removing a location with linked pianos or the
last location is refused; removing any row requires explicit confirmation.
Reassignment preserves the piano's key. UI adapters own the confirmation dialog
and focus the first issue returned by validation.

The editor uses an injected persistence port for user-scoped protected drafts.
Before any create/save request, durably persist the immutable pending command,
including creation idempotency key or profile ID/expected revision. A persistence
failure prevents submission and leaves edits available. Serialized checkpoint
writes preserve edit order. A retry after an uncertain result resends exactly the
same pending command, even if the user has continued editing. Successful replies
advance the baseline but retain edits made after submission. Invalid or rejected
commands clear pending state; conflict retains the draft and requires explicit
review of current server state before keeping edits against its revision or
replacing them with that state. No automatic stale overwrite is permitted.

A restored baseline never rolls back to an older server revision; conflicting
older reads require a fresh review and cannot enable keeping edits. Exact-mailbox
validation includes server-supported address literals and rejects quoted local
parts that the server parser would rewrite. Review rechecks active scope after
observer notification before dispatching its read.

Checkpoints include schema version, baseline, draft, pending command and conflict
state, and must be validated before restore. A valid restored pending command
retains its original key/revision. An injected active-session predicate suppresses
late responses and exposes no snapshot after scope loss; presentation disposes
on logout/account switch and uses a matching protected user-scoped journal.
Durable journal adapters, UI composition and device recovery acceptance are
separate required integration work; controller unit tests alone do not prove them.
