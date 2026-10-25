# Reversible inventory voice proposals

Implements the typed proposal boundary for VO-02. This is not transcription or
recording acceptance. Behavior was compared with the legacy additive-proposal
test; no legacy source or tests are imported.

A proposal is transient private data derived from a bounded transcript. Each
candidate names exactly one of the 18 editable inventory attributes, carries one
typed value (text, boolean, money or partial manufacturing date), confidence
`high` or `uncertain`, and a bounded verbatim evidence excerpt from the transcript.
Evidence supports review; it is not proof that a model is correct. Unknown fields,
duplicate fields, wrong value variants, invalid enum/date/money values, malformed
Unicode or ungrounded evidence reject the entire proposal. Transcript is at most
16,000 Unicode code points; evidence is at most 600. Neither belongs in audit or
ordinary logs. Null/absent and whitespace-only suggestions are ignored and never
erase existing data; explicit false and zero are meaningful.

Allowed fields are stock number, title, featured, form, player system, condition,
make, model, serial, manufactured date, size, finish, asking price, price visibility,
location, description, acquisition cost and private notes. There is no value type
or command for identity, dealer scope, revision, lifecycle, publication, photos,
permissions or scan tokens. Application access/audit policy remains mandatory
when obtaining proposals or saving accepted changes.

Application is an explicit selection of candidate fields against the current
private attributes. Unselected suggestions never change the draft. A change set
captures only actually changed fields and private before/after values. Undo
restores an affected field only if its current value still equals the applied
value; later manual edits survive and are reported as conflicts for review.
Unrelated edits always survive. Proposal and change-set accessors deep-copy nested
values so callers cannot alter later apply/undo behavior. Invalid selection or
attributes fail atomically. Domain proposal application does not save, publish,
change status or emit a substitute for the authenticated mutation audit.

Recording, server transcription/extraction, cancellation, field review/clarification
UI, provenance-aware autosave/Undo and native microphone acceptance remain required
before VO-01/VO-02 can be marked complete.

## Authorized transcript extraction

A request names one dealer record and its expected revision. Before sending a
transcript to the injected extractor, require current inventory-write authority,
principal limiting, and an audited actor/dealer-scoped record read. Reject stale
revisions and invalid/overlong transcripts before provider work. The extractor
receives only the bounded transcript, never session credentials or inventory
private fields. It returns untrusted typed candidates; the domain validates them
and composition rejects unsupported currencies. Provider failure exposes only a
fixed unavailable error, never a provider response or echoed transcript.

After extraction, repeat authorization and the audited scoped read. Revocation,
account/session change, missing record, dependency failure or changed revision
suppresses the proposal. Cancellation suppresses results as well. Extraction
never persists inventory, transcript or proposals; applying reviewed fields must
use the separately authorized revision mutation. This application boundary does
not yet expose an HTTP route or configure a production provider.

## Shared client proposal review

Client review operates on the raw inventory form, preserving incomplete manual
input in unrelated fields. Validate the complete transient proposal before showing
or applying it: exact shape, revision, bounded transcript/evidence, unique allowed
fields, one correctly typed canonical value, supported currency and valid date.
No lifecycle, photo or private context data may be added to the wire shape.

Applying requires an explicit field selection and the form snapshot shown during
review. Compare each selected field group with the current form: any intervening
manual edit rejects the whole application and identifies conflicts for renewed
review. Price amount/currency and manufacturing year/month/day are atomic groups.
Format proposed prices exactly from minor units using the current decimal style;
preserve false, zero and date precision. Unselected and invalid partial manual
input stays byte-for-byte unchanged. Unsupported, duplicate or unknown selections
fail atomically. All snapshots and proposals are copied.

Undo restores only groups still equal to their applied values and reports later
manual edits as conflicts, preserving unrelated changes. This controller does not
save or publish; presentation must pass accepted form changes through the existing
durable workspace. Session/scope lifetime, recording, transport, review UI and
voice provenance in saves remain separately required.

## Account-bound voice workflow

A framework-independent workflow is bound to one account, dealer and existing
private record. Recording permission and microphone lifetime remain platform
responsibilities. Processing accepts one bounded copied audio result at a time,
transcribes then extracts with the current revision, and never starts overlapping
requests. Cancellation clears visible private data immediately but a separate busy
guard remains until the aborted provider promise settles; immediate restart cannot
overlap it. Typed/revised transcript extraction is available without recording.
Every async completion rechecks scope and revision; scope loss, cancellation and
disposal clear private state, abort outstanding work and ignore late completions.
Revision drift rejects the proposal. Extraction failure may retain the transcript
for explicit correction/retry, without retaining raw audio or automatically retrying.

A successful proposal captures the current raw form for review. Explicit Apply
uses only selected fields and the reviewed snapshot, through the existing form
change port; no save or publication request is issued by this workflow. Conflicts
preserve the proposal for renewed review. Undo uses its conditional field groups
against the current raw form and passes the resulting change through the same
port. The form-change port must acknowledge synchronous local acceptance; rejection
changes nothing and retains the proposal or retryable Undo. Applied means local
form application, never durable/server save success.
Review refresh is explicit; stale revision requires re-extraction. Subscriptions
and snapshots return private copies and cannot mutate workflow state. An observer
may cancel/dispose during state notification; no subsequent provider work may start.
