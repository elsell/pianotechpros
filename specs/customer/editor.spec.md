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

## Protected journal and workspace

The customer journal uses a dedicated versioned namespace keyed by canonical API
base URL and immutable user ID. It uses the existing per-user encrypted storage
capability on each platform, so logout cleanup invalidates customer drafts along
with other private drafts. No fake dealer or inventory identifier is introduced.
Validate envelopes/checkpoints, bound UTF-8 serialized size to 4 MiB, and expire
after seven days using an injected clock. Invalid/expired entries are removed
and reported as machine-only recovery notices. Reads/writes/removal are serialized within each journal instance;
disposal prevents queued writes from reviving discarded data. Errors contain no
stored input or underlying storage cause.

Workspace opening first performs current own-profile and authenticated timezone
requests, checks the active scope after each await, then opens protected storage.
Only an explicit not-found permits the new-profile path. Authentication,
authorization readiness, network and other failures never disclose a cached
profile. A restored baseline must match the currently authorized profile ID;
otherwise discard it and fail closed. Clean checkpoints use fresh server state.
Dirty/pending/conflicted checkpoints retain edits and original creation commands.
The workspace maps wire attributes to form state at its injected API boundary;
UI and native adapters must never submit form strings directly to the HTTP API.

Authenticated denial during editing disposes the editor and clears its journal.
User scope loss prevents newly dispatched API calls and journal writes; already
queued protected-storage cleanup must finish before logout is reported complete.
Account-only creation drafts may reopen after authenticated not-found because
no existing protected resource is cached. Recoveries report whether a draft was
restored or an invalid/expired entry was removed; presentation localizes notices.

Before navigation, protection follows checkpoint writes queued while an earlier
write is in flight. Close returns false and leaves the editor available after a
storage failure; explicit disposal remains available for scope loss/logout. A
closed or denied editor cannot report successful protection. Workspace callers
must honor a failed protection/close result rather than silently navigating.

## Required before UI integration

Every workspace requires an exclusive API/user-scoped lease spanning load,
editing, pending writes and final cleanup. Two instances must not overwrite
one another's pending creation command or delete a newer checkpoint during expiry
or denial cleanup. Test concurrent tabs/workspaces and lease release after failed
opening, denial, storage failure and close. Screens must supply the platform ownership capability; exported foundations
alone do not establish completed UI recovery.

### Aggregate capacity implementation

The protected vault and customer journal admit at most 4 MiB of UTF-8 plaintext
per record, covering baseline, draft and pending copies of an API-bounded profile
(1 MiB per submitted aggregate) plus envelope overhead. Inventory journals retain
their separate 1 MiB bound; selected-media chunk sizes stay unchanged. Shared
constants define plaintext bytes and AES-GCM combined-envelope/base64 ceilings.
Native decoders validate decoded size as well as canonical base64 length, and
web ciphertext limits include the authentication tag. Test encrypted restart with
a valid large customer checkpoint, oversized Unicode rejection, and unchanged
inventory bounds. Multi-workspace ownership remains required before UI use.

### Exclusive workspace ownership implementation

Opening requires an injected exclusive ownership capability keyed by the same
canonical API/user identity as the journal. Acquire before API reads and hold
through storage opening, editing and draining. A competing open fails with a
machine-only busy reason. Failed opening and inactive scope release ownership;
normal close retains ownership if protection fails. Disposal suppresses late
responses, drains queued journal work, then releases. Denial deletes the journal
before release; failed deletion holds ownership and cleanup can retry.

Web uses an exclusive Web Lock with conditional acquisition, no stealing and no
fallback to a tab-local lock. Release waits for the browser's released promise.
Native uses an HMR-stable singleton registry in the app's single JS runtime; no
headless/background or additional JS runtime may access customer recovery. Any
future multi-runtime writer requires persisted cross-runtime arbitration first.
Lease tokens are idempotent and an old release cannot release a newer owner.
The small platform capability adapters are hash-protected by the structural gate.
Test two workspaces sharing a vault, cleanup ordering, opening failures and an
actual browser two-tab acquisition/release/closed-tab recovery sequence.
Snapshot the canonical identity once before awaiting acquisition and use the same
frozen scope for the journal; caller mutation must not redirect protected storage.

## Presentation integration

The account home exposes My customer profile independently of shops. A profile
workspace has contact details, a location list and a piano list. Selecting or
adding a child opens one focused editor; returning preserves partial input in
the protected aggregate draft. New locations begin without an assumed timezone;
users search the authenticated IANA catalog and select an exact name. Pianos
choose an existing location and a localized form; unknown year remains blank.

Every edit queues protected persistence. Track outstanding writes separately
from server saving and never claim saved/protected while a write is pending.
Explicit Back awaits protection and close, retaining the editor on failure;
unload warns while protection is pending or failed. Removal is a separate
explicit confirmation and never permits last/referenced location deletion.
Validation is shown on save or after leaving a field, with the first issue
opening its child editor and focusing the correct labeled input. Required fields
are identified before entry. No field errors are serialized as human copy.

Conflicts show a field-by-field comparison of latest server and local values,
including child additions/removals and optional/boolean values; no raw JSON or
internal child keys are displayed. Keeping edits changes only the expected
revision and requires a subsequent Save. Replacing edits is explicit. An
uncertain command retries its original payload even when newer edits exist;
the interface explains that the newer draft can be saved afterwards.

Web uses semantic forms, keyboard-operable controls, visible focus, responsive
single-column child editors and native select choices. Native uses grouped
sections, focused child screens, platform keyboards, safe-area/keyboard-aware
scrolling and localized confirmation alerts. These decisions follow Apple HIG
Entering data and Sheets (reviewed 2026-10-25); actual device interaction remains
an acceptance gate, independent of build/export success.

Request adapters distinguish a late rejection of a replaced opaque credential
from rejection of the current credential. An old-token 401 is uncertain, retains
the protected command and cannot sign out or discard a newer session's draft.
Conflict comparison detects changed location keys before mapping to display data;
address context and localized ordinal positions disambiguate identical labels.

### Native presentation lifetime

Native effect restarts serialize workspace opening after the previous opening
and its disposal/cleanup have completed. A retired opening must never publish
private state or an error into a replacement screen. Cleanup failure prevents
replacement acquisition; a later explicit retry retries that cleanup before
opening. Retirement suppresses access immediately, including while acquisition
is unresolved. This lifecycle is tested with controlled asynchronous ports;
React effect replay must not produce a false competing-editor error.
The native lifetime is runtime-stable across actual route remounts and development
refreshes, retaining failed cleanup handles until successful retry. Denial hides
picker options immediately with the editor, clears presentation-only copies,
and allows Back after cleanup rather than treating disposal as draft failure.

Native validation brings the first invalid field into view. For timezone,
piano form and piano location it opens the corresponding searchable choice
sheet instead of attempting to focus a nonexistent text input. Missing locations
brings the Add location action into view without creating a row automatically.
Choice sheets show localized empty-search feedback, preserve the current choice
until explicit selection, and identify the field in their accessible controls.
Changing sections resets scroll position; validation may then scroll to its
target. A recoverable draft retains incomplete year input across Back/reopening.

After a completed save retry or successful navigation-protection attempt, clear
the presentation-only storage warning from earlier failed navigation. Current
editor storage failures remain authoritative and visible; a pending or failed
write must never be reported as saved. Acceptance must hold a real native SQLite
write lock, verify blocked Back/save and retained input, release it, then verify
retry persistence and removal of the stale warning on the current/parent screen.
