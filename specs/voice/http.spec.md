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
