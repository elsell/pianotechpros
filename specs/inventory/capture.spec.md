# Piano capture and publication specification

Status: product acceptance contract; not yet implemented by this scaffold.

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
