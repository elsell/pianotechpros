# Piano capture and publication specification

Status: implementation in progress; the complete acceptance journeys remain required.

## Task and vocabulary

A dealer standing beside a piano can start a private record, photograph it,
describe it naturally, review the result, and publish intentionally. The main
commands are New, Publish, Sell and Unpublish. Sale state and public visibility
are independent: a sold instrument can remain visible until explicitly hidden.

## Capture

New opens one coherent photo-first editor, not a setup wizard. Camera is reachable
in two deliberate taps from inventory, excluding OS permission prompts. Use the
system camera/photo library, request permission at use, and retain a library or
manual-entry alternative when capture is unavailable. Create a private draft
lazily before the first upload. Photos upload independently with progress and
retry; failure never erases text or blocks further entry. The first active image
is the cover. Reorder supports explicit accessible commands as well as dragging.
Photo inspection returns to the same draft and scroll position.

Prioritize photos, dictation and identifying details. Make/model, form factor,
condition, finish, size, manufacturing date, asking price and public description
stay within this task. Disclose stock number, acquisition cost and private notes
secondarily. Manufacturer suggestions accept custom text. Manufacturing date
preserves year/month/day precision; a year must never invent a known day. Player
system is a boolean independent of form factor. Money entry uses currency units,
never storage cents. Unknown public price is shown as price on request.

## Draft safety

Saving is automatic, with truthful unsaved, saving, saved and failed states.
Navigation, backgrounding, interrupted uploads and retry must not silently lose
accepted work. Define durable local recovery and server revision conflict
handling before implementing autosave; no implicit offline mutation queue.
A private working draft is separate from the immutable last-published snapshot.
Typing, voice proposals and photo removal must never silently alter the showroom.
Public visibility and unsaved/saved state remain separately understandable.

## Voice

The microphone has permission, listening, processing, applied, clarification and
failure states. Stop is explicit; duplicate recording is unavailable during
processing. Keep typed entry available. Empty/unstated values never erase data.
Confident changes may update the private draft with an inspectable summary and
Undo. Ambiguity asks a focused question. The transcript is secondary. AI cannot
publish, sell, unpublish, or remove/reorder photos. Credentials stay on the server;
raw audio is transient. Validate typed proposals before application.

## Publication

Readiness requires an uploaded photo, form factor, condition, and a display title
or enough facts to generate one. Missing requirements are named and focused before
confirmation. Publish explicitly confirms the buyer-visible change, validates
server-side and atomically snapshots only public fields plus photo references.
Failure preserves the private draft. Publishing changes replaces the live
snapshot; Unpublish leaves the record intact. Sell collects a sale price and
changes sale state without publishing unrelated draft changes.

Private notes, acquisition cost, sold price, serial numbers, scan tokens and
internal history never enter a public projection. Each committed revision and
lifecycle transition produces authorized, append-only history with the mutation.

## Acceptance journeys

- New → camera → dictation → stop → review/publication, with no forced setup
  detours. Count confirmation separately from the capture action budget.
- Permission denied, partial upload failure and voice failure retain all work.
- Navigate away/return, background/restore, and retry a failed save without loss.
- Edit a published piano; buyers still see the previous complete snapshot.
- Remove a draft photo referenced by the live snapshot; the live image survives.
- Sell with unrelated unsaved edits; only sale state changes publicly.
- Cross-dealer reads/mutations and unauthorized publication fail closed.
- Keyboard and screen readers complete capture and publication without drag,
  color, silhouettes, or voice being mandatory.

## Shared revision editing controller

An account/dealer-bound controller owns a deep-copied saved baseline and editable
attributes for an existing private record. It serializes saves while allowing
continued typing; a completed save must not erase edits made during that request.
Snapshots and subscriptions cannot expose mutable controller-owned nested values.
No automatic background retry or autosave is enabled by this controller alone.
Durable scoped recovery and presentation remain separate required adapters before
shipping the automatic-saving capture experience.

An uncertain write retains the exact attempted attributes and expected revision.
Retry sends that same attempt, not newly typed values. Recovery reads the current
record: the exact next revision with matching attempted attributes acknowledges
the save; the old revision leaves the attempt retryable; any other change requires
explicit conflict review. A stale conflict never automatically rebases. Users may
choose the fetched version or explicitly keep their local draft against that
fetched revision. Missing/denied access clears private state immediately. Transient
read/write failures retain it. Disposal clears private state and ignores all late
responses. Invalid record identity, dealer or regressing revision never becomes
an accepted baseline. Validation rejection releases the attempted write for edits.

## Scoped recovery checkpoints

