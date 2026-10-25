# Shared technician editor

Framework-independent forms in client-core preserve incomplete radius/driving
text, local times and effective dates. Contact, origin, optional biography,
searchability, work selections and weekly rules follow profile.spec.md. Defaults
leave required contact/origin/radius empty; optional driving limit is blank.
Validation returns ordered machine field paths/codes with no presentation copy.
Count Unicode code points, reject controls/unpaired surrogates, validate exact
mailboxes and injected timezone membership. Validate integer bounds without
rounding or accepting exponents, local times without UTC conversion, real dates,
unique rule keys/weekdays and supported unique work selections. Searchable
profiles need services/forms and any rule or explicit request acceptance.

Wire conversion is allowed only after validation. Trim contact/origin/biography
text; blank driving input becomes null. Copy origin, selections and rules at every
boundary. Keep stable rule identity and independent rule timezone when origin
changes. Converting stored attributes restores editable numeric strings.

Adding a rule uses an injected unique opaque key once and chooses the first
unused weekday, with visible editable 09:00–17:00, available/weekly defaults and
the current origin timezone. No implicit rule is added by changing preferences.
Refuse more than seven rules or invalid/colliding keys. Moving a rule to another
unused weekday preserves its key. Removal requires explicit confirmation; UI
confirmation names the affected weekday and clears on loss of private scope.
Form-shape recovery validates exact fields and bounded strings/arrays while
allowing incomplete input; invalid draft values must not be silently discarded.

The controller and protected journal must durably snapshot commands
before dispatch, preserve newer edits across exact uncertain retries, enforce
revision conflict review and exclusive API/user ownership, and hide/clear private
state on denial. Native and web adapters own validation focus, platform dialogs,
localized presentation and keyboard/Back behavior. Form tests alone do not prove
protected recovery or native interaction acceptance.

## Controller checkpoint and conflict contract

A stored baseline must pass full form validation; only the draft may retain
incomplete values. A versioned checkpoint contains baseline, incomplete draft, immutable pending
create/save command and conflict state. Create uses an injected idempotency key;
save captures profile identity and expected revision. Persist the checkpoint
before dispatch; failure leaves edits available and prevents the request.
Serialize writes so a late checkpoint cannot overwrite newer edits. An uncertain
result retains exactly the original command across retries and restoration, even
when local weekly rules or contact fields have since changed.

Accept only valid, same-resource save responses at the submitted revision or its
immediate successor. A malformed or mismatched response stays uncertain. On
success, advance baseline and retain newer edits. A definitive rejection clears
pending state; a conflict retains draft and requires fetching current state plus
an explicit keep-edits/use-latest choice. Never accept a regressing reviewed
revision or silently overwrite remote changes. Restored baselines must match the
currently authorized profile; older server reads cannot roll them backward.

An injected active-scope predicate hides snapshots and suppresses late replies.
Recheck scope after observer callbacks before reads/writes. Denial closes private
presentation; owning workspace cleanup remains mandatory before releasing its
lease. Copies isolate snapshots and ports from mutable form arrays/rules. Tests
must cover delayed replies, interrupted exact retries with newer weekly edits,
storage failure, conflict choices, corrupt checkpoints and scope loss.

## Protected journal

Use a dedicated versioned technician namespace bound to canonical API origin/path
and immutable user ID. Inject the platform's per-user encrypted storage; never
substitute inventory or customer resource identities. Validate exact envelopes,
checkpoint state and API/user binding, bound serialized UTF-8 to the shared
4 MiB protected-storage limit, and expire after seven days with an injected clock.
Remove invalid/expired entries and return only a machine recovery notice. Errors
must not expose stored text, keys, tokens or underlying storage causes.

Serialize storage operations. Capture a defensive checkpoint before asynchronous
writes; disposal blocks queued writes, discard waits for already-active writes
and then removes the entry. Reads completed after scope loss reveal nothing.
Actual platform-vault wiring, authorization-before-restore and exclusive lease
ownership remain workspace integration requirements, not journal assumptions.

## Workspace ownership and presentation lifecycle

Acquire exclusive ownership for the canonical API/user journal identity before
any network or storage work. Authorize the current profile and load the validated
timezone catalog before opening protected storage. A missing profile permits a
new draft, but a cached baseline for a missing or different profile is discarded.
Snapshot scope before asynchronous callbacks and suppress all late scope results.

Keep ownership through pending writes and denied-access discard. Failed protection
keeps the editor open; failed cleanup retains ownership and can be retried. Route
unmount retires the workspace immediately, and a runtime-scoped presentation
lifetime drains retired work before opening a successor. Pending creation retries
retain their original key even when the server committed before interruption.
Platform adapters must share ownership and presentation instances across screens;
web cross-tab arbitration and encrypted platform vault wiring remain required.

## Platform integration

Reuse each platform's existing per-account encrypted recovery vault and sign-out
cleanup under the technician journal namespace. Web ownership holds a Web Locks
exclusive conditional request until cleanup completes; unavailable locks fail
closed. Native ownership and presentation lifetimes are runtime singletons that
survive module refresh, with no background writer. The exact adapters are
hash-protected by the client transport gate and confer no network capability.

The native request hook captures the current opaque session for each request;
a retired-token 401 cannot reject a rotated session. Expired credentials block
dispatch. The workspace hook checks account, API and session expiry throughout
its lifecycle, uses the protected vault, and maps failures to shared locale keys.
Neither hook nor storage wiring proves native screen interaction acceptance.

## Web editor presentation

Expose the private editor at `/technician` from the authenticated home screen.
Use an overview with contact, service area, work preferences and availability
sections; edit one weekly rule at a time. Keep text-based local time/date inputs
so incomplete values survive, with explicit format hints. Search timezone choices
without losing the selected value. Show localized weekdays and choice labels.
Validation opens the appropriate section and focuses its first invalid control.
Removal uses a controlled dialog naming the weekday; denial closes the dialog
and clears its private context. Navigation awaits protected writes.

Conflict review lists differing fields, including selections and stable-key weekly
rules, with separate current/yours values and explicit keep/use-latest actions.
Never display raw JSON, internal rule keys or machine field codes. New/deleted
rules have localized absent values. Group comparison rows by localized weekday.

## Native presentation

The native route opens an overview with contact, service area, work and weekly
availability rows. Back from a rule returns to availability; Back from another
section returns to overview, and Back from overview awaits durable protection
before leaving. Validation opens the correct section and focuses text or opens
a searchable choice sheet. Weekday options exclude days already in use; service
and piano-form sheets allow multiple selections without dismissing after each.
Choice edits address immutable rule keys, not the screen's current section.

Use platform keyboards and an iOS Done accessory, safe-area sheets, theme colors,
large-type-compatible rows, labeled inputs and selected accessibility states.
Keep local time/date text intact during editing. Removal is a controlled modal
naming the weekday, dismissed with all private presentation on scope loss. A
stale confirmation cannot remove a different rule. Denied navigation awaits
cleanup and remains escapable. Conflict review shows localized field differences.

After a completed save retry or successful navigation-protection attempt, clear
the presentation-only storage warning from earlier failed navigation. Current
editor storage failures remain authoritative and visible; a pending or failed
write must never be reported as saved. Acceptance must hold a real native SQLite
write lock, verify blocked Back/save and retained input, release it, then verify
retry persistence and removal of the stale warning on the current/parent screen.
