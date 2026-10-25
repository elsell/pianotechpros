# Authenticated voice API

POST /v1/dealers/{dealerID}/inventory/{id}/voice/transcribe accepts a bounded
binary audio body, Content-Type and expectedRevision query parameter. The
application authenticates and authorizes the record before reading any bytes,
reads at most 6 MiB plus an overflow probe, and treats read/size failures as
non-success without calling the provider. POST at the same base /extract accepts
a bounded JSON transcript and expectedRevision. Both return a data envelope with
the unchanged record revision; extraction returns typed candidates and transcript.
Neither endpoint saves inventory. Explicit user review remains mandatory.

Use opaque application sessions, current write permission, coordinated principal
limits and audited scoped reads before and after provider processing. All routes
are sensitive-input, no-store and no-referrer, with redacted stable errors. Invalid
provider data never reaches a successful response. HTTP tests cover missing/bad
credentials, cross-dealer denial, revocation, stale revision, disabled provider,
read failures, oversized requests and legitimate access. Transcription denial must
not consume its request body. Processing may take 75 seconds; use a 90-second
route write deadline while retaining ordinary request deadlines elsewhere.

Voice configuration is optional and fails closed: all three of GEMINI_API_KEY,
VOICE_TRANSCRIPTION_MODEL and VOICE_EXTRACTION_MODEL (PIANOTECHPROS_ prefix) must
be provided together. No credentials or model defaults are committed. Validate
before listeners start. Compose the provider in a project-owned registration,
leaving the generated registry untouched. OpenAPI always advertises the contract;
unconfigured authenticated requests receive service unavailable. The browser or
native client never receives provider configuration or keys.

## Shared voice transport

The generated-contract client uses a fresh opaque session per request, no browser
credentials/cache, and rejects redirects. Audio is synchronously copied before
asynchronous credential acquisition, bounded to 6 MiB, sent as binary with its
validated browser/native MIME type, and never retried automatically. Both calls
accept cancellation. Errors expose only a fixed category and status, never raw
server/provider bodies. Cancellation is distinct from network failure.

Validate local scope and revision before network work. Responses must be HTTP 200,
match the requested revision, and contain a bounded canonical transcript. An
extraction response must match the submitted transcript exactly and pass strict
field/value/evidence validation for all 18 editable attributes. Reject injected
properties, duplicate fields, unsupported currencies, invalid dates, unsafe money,
wrong value variants, blank suggestions and malformed Unicode. Transport validation
and shared review validation remain independent defenses. No save or publication
operation is added to the voice client.
