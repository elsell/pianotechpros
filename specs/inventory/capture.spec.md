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
