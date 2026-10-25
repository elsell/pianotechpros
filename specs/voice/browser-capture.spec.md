# Browser voice capture

The inventory voice control requests microphone access only after an explicit
Record action. Capture is local: this adapter has no transport, credentials,
storage, transcript, or inventory mutation capability. The caller explicitly
hands completed audio to the authorized voice workflow.

States are idle, requesting, recording, stopping and failed. Errors are stable
codes for unsupported capture, denied permission, unavailable device, failed
capture and size limit; browser error messages are never product copy.
Stop completes one recording; Cancel discards it. Duplicate starts are ignored.
Capture is bounded to sixty seconds and six MiB. The duration limit stops and
returns the bounded recording; exceeding the byte limit discards it. The
adapter selects a supported audio-only WebM/Opus, Ogg/Opus or MP4 encoding.

Cancel, disposal, page hiding and device loss release every microphone track
and discard pending audio. A late permission grant after cancellation must
immediately release its tracks without starting a recorder. Permission requests
cannot be cancelled by the browser API, so another request is suppressed until
the previous request settles. Disposal removes lifecycle listeners. Completion
and state callbacks cannot resurrect cancelled/disposed capture.

The capability adapter is pinned in the existing client boundary manifest.
Real Chromium acceptance with its synthetic microphone verifies encoded audio,
explicit stop, cancellation, disposal, pagehide cleanup and denied permission.
This is browser API acceptance, not real-microphone or Safari device acceptance.

References: MDN MediaRecorder and MediaDevices.getUserMedia documentation.

## Microphone input feedback

While recording, show a compact input-level meter derived from the active
microphone, never a decorative animation or playback. Normalize measured decibels
to a bounded 0–100 display with a -60 dB floor; missing or invalid measurements
show a localized unavailable state without stopping a valid recording. Silence
is zero. Refresh at most eight times per second; do not announce every change
through a screen-reader live region. Give the meter a localized accessible name
and current bounded value. Stop, cancellation, interruption and disposal clear
the level and stop sampling; late callbacks cannot revive it. Measurements and
waveform buffers remain transient and never enter API requests, logs or recovery.
Browser analysis must not connect the microphone to speakers, and failed analysis
must not prevent recording. Release the audio context and nodes with capture.

Only the reviewed `voice-input-meter.ts` adapter may construct AudioContext and
Float32Array for local analysis. The structural transport gate still rejects
fetch, sockets, workers and arbitrary transport imports in this adapter. The
recorder's protected source digest must be reviewed when its wiring changes.