Recovery checkpoints are versioned and bound to immutable application user ID,
dealer ID and record ID. They contain only saved baseline, local attributes,
conflict state and an optional attempted write with its original expected revision.
Do not serialize credentials, errors, probes, subscribers or live promises. A
checkpoint taken during a request marks its attempt uncertain on restoration.
Restoration never sends a request automatically; reconcile an uncertain attempt
or explicitly retry it. Conflict choices must fetch a fresh revision after restart.
Validate schema, exact scope, record identity/revision and all attribute shapes
before restoration. Reject corrupted/foreign checkpoints without partial import.

A serialized journal writes checkpoints through a protected-storage port in order.
A removal barrier prevents earlier delayed writes from recreating discarded data;
a terminal discard rejects later writes. Read/write failures propagate so the UI
cannot claim durable recovery. Size is bounded to 1 MiB of UTF-8 JSON; stored
checkpoints expire seven days after the last successful write, using an injected
clock. Expired or corrupt data is removed and never returned. This policy does not
authorize offline mutation queues or replace current server permission checks.
Platform protected-storage adapters, account sign-out cleanup and write-ahead
integration before remote saves remain required before enabling autosave.

## Write-ahead save barrier

The editor accepts an optional injected attempt-persistence capability. Protected
capture composition must provide it using the scoped journal. Before issuing a
remote mutation, the editor awaits persistence of a copied checkpoint containing
the exact attempted attributes/revision and current local draft. Persistence
failure sends no remote request and preserves edits; a newly prepared attempt can
be corrected, while a previously uncertain attempt retains its original intent.
Disposal while persistence is pending suppresses the later remote request.
Storage failures expose only a fixed diagnostic, never raw storage exceptions.
The in-memory controller remains usable without this capability for tests and
non-durable consumers; that mode must not be presented as durable autosave.

## Browser recovery storage

Browser checkpoints use IndexedDB and AES-256-GCM with a non-exportable Web Crypto
key per application user. Each write uses a fresh 96-bit nonce and authenticates
user identity, account generation and journal key as additional data. IndexedDB
contains ciphertext, nonce and scope metadata, never plaintext checkpoints.
Keys reside in the same browser profile: this protects stored payload representation,
not against malicious same-origin code or a compromised browser profile.

Account handles capture a generation. Clearing browser recovery atomically removes
all account keys and draft rows; existing handles cannot read or write afterward,
even when the same user opens a new handle. Crypto work runs outside transactions;
write transactions recheck generation before committing. Ciphertext tampering and
storage failures fail closed with fixed diagnostic errors. Browser acceptance must
use real IndexedDB and Web Crypto, including reload, concurrent handles, tampering,
account isolation and stale writes after clearing. Native storage remains separate.

Web sign-out removes the session and mounted private state before awaiting draft
cleanup. A non-sensitive localStorage cleanup marker is written before deletion;
failed deletion leaves it set. Existing storage handles reject reads/writes while
it is set, and opening recovery first retries cleanup. The marker is removed only
after the atomic database clear commits. Cleanup failure shows localized retry
feedback. Remote session revocation is still attempted independently of cleanup.

The client transport structural gate permits IndexedDB/localStorage and encoding
primitives only in the reviewed browser recovery-storage adapter. It continues to
reject fetch, sockets and global transport bypasses there; the adapter is not a
blanket transport exemption. Gate regressions cover both permitted storage calls
and forbidden network calls.

## Native recovery storage

Native checkpoints use a private SQLite database containing AES-256-GCM ciphertext,
with a randomly generated installation key held in Expo SecureStore using
WHEN_UNLOCKED_THIS_DEVICE_ONLY accessibility. The encryption authenticates the
application user, installation generation and journal key; every write receives a
fresh 96-bit nonce and a 128-bit tag. SQLite replaces a checkpoint atomically.
The key and plaintext never enter SQLite, logs or diagnostic errors. Keys remain
available to this application's runtime; this does not protect a compromised app
or unlocked device from malicious code running with its privileges.

One process-wide coordinator serializes storage operations. Handles capture the
installation generation; sign-out immediately invalidates all in-memory handles.
Before removing the key and ciphertext, cleanup persists a SecureStore marker.
Failed cleanup leaves the marker and blocks access; opening recovery retries it
before creating a new key. Old handles cannot write after cleanup or same-account
reentry. A restart preserves successful writes, including uncertain save attempts.
Storage, key access, decryption and tampering errors expose only a fixed diagnostic.
Native session dismissal blocks private UI and clears both the credential and
recovery storage; either failure retains the existing sign-out retry path. Network
outages alone must not erase recovery. Tests cover real authenticated encryption,
restart, account isolation, failed cleanup, tampering and delayed writes. Native
build and device interruption evidence remain separate acceptance requirements.

## Mounted existing-record editor

