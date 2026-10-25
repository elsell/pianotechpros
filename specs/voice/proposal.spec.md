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
