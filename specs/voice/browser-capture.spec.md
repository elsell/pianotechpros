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