Web and native existing-record editors fetch current authorized data before
opening scoped recovery. A failed or denied fetch never reveals a locally cached
record. Raw form text, including incomplete money and date entry, is checkpointed
so an interruption does not turn partial input into a different value. Money uses
the selected locale's decimal separator without grouping; currency is explicit,
JPY has zero fractional digits, and other configured currencies have two. Never
round excess precision or change currency because the UI locale changed. Persist
the form's decimal convention with recovery. Partial dates retain separate year,
month and day text; invalid combinations block remote saving, not local recovery.

Every form change queues a protected checkpoint immediately. UI distinguishes
local persistence in progress/failure from remote saving/saved state. Remote
saving is debounced after local persistence, uses the write-ahead barrier, and
pauses after failures, uncertain outcomes or conflicts. Restore never triggers a
mutation automatically: offer explicit resume/reconciliation. A newer server
revision requires a fetched-version comparison and deliberate choice. Ordinary
navigation awaits the current recovery write; a failed write retains the screen
with retry feedback. Teardown cancels timers and suppresses late callbacks without
deleting recoverable drafts. Permission loss clears mounted values and discards
the scoped recovery journal. Sign-out retains its installation-wide cleanup.

Initial existing-record presentation groups identity, description/asking price,
and secondary internal details, with all editable attributes represented. Native
uses keyboard-aware scrolling, standard text fields, switches and explicit choice
sheets; web uses labelled fields and secondary disclosure. Conflict review shows
field-level current/local values. This integration does not satisfy photo, voice,
new-record capture, lifecycle or publication acceptance until those journeys exist.

Native navigation uses React Navigation's `usePreventRemove` with a narrowly
scoped local-durability guard, preserving system back behavior when recovery is
ready. The direct `@react-navigation/native` dependency supplies its public hook; the
compatible pinned family is specified in `../platform/native-experience.spec.md`. Its
navigation-only import is approved by the client transport gate. Browser tab close
uses a before-unload guard while local persistence is incomplete; this cannot
promise an OS process kill will wait for asynchronous work. Do not present pending
local writes as protected. Platform interaction checks must exercise these guards.

Presentation references: [Apple text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
and [entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data)
inform labelled input, appropriate keyboards and selection controls;
[React Navigation removal protection](https://reactnavigation.org/docs/use-prevent-remove/)
defines the native navigation guard. These references guide implementation and do
not replace large-text, screen-reader, keyboard and gesture device acceptance.

## Lazy New capture and durable creation identity

New opens the same editable task without creating a server record or requiring
setup fields. The first accepted detail change (or future upload request) persists
a versioned creation intent before sending an empty-draft create command. The
intent holds one random idempotency key and raw form values, scoped by user/dealer
in a reserved `@capture` recovery slot. Failed or interrupted requests always reuse
that key. A restart pauses automatic mutation and requires explicit continuation.
Leaving and returning to New resumes pending capture; it never silently replaces
unsent input with an empty form. Fresh dealer/inventory read authority precedes
opening local recovery; the create endpoint separately enforces write authority.

Only one pending New capture per user/dealer may be open on an installation.
Browser Web Locks provide exclusive ownership across tabs for the full pending
handoff; native uses a process coordinator. Failure to acquire the capability
fails closed with localized feedback. Do not use a race-prone read/write flag as
a lock. Release ownership after queued local writes finish on teardown, and after
a completed handoff. Browser closure releases its Web Lock through the platform.

Record creation does not discard the intent. First persist the returned identity
and creation baseline, then establish the ordinary record-scoped recovery journal
with all current input, preserving the server-generated stock number when the
user has not supplied one. Typing during creation/handoff must survive. Only after
that journal is durable may the pending capture slot be removed. Failed removal
is retryable and prevents treating handoff as complete. Recovery from an interrupted
handoff prefers an already-existing record journal over the older capture payload;
a changed server revision still requires explicit conflict review. The same editor
continues after handoff; native updates its route identity without rebuilding the
form or dismissing the keyboard. No initial facts are silently published.

A confirmed empty capture has no saved record; its UI must not report server-saved
status. Navigation waits for local durability, including pending creation intent,
but does not wait for a network request whose exact intent is already protected.
Photo capture remains required separately and must reuse this creation boundary.

## Photo-triggered record creation

A selected photo can request a record through the capture workspace's explicit
ensureRecord operation without inventing a text change. Opening New alone remains
lazy. The operation uses the existing durable creation intent and exclusive lease;
concurrent ensure/save operations share the same creation attempt. It returns a
record ID only after the record journal handoff is durable and the capture journal
is removed. Storage, authorization, disposal or uncertain-creation failures return
no usable ID. Retrying uses the original key, including after restart. Invalid
partial text remains recoverable and does not prevent obtaining a private record.
This capability does not itself store a photo: the upload coordinator must first
protect selected media and preserve its own retry intent.
