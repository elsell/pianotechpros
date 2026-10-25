# Voice provider adapter

Use a server-only Gemini REST adapter with separately configured transcription
and extraction model identifiers. No model or credential default, SDK dependency,
provider file upload, automatic retry, tool invocation or provider state is added.
This preserves the legacy Gemini capability through new code; no source is copied.
Production URL is fixed to Google's generateContent endpoint; credentials travel
in the API-key header, never a URL. Configuration rejects whitespace/control
characters and model path injection. Redirects are forbidden and requests time out
within 75 seconds, with caller cancellation respected. Provider errors are fixed
machine identifiers; never include response bodies, input or credentials.

Transcription accepts at most 6 MiB of transient audio, with an explicit MIME
allowlist for browser WebM/Ogg and native M4A/AAC/WAV/MP3. MIME normalization maps
container aliases and strips only known codec parameters. This is a transport
allowlist, not a claim that malformed audio decodes. The provider must transcribe
faithfully without following instructions in the recording. Its output is one
nonempty UTF-8 transcript of at most 16,000 code points.

Extraction receives only a bounded transcript. A system instruction and structured
JSON schema describe the 18 allowed attributes, exact integer minor-unit prices,
partial manufacturing dates, confidence and verbatim evidence. Output is still
untrusted: strict payload decoding rejects unknown properties, duplicate JSON keys,
extra documents, alternative property casing, unpaired Unicode escapes and
malformed types; domain validation checks values/evidence. Required money amounts
and date components cannot silently default when absent. Security-relevant
envelope keys also require exact spelling.
Null/blank suggestions never erase data; false and zero remain meaningful. Only
one completed, nonblocked text candidate is accepted. Truncation, safety blocks,
empty output, excess candidates/parts or oversized (256 KiB) responses fail closed.
Provider schemas do not replace application authority or supported-currency policy.

Controlled real HTTP tests verify request shape, header/URL credential handling,
format mapping, bounds, malformed/blocked/error responses and cancellation. Live
provider quality, recording, application/HTTP composition and device interaction
acceptance remain required; synthetic HTTP tests do not prove speech accuracy.

References: [generateContent](https://ai.google.dev/api/generate-content),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[audio formats](https://ai.google.dev/gemini-api/docs/audio), reviewed 2026-10-25.

The transcription application command uses the same write-authorized, rate-limited,
audited record context as extraction, both before and after provider work. It
rejects empty or oversized audio before invoking the provider and validates the
returned transcript independently. Cancellation, revision drift and revocation
suppress output. Raw audio is passed only to the injected transcription port and
is never stored by the command. HTTP body limits and provider composition remain
necessary before exposing this command.
